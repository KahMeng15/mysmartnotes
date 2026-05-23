"""AI client for LLM interactions"""
import asyncio
import logging
import random
import re
from typing import Optional, List, Callable, TypeVar, Awaitable
from app.config import get_settings
from app.models.db import User, SystemSettings
from app.utils.crypto import decrypt_secret
from sqlalchemy.orm import Session
import aiohttp

logger = logging.getLogger(__name__)
settings = get_settings()
T = TypeVar("T")


class AIClient:
    """Unified AI client for Gemini, Hugging Face, and local Ollama
    
    Settings Priority:
    1. User personal settings (if use_global_ai_config=False)
    2. Global settings from DB/Administrator (if use_global_ai_config=True)
    3. Global settings from environment (fallback if DB is empty)
    """
    
    def __init__(self, user: Optional[User] = None, db: Optional[Session] = None):
        self.user = user
        self.db = db
        self.connection_error = None
        self.model = None
        self.client = None
        # Production-safe request controls for external providers
        # Increased to 240s to accommodate slow reasoning models like Gemma 4
        self.request_timeout_seconds = 240
        self.max_retries = 3
        self.retry_base_delay_seconds = 1.0
        
        # Determine settings source
        if user and user.use_global_ai_config:
            # Try to fetch from database SystemSettings first
            sys_settings = None
            if db:
                sys_settings = db.query(SystemSettings).first()
            
            if sys_settings:
                # Use settings from Admin Dashboard (DB)
                self.provider = settings.GLOBAL_AI_PROVIDER or sys_settings.global_ai_provider
                self.ai_model_name = settings.GLOBAL_AI_MODEL or sys_settings.global_ai_model or "models/gemma-4-31b-it"
                self.reasoning_level = settings.GLOBAL_REASONING_LEVEL or "medium"
                global_key = decrypt_secret(sys_settings.global_ai_api_key)
                self.gemini_key = global_key if self.provider == "gemini" else None
                self.hf_token = global_key if self.provider == "huggingface" else None
                self.ollama_base_url = sys_settings.global_ai_base_url if self.provider == "ollama" else None
                
                # Fallback check: if DB key is empty, use .env key
                if self.provider == "gemini" and not self.gemini_key:
                    self.gemini_key = settings.GLOBAL_GEMINI_API_KEY
                if self.provider == "huggingface" and not self.hf_token:
                    self.hf_token = settings.GLOBAL_HUGGINGFACE_TOKEN
                
                logger.info(f"[User {user.id}] Using Global AI settings (DB/Admin managed): {self.provider}")
            else:
                # Use global settings from environment as absolute fallback
                self.provider = settings.GLOBAL_AI_PROVIDER
                self.ai_model_name = settings.GLOBAL_AI_MODEL or "models/gemma-4-31b-it"
                self.reasoning_level = settings.GLOBAL_REASONING_LEVEL or "medium"
                self.gemini_key = settings.GLOBAL_GEMINI_API_KEY if self.provider == "gemini" else None
                self.hf_token = settings.GLOBAL_HUGGINGFACE_TOKEN if self.provider == "huggingface" else None
                self.ollama_base_url = None
                logger.info(f"[User {user.id}] Using Global AI settings (.env managed): {self.provider}")
            
        elif user and user.ai_provider:
            # Use user's personal settings
            self.provider = user.ai_provider
            self.ai_model_name = user.ai_model or "models/gemma-4-31b-it"
            self.reasoning_level = settings.GLOBAL_REASONING_LEVEL or "medium" # Use system default for now
            user_key = decrypt_secret(user.ai_api_key)
            self.gemini_key = user_key if self.provider == "gemini" else None
            self.hf_token = user_key if self.provider == "huggingface" else None
            self.ollama_base_url = user.ai_base_url if self.provider == "ollama" else None
            logger.info(f"[User {user.id}] Using personal AI settings: {self.provider}")
            
        else:
            # Fallback to system defaults (no user or user has no settings)
            self.provider = settings.GLOBAL_AI_PROVIDER or settings.AI_PROVIDER
            self.ai_model_name = settings.GLOBAL_AI_MODEL or "models/gemma-4-31b-it"
            self.reasoning_level = settings.GLOBAL_REASONING_LEVEL or "medium"
            self.gemini_key = settings.GLOBAL_GEMINI_API_KEY or settings.GEMINI_API_KEY
            self.hf_token = settings.GLOBAL_HUGGINGFACE_TOKEN or settings.HUGGINGFACE_TOKEN
            self.ollama_base_url = settings.OLLAMA_BASE_URL
            logger.info(f"Using system fallback AI settings: {self.provider}")
        
        # Initialize the selected provider
        if self.provider == "gemini":
            self._init_gemini()
        elif self.provider == "huggingface":
            self._init_huggingface()
        elif self.provider == "ollama":
            logger.info(f"Ollama AI initialized (URL: {self.ollama_base_url})")

    async def _with_retries_and_timeout(self, operation_name: str, operation: Callable[[], Awaitable[T]]) -> T:
        """Run an async provider operation with bounded timeout and retries."""
        last_error: Optional[Exception] = None

        for attempt in range(1, self.max_retries + 1):
            try:
                t_start = asyncio.get_event_loop().time()
                result = await asyncio.wait_for(operation(), timeout=self.request_timeout_seconds)
                duration = (asyncio.get_event_loop().time() - t_start) * 1000.0
                logger.info(f"AI provider {operation_name} succeeded in {round(duration, 2)}ms (attempt {attempt})")
                return result
            except asyncio.TimeoutError:
                logger.warning(f"AI provider {operation_name} timed out after {self.request_timeout_seconds}s (attempt {attempt}/{self.max_retries})")
                last_error = RuntimeError(f"Timeout after {self.request_timeout_seconds}s")
            except Exception as exc:
                last_error = exc
                logger.warning(
                    f"AI provider {operation_name} failed; retrying",
                    extra={
                        "provider": self.provider,
                        "operation": operation_name,
                        "attempt": attempt,
                        "max_retries": self.max_retries,
                        "error": str(exc),
                    },
                )
            
            if attempt < self.max_retries:
                # Exponential backoff with jitter to avoid retry storms
                jitter = random.uniform(0.0, 0.2)
                delay = (self.retry_base_delay_seconds * (2 ** (attempt - 1))) + jitter
                await asyncio.sleep(delay)

        raise RuntimeError(
            f"{operation_name} failed after {self.max_retries} attempts"
        ) from last_error

    def _init_gemini(self):
        """Initialize Gemini API and dynamically select the best model."""
        try:
            import google.generativeai as genai
            if not self.gemini_key:
                logger.error("Gemini API key is missing")
                self.model = None
                self.connection_error = "[GEMINI] API key is missing. Please check your settings."
                return

            genai.configure(api_key=self.gemini_key)

            model_name = self.ai_model_name or settings.GLOBAL_AI_MODEL or "gemini-1.5-flash"
            
            # If the model name is an API key (accidental misconfiguration), fallback
            if model_name.startswith("AIza"):
                model_name = "gemini-1.5-flash"

            self.model = genai.GenerativeModel(model_name)
            logger.info(f"Gemini AI initialized with model: {self.model.model_name}")
        except Exception as e:
            logger.error(f"Failed to initialize Gemini: {e}")
            self.model = None
            self.connection_error = f"[GEMINI] Connection failed: {e}"
    
    def _init_huggingface(self):
        """Initialize Hugging Face"""
        try:
            from huggingface_hub import InferenceClient
            if not self.hf_token:
                logger.error("Hugging Face token is missing")
                self.client = None
                self.connection_error = "[HUGGINGFACE] API token is missing."
                return
            self.client = InferenceClient(api_key=self.hf_token)
            logger.info("Hugging Face AI initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Hugging Face: {e}")
            self.client = None
            self.connection_error = f"[HUGGINGFACE] Connection failed: {e}"
    
    async def generate_text(self, prompt: str, max_tokens: int = 500, system_instruction: Optional[str] = None) -> str:
        """Generate text response (unary)"""
        # Internal helper to collect stream if needed
        full_text = ""
        async for chunk in self.stream_text(prompt, max_tokens, system_instruction):
            full_text += chunk
        return full_text

    async def stream_text(self, prompt: str, max_tokens: int = 500, system_instruction: Optional[str] = None):
        """Stream text response with optional reasoning filtering"""
        try:
            is_gemma4 = False
            if self.provider == "gemini" and self.model:
                is_gemma4 = "gemma-4" in self.model.model_name.lower()
                
            if is_gemma4:
                reasoning_instruction = f"\nREASONING DEPTH: {self.reasoning_level.upper()}\n"
                if "===START===" in prompt:
                    prompt = prompt.replace("===START===", reasoning_instruction + "===START===")
                else:
                    prompt = reasoning_instruction + prompt

            if self.provider == "gemini":
                if self.model is None:
                    yield self.connection_error or "[GEMINI] AI not initialized."
                    return

                import google.generativeai as genai
                generation_config = genai.types.GenerationConfig(
                    max_output_tokens=max_tokens if max_tokens else None,
                    temperature=0.7
                )

                # Use temporary model if system instruction provided
                active_model = self.model
                if system_instruction:
                    active_model = genai.GenerativeModel(
                        self.model.model_name,
                        system_instruction=system_instruction
                    )

                # For reasoning models, we need to handle the "Thought Channel"
                # which often arrives in the first parts of the stream.
                
                async def _gemini_stream():
                    return await asyncio.to_thread(
                        active_model.generate_content,
                        prompt,
                        generation_config=generation_config,
                        stream=True
                    )

                response_stream = await self._with_retries_and_timeout("gemini.stream_content", _gemini_stream)
                
                reasoning_buffer = ""
                in_reasoning = False
                text_started = False

                for chunk in response_stream:
                    if not chunk.candidates:
                        continue
                    
                    candidate = chunk.candidates[0]
                    if not candidate.content or not candidate.content.parts:
                        continue

                    for part in candidate.content.parts:
                        if not hasattr(part, 'text'):
                            continue
                        
                        text = part.text
                        
                        if is_gemma4:
                            # Detect start/end of reasoning in the stream
                            if "<|channel|>thought" in text or "<|thought|>" in text:
                                in_reasoning = True
                                # If it's a mix, strip the reasoning part
                                text = re.sub(r'<\|channel\|>thought.*?<channel\|>', '', text, flags=re.DOTALL)
                                text = re.sub(r'<\|thought\|>.*?</\|thought\|>', '', text, flags=re.DOTALL)
                            
                            # If we are in reasoning mode but haven't seen the end tag in THIS part, 
                            # we might still be buffering reasoning.
                            # Standard Gemma 4 behavior: Reason is often the first Part.
                            if not text_started and not text.strip():
                                continue
                        
                        if text:
                            text_started = True
                            yield text

            elif self.provider == "huggingface":
                # Implementation for HF streaming if needed
                yield await self.generate_text(prompt, max_tokens)
            
            elif self.provider == "ollama":
                # Implementation for Ollama streaming
                yield await self.generate_text(prompt, max_tokens)

        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield f"[{self.provider.upper()}] Stream failed: {e}"

    async def answer_question(self, context: str, question: str, system_prompt: Optional[str] = None) -> str:
        """Answer question based on context with optional custom system prompt"""
        if system_prompt:
            prompt = system_prompt
        else:
            prompt = f"""Based on the following context, answer the question concisely.

Context:
{context}

Question:
{question}

Answer:"""
        return await self.generate_text(prompt)
    
    async def generate_quiz(self, content: str, num_questions: int = 5) -> List[dict]:
        """Generate quiz questions from content"""
        prompt = f"""Generate {num_questions} multiple choice quiz questions based on this content:

{content}

Format as JSON array with objects containing: question, options (array of 4), correct_answer (index)"""
        response = await self.generate_text(prompt)
        # Parse JSON response
        try:
            import json
            return json.loads(response)
        except:
            return []

    async def generate_summary(self, content: str, mode: str = "elaborate", output_format: str = "sentence") -> str:
        """Generate summary based on mode and format"""
        mode_prompts = {
            "quick": "Give me a quick, high-level summary.",
            "simple": "Summarize this in simple, easy-to-understand terms.",
            "normal": "Summarize this in a balanced way, with a moderate level of detail.",
            "elaborate": "Provide a thorough and detailed summary covering all key points.",
            "eli5": "Explain this to me like I'm five years old."
        }
        
        format_prompts = {
            "sentence": "Output the summary as a cohesive paragraph or a few sentences.",
            "pointform": "Output the summary as a list of bullet points.",
            "numbered_list": "Output the summary as a numbered list.",
            "table": "Output the summary in a Markdown table format."
        }
        
        prompt = f"""{mode_prompts.get(mode, mode_prompts['elaborate'])}
{format_prompts.get(output_format, format_prompts['sentence'])}

IMPORTANT: Do NOT include any introductory or concluding remarks such as "Here is a summary" or "Here is the information in point form". 
Output ONLY the summary content itself.

Content to summarize:
{content}

Summary:"""
        return await self.generate_text(prompt, max_tokens=1000)




# Global AI client instance wrapper
def get_ai_client(user: Optional[User] = None, db: Optional[Session] = None) -> AIClient:
    """Create AI client with user context"""
    return AIClient(user=user, db=db)
