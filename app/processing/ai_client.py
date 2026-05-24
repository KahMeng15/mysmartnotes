"""AI client for LLM interactions"""
import asyncio
import logging
import random
import re
from typing import Optional, List, Callable, TypeVar, Awaitable
from app.config import get_settings
from app.models.db import User, SystemSettings
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)
settings = get_settings()
T = TypeVar("T")


class AIClient:
    """Unified AI client for Gemini, Hugging Face, and local Ollama"""
    
    def __init__(self, user: Optional[User] = None, db: Optional[Session] = None):
        self.user = user
        self.db = db
        self.connection_error = None
        self.model = None
        self.client = None
        self.request_timeout_seconds = 240
        self.max_retries = 3
        self.retry_base_delay_seconds = 1.0
        
        # Settings resolution
        if user and user.use_global_ai_config:
            sys_settings = db.query(SystemSettings).first() if db else None
            if sys_settings:
                self.provider = settings.GLOBAL_AI_PROVIDER or sys_settings.global_ai_provider
                self.ai_model_name = settings.GLOBAL_AI_MODEL or sys_settings.global_ai_model or "models/gemma-4-31b-it"
                self.reasoning_level = settings.GLOBAL_REASONING_LEVEL or "medium"
                self.gemini_key = settings.GLOBAL_GEMINI_API_KEY
                self.hf_token = settings.GLOBAL_HUGGINGFACE_TOKEN
                self.ollama_base_url = sys_settings.global_ai_base_url if self.provider == "ollama" else settings.OLLAMA_BASE_URL
            else:
                self.provider = settings.GLOBAL_AI_PROVIDER
                self.ai_model_name = settings.GLOBAL_AI_MODEL or "models/gemma-4-31b-it"
                self.reasoning_level = settings.GLOBAL_REASONING_LEVEL or "medium"
                self.gemini_key = settings.GLOBAL_GEMINI_API_KEY
                self.hf_token = settings.GLOBAL_HUGGINGFACE_TOKEN
                self.ollama_base_url = settings.OLLAMA_BASE_URL
        elif user and user.ai_provider:
            self.provider = user.ai_provider
            self.ai_model_name = user.ai_model or "models/gemma-4-31b-it"
            self.reasoning_level = settings.GLOBAL_REASONING_LEVEL or "medium"
            self.gemini_key = settings.GLOBAL_GEMINI_API_KEY or settings.GEMINI_API_KEY
            self.hf_token = settings.GLOBAL_HUGGINGFACE_TOKEN or settings.HUGGINGFACE_TOKEN
            self.ollama_base_url = user.ai_base_url if self.provider == "ollama" else settings.OLLAMA_BASE_URL
        else:
            self.provider = settings.GLOBAL_AI_PROVIDER or settings.AI_PROVIDER
            self.ai_model_name = settings.GLOBAL_AI_MODEL or "models/gemma-4-31b-it"
            self.reasoning_level = settings.GLOBAL_REASONING_LEVEL or "medium"
            self.gemini_key = settings.GLOBAL_GEMINI_API_KEY or settings.GEMINI_API_KEY
            self.hf_token = settings.GLOBAL_HUGGINGFACE_TOKEN or settings.HUGGINGFACE_TOKEN
            self.ollama_base_url = settings.OLLAMA_BASE_URL
        
        if self.provider == "gemini": self._init_gemini()
        elif self.provider == "huggingface": self._init_huggingface()

    async def _with_retries_and_timeout(self, operation_name: str, operation: Callable[[], Awaitable[T]]) -> T:
        last_error: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return await asyncio.wait_for(operation(), timeout=self.request_timeout_seconds)
            except Exception as exc:
                last_error = exc
                if attempt < self.max_retries:
                    await asyncio.sleep(self.retry_base_delay_seconds * (2 ** (attempt - 1)))
        raise RuntimeError(f"{operation_name} failed") from last_error

    def _init_gemini(self):
        try:
            import google.generativeai as genai
            if not self.gemini_key: return
            genai.configure(api_key=self.gemini_key)
            self.model = genai.GenerativeModel(self.ai_model_name)
        except Exception: self.model = None

    def _init_huggingface(self):
        try:
            from huggingface_hub import InferenceClient
            if not self.hf_token: return
            self.client = InferenceClient(api_key=self.hf_token)
        except Exception: self.client = None

    def _extract_polished_answer(self, text: str) -> str:
        """Surgically extract the final answer from reasoning/meta-talk."""
        if not text: return ""
        
        # 1. Clean explicit tags
        text = re.sub(r'<\|channel\|>thought.*?<channel\|>', '', text, flags=re.DOTALL)
        text = re.sub(r'<\|thought\|>.*?</\|thought\|>', '', text, flags=re.DOTALL)
        text = text.replace("<|channel|>thought", "").replace("<channel|>", "").replace("<|thought|>", "").replace("</|thought|>", "")

        # 2. Extract after markers (strongest signal)
        for marker in ["===START===", "Final Answer:", "Answer:", "ANSWER:"]:
            if marker in text:
                parts = text.split(marker)
                if len(parts) > 1:
                    candidate = parts[-1].strip()
                    if len(candidate) > 5: return candidate

        # 3. Detect and skip reasoning blocks (Look from bottom up)
        if text.lstrip().startswith("*") or "Context:" in text[:400] or "Question:" in text[:400] or "Wait," in text[:200]:
            lines = text.split("\n")
            meta_keywords = ["Context:", "Question:", "Constraint:", "Task:", "Wait,", "Actually,", "Let me", "Draft", "Final Check", "Source:", "Check constraints", "Let's check", "Final version:"]
            
            for i in range(len(lines) - 1, -1, -1):
                clean = lines[i].strip()
                if not clean: continue
                is_meta = clean.startswith("*") or clean.startswith("-") or any(k in clean for k in meta_keywords)
                if not is_meta and len(clean) > 25 and clean[0].isupper() and not clean.endswith(":"):
                    start_idx = i
                    while start_idx > 0:
                        prev = lines[start_idx-1].strip()
                        if not prev: start_idx -= 1; continue
                        if prev.startswith("*") or prev.startswith("-") or any(k in prev for k in meta_keywords): break
                        start_idx -= 1
                    return "\n".join(lines[start_idx:]).strip()

        return text.strip()

    async def generate_text(self, prompt: str, max_tokens: int = 500, system_instruction: Optional[str] = None) -> str:
        """Unary generation - SDK call followed by structural cleanup."""
        try:
            is_gemma4 = self.provider == "gemini" and self.model and "gemma-4" in self.model.model_name.lower()
            if is_gemma4:
                instr = f"\nREASONING DEPTH: {self.reasoning_level.upper()}\n"
                prompt = prompt.replace("===START===", instr + "===START===") if "===START===" in prompt else instr + prompt

            if self.provider == "gemini":
                import google.generativeai as genai
                cfg = genai.types.GenerationConfig(max_output_tokens=max_tokens, temperature=0.7)
                active_model = genai.GenerativeModel(self.model.model_name, system_instruction=system_instruction) if system_instruction else self.model
                
                async def _gemini_call():
                    return await asyncio.to_thread(active_model.generate_content, prompt, generation_config=cfg)

                res = await self._with_retries_and_timeout("gemini.generate_content", _gemini_call)
                if res.candidates and res.candidates[0].content.parts:
                    parts = res.candidates[0].content.parts
                    # If multi-part, take last. Else take all joined.
                    text = parts[-1].text if len(parts) > 1 else "".join(p.text for p in parts if hasattr(p, 'text'))
                    return self._extract_polished_answer(text)
            
            return "" # Fallback
        except Exception as e:
            logger.error(f"Generate failed: {e}")
            return ""

    async def stream_text(self, prompt: str, max_tokens: int = 500, system_instruction: Optional[str] = None):
        """Stream generation - yields the polished result once at the end for reasoning models."""
        try:
            is_gemma4 = self.provider == "gemini" and self.model and "gemma-4" in self.model.model_name.lower()
            if is_gemma4:
                instr = f"\nREASONING DEPTH: {self.reasoning_level.upper()}\n"
                prompt = prompt.replace("===START===", instr + "===START===") if "===START===" in prompt else instr + prompt

            if self.provider == "gemini":
                import google.generativeai as genai
                cfg = genai.types.GenerationConfig(max_output_tokens=max_tokens, temperature=0.7)
                active_model = genai.GenerativeModel(self.model.model_name, system_instruction=system_instruction) if system_instruction else self.model
                
                async def _gemini_stream():
                    return await asyncio.to_thread(active_model.generate_content, prompt, generation_config=cfg, stream=True)

                response_stream = await self._with_retries_and_timeout("gemini.stream_content", _gemini_stream)
                all_parts = []
                for chunk in response_stream:
                    if chunk.candidates and chunk.candidates[0].content.parts:
                        for part in chunk.candidates[0].content.parts:
                            if hasattr(part, 'text'): all_parts.append(part.text)

                if is_gemma4 and len(all_parts) > 1:
                    yield self._extract_polished_answer(all_parts[-1])
                else:
                    yield self._extract_polished_answer("".join(all_parts))

            else: yield await self.generate_text(prompt, max_tokens)
        except Exception as e:
            logger.error(f"Stream failed: {e}")
            yield f"Stream failed: {e}"

    async def answer_question(self, context: str, question: str, system_prompt: Optional[str] = None) -> str:
        prompt = system_prompt if system_prompt else f"Context:\n{context}\n\nQuestion:\n{question}\n\nAnswer:"
        return await self.generate_text(prompt)
    
    async def generate_quiz(self, content: str, num_questions: int = 5) -> List[dict]:
        prompt = f"Generate {num_questions} quiz questions (JSON): {content}"
        res = await self.generate_text(prompt)
        try: import json; return json.loads(res)
        except: return []

    async def generate_summary(self, content: str, mode: str = "elaborate", output_format: str = "sentence") -> str:
        prompt = f"Summarize {mode} as {output_format}:\n{content}"
        return await self.generate_text(prompt, max_tokens=1000)

def get_ai_client(user: Optional[User] = None, db: Optional[Session] = None) -> AIClient:
    return AIClient(user=user, db=db)
