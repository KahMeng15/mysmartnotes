"""AI client for LLM interactions"""
import os
import logging
from typing import Optional, List
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class AIClient:
    """Unified AI client for both Gemini and Hugging Face"""
    
    def __init__(self):
        self.provider = settings.AI_PROVIDER
        self.gemini_key = settings.GEMINI_API_KEY
        self.hf_token = settings.HUGGINGFACE_TOKEN
        
        if self.provider == "gemini":
            self._init_gemini()
        elif self.provider == "huggingface":
            self._init_huggingface()
    
    def _init_gemini(self):
        """Initialize Gemini API"""
        try:
            import google.generativeai as genai
            genai.configure(api_key=self.gemini_key)
            self.model = genai.GenerativeModel("gemini-pro")
            logger.info("Gemini AI initialized")
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
                response = self.client.text_generation(prompt, max_new_tokens=max_tokens)
                return response
        except Exception as e:
            logger.error(f"Error generating text: {e}")
            return "Error generating response"
    
    async def answer_question(self, context: str, question: str) -> str:
        """Answer question based on context"""
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


# Global AI client instance
ai_client: Optional[AIClient] = None


def get_ai_client() -> AIClient:
    """Get or create AI client"""
    global ai_client
    if ai_client is None:
        ai_client = AIClient()
    return ai_client
