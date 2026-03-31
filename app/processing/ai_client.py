"""AI client for LLM interactions"""
import asyncio
import logging
import random
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
        self.request_timeout_seconds = 20
        self.max_retries = 3
        self.retry_base_delay_seconds = 0.5
        
        # Determine settings source
        if user and user.use_global_ai_config:
            # Try to fetch from database SystemSettings first
            sys_settings = None
            if db:
                sys_settings = db.query(SystemSettings).first()
            
            if sys_settings:
                # Use settings from Admin Dashboard (DB)
                self.provider = sys_settings.global_ai_provider or settings.GLOBAL_AI_PROVIDER
                self.ai_model_name = sys_settings.global_ai_model or settings.GLOBAL_AI_MODEL or None
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
                self.ai_model_name = settings.GLOBAL_AI_MODEL or None
                self.gemini_key = settings.GLOBAL_GEMINI_API_KEY if self.provider == "gemini" else None
                self.hf_token = settings.GLOBAL_HUGGINGFACE_TOKEN if self.provider == "huggingface" else None
                self.ollama_base_url = None
                logger.info(f"[User {user.id}] Using Global AI settings (.env managed): {self.provider}")
            
        elif user and user.ai_provider:
            # Use user's personal settings
            self.provider = user.ai_provider
            self.ai_model_name = user.ai_model or None
            user_key = decrypt_secret(user.ai_api_key)
            self.gemini_key = user_key if self.provider == "gemini" else None
            self.hf_token = user_key if self.provider == "huggingface" else None
            self.ollama_base_url = user.ai_base_url if self.provider == "ollama" else None
            logger.info(f"[User {user.id}] Using personal AI settings: {self.provider}")
            
        else:
            # Fallback to system defaults (no user or user has no settings)
            self.provider = settings.AI_PROVIDER
            self.ai_model_name = None
            self.gemini_key = settings.GEMINI_API_KEY
            self.hf_token = settings.HUGGINGFACE_TOKEN
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
                return await asyncio.wait_for(operation(), timeout=self.request_timeout_seconds)
            except Exception as exc:
                last_error = exc
                if attempt >= self.max_retries:
                    break

                # Exponential backoff with jitter to avoid retry storms
                jitter = random.uniform(0.0, 0.2)
                delay = (self.retry_base_delay_seconds * (2 ** (attempt - 1))) + jitter
                logger.warning(
                    "AI provider call failed; retrying",
                    extra={
                        "provider": self.provider,
                        "operation": operation_name,
                        "attempt": attempt,
                        "max_retries": self.max_retries,
                        "error": str(exc),
                    },
                )
                await asyncio.sleep(delay)

        raise RuntimeError(
            f"{operation_name} failed after {self.max_retries} attempts"
        ) from last_error
    def _init_gemini(self):
        """Initialize Gemini API and dynamically select the best model."""
        try:
            import google.generativeai as genai
            genai.configure(api_key=self.gemini_key)

            if self.ai_model_name:
                # Use user-specified model
                model_name = self.ai_model_name
            else:
                # Dynamically find the best model
                model_name = "gemini-1.5-flash"  # Fallback
                best_model = None
                for m in genai.list_models():
                    if 'generateContent' in m.supported_generation_methods:
                        # Prefer 'flash' models that are not preview
                        if "flash" in m.name and "preview" not in m.name:
                            best_model = m.name
                            break # Found a good one
                
                if best_model:
                    model_name = best_model
                    logger.info(f"Dynamically selected Gemini model: {model_name}")
                else:
                    logger.warning(f"Could not dynamically find a suitable model, falling back to {model_name}")

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
            self.client = InferenceClient(api_key=self.hf_token)
            logger.info("Hugging Face AI initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Hugging Face: {e}")
            self.client = None
            self.connection_error = f"[HUGGINGFACE] Connection failed: {e}"
    
    async def generate_text(self, prompt: str, max_tokens: int = 500) -> str:
        """Generate text response"""
        try:
            if self.provider == "gemini":
                if self.model is None:
                    return self.connection_error or "[GEMINI] Gemini AI is not properly initialized. Please check your API key."
                
                # Add generation config for max_tokens
                generation_config = {}
                if max_tokens:
                    import google.generativeai as genai
                    generation_config = genai.types.GenerationConfig(max_output_tokens=max_tokens)

                async def _gemini_call():
                    # Gemini SDK call is sync; run in thread so event loop is not blocked.
                    return await asyncio.to_thread(
                        self.model.generate_content,
                        prompt,
                        generation_config=generation_config,
                    )

                response = await self._with_retries_and_timeout("gemini.generate_content", _gemini_call)
                return response.text
            elif self.provider == "huggingface":
                kwargs = {"max_new_tokens": max_tokens}
                if self.ai_model_name:
                    kwargs["model"] = self.ai_model_name

                async def _huggingface_call():
                    # HF inference client call is sync; run in thread to prevent blocking.
                    return await asyncio.to_thread(self.client.text_generation, prompt, **kwargs)

                response = await self._with_retries_and_timeout("huggingface.text_generation", _huggingface_call)
                return response
            elif self.provider == "ollama":
                model_name = self.ai_model_name if self.ai_model_name else "llama3"
                url = f"{self.ollama_base_url.rstrip('/')}/api/generate"
                payload = {
                    "model": model_name,
                    "prompt": prompt,
                    "stream": False
                }

                async def _ollama_call() -> str:
                    timeout = aiohttp.ClientTimeout(total=self.request_timeout_seconds)
                    async with aiohttp.ClientSession(timeout=timeout) as session:
                        async with session.post(url, json=payload) as response:
                            if response.status == 200:
                                result = await response.json()
                                return result.get("response", "")

                            error_text = await response.text()
                            raise RuntimeError(
                                f"Ollama API error ({response.status}): {error_text[:300]}"
                            )

                try:
                    return await self._with_retries_and_timeout("ollama.generate", _ollama_call)
                except Exception as ollama_error:
                    logger.error(
                        "Ollama provider request failed",
                        extra={
                            "provider": self.provider,
                            "base_url": self.ollama_base_url,
                            "error": str(ollama_error),
                        },
                    )
                    return f"Provider Error: Failed to generate response from Local Ollama ({str(ollama_error)})"
        except Exception as e:
            error_msg = f"[{self.provider.upper()}] Connection failed: {str(e)}"
            if self.provider == "ollama":
                error_msg = f"[OLLAMA] Failed to connect to {self.ollama_base_url}: {str(e)}. Please ensure Ollama is running at the configured address."
            logger.error(error_msg)
            return error_msg
    
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
