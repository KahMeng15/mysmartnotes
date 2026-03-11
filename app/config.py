"""Configuration management"""
from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    """Application settings from environment variables
    
    AI Configuration Hierarchy:
    ===========================
    1. GLOBAL_* settings: Administrator-managed defaults for all users
       - Used when user enables "Use Global AI Settings" in their profile
       - Recommended for most users in managed environments
    
    2. User personal settings: Individual user configurations (stored in DB)
       - Used when user disables "Use Global AI Settings"
       - Allows users to use their own API keys and providers
    
    3. Fallback settings: System-wide defaults (GEMINI_API_KEY, AI_PROVIDER, etc.)
       - Used only when user has no personal settings and not using global
       - Typically not used in production environments
    """
    
    # Database
    DATABASE_URL: str = "sqlite:///./data/app.db"
    
    # JWT Security
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # Admin Bootstrap
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""
    
    # ============================================
    # Global AI Configuration (Administrator-managed)
    # ============================================
    GLOBAL_AI_PROVIDER: str = "gemini"  # Options: gemini, huggingface, ollama
    GLOBAL_GEMINI_API_KEY: str = ""     # API key for global Gemini usage
    GLOBAL_HUGGINGFACE_TOKEN: str = ""  # API token for global Hugging Face usage
    GLOBAL_AI_MODEL: str = ""           # Optional: specific model name (leave empty for auto-select)
    
    # ============================================
    # Fallback AI Settings (System defaults)
    # ============================================
    GEMINI_API_KEY: str = ""            # Fallback Gemini API key
    HUGGINGFACE_TOKEN: str = ""         # Fallback Hugging Face token
    AI_PROVIDER: str = "gemini"         # Fallback provider
    OLLAMA_BASE_URL: str = ""           # Ollama server URL (e.g., "http://192.168.1.100:11434")
    

    # Firebase Cloud Configuration
    FIREBASE_API_KEY: str = ""
    FIREBASE_AUTH_DOMAIN: str = ""
    FIREBASE_PROJECT_ID: str = "mysmartnotes-965fe"
    FIREBASE_STORAGE_BUCKET: str = ""
    FIREBASE_MESSAGING_SENDER_ID: str = ""
    FIREBASE_APP_ID: str = ""
    FIREBASE_MEASUREMENT_ID: str = ""

    # App Settings
    APP_NAME: str = "MySmartNotes"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int
    
    # File Upload
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: str = "pdf,pptx,png,jpg,jpeg"
    
    # Processing
    OCR_ENABLED: bool = True
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    
    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
