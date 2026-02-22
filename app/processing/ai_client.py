"""AI client for LLM interactions"""
import os
import logging
from typing import Optional, List
from app.config import get_settings
from app.models.db import User
import aiohttp
import json

logger = logging.getLogger(__name__)
settings = get_settings()


class AIClient:
    """Unified AI client for Gemini, Hugging Face, and local Ollama"""
    
    def __init__(self, user: Optional[User] = None):
        self.user = user
        
        # Determine if using global settings
        use_global = user.use_global_ai_config if user else False
        
        # Priority: user settings (if not using global) > global settings > root settings
        if use_global and user:
            # Use global settings from environment
            self.provider = settings.GLOBAL_AI_PROVIDER
            self.gemini_key = settings.GLOBAL_GEMINI_API_KEY if settings.GLOBAL_AI_PROVIDER == "gemini" else None
            self.ai_model_name = settings.GLOBAL_AI_MODEL if settings.GLOBAL_AI_MODEL else None
            logger.info(f"User {user.id} using global AI settings: {self.provider}")
        else:
            # Use user's personal settings
            self.provider = user.ai_provider if user and user.ai_provider else settings.AI_PROVIDER
            self.gemini_key = user.ai_api_key if user and user.ai_provider == "gemini" and user.ai_api_key else settings.GEMINI_API_KEY
            self.ai_model_name = user.ai_model if user and user.ai_model else None
        
        self.hf_token = user.ai_api_key if user and user.ai_provider == "huggingface" and user.ai_api_key else settings.HUGGINGFACE_TOKEN
        
        # Ollama URL: must be explicitly configured (no default localhost)
        self.ollama_base_url = user.ai_base_url if user and user.ai_base_url else settings.OLLAMA_BASE_URL
        
        if self.provider == "gemini":
            self._init_gemini()
        elif self.provider == "huggingface":
            self._init_huggingface()
        elif self.provider == "ollama":
            logger.info("Local Ollama AI initialized")
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
    
    def _init_huggingface(self):
        """Initialize Hugging Face"""
        try:
            from huggingface_hub import InferenceClient
            self.client = InferenceClient(api_key=self.hf_token)
            logger.info("Hugging Face AI initialized")
        except Exception as e:
            logger.error(f"Failed to initialize Hugging Face: {e}")
    
    async def generate_text(self, prompt: str, max_tokens: int = 500) -> str:
        """Generate text response"""
        try:
            if self.provider == "gemini":
                response = self.model.generate_content(prompt)
                return response.text
            elif self.provider == "huggingface":
                kwargs = {"max_new_tokens": max_tokens}
                if self.ai_model_name:
                    kwargs["model"] = self.ai_model_name
                response = self.client.text_generation(prompt, **kwargs)
                return response
            elif self.provider == "ollama":
                model_name = self.ai_model_name if self.ai_model_name else "llama3"
                url = f"{self.ollama_base_url.rstrip('/')}/api/generate"
                payload = {
                    "model": model_name,
                    "prompt": prompt,
                    "stream": False
                }
                async with aiohttp.ClientSession() as session:
                    async with session.post(url, json=payload) as response:
                        if response.status == 200:
                            result = await response.json()
                            return result.get("response", "")
                        else:
                            error_text = await response.text()
                            logger.error(f"Ollama API error: {error_text}")
                            return f"Provider Error: Failed to generate response from Local Ollama ({response.status})"
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


# Global AI client instance wrapper
def get_ai_client(user: Optional[User] = None) -> AIClient:
    """Create AI client with user context"""
    return AIClient(user=user)
