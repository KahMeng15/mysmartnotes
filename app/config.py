"""Configuration management"""
from pydantic_settings import BaseSettings
from functools import lru_cache
import os


class Settings(BaseSettings):
    """Application settings from environment variables"""
    
    # Database
    DATABASE_URL: str = "sqlite:///./data/app.db"
    
    # API Keys
    GEMINI_API_KEY: str = ""
    HUGGINGFACE_TOKEN: str = ""
    
    # Global AI Configuration
    GLOBAL_AI_PROVIDER: str = "gemini"
    GLOBAL_GEMINI_API_KEY: str = ""
    GLOBAL_AI_MODEL: str = ""
    
    # JWT
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # AI Provider
    AI_PROVIDER: str = "gemini"  # or "huggingface"
    OLLAMA_BASE_URL: str = ""  # e.g., "http://10.0.0.10:11434" - no default, must be configured
    
    # App Settings
    APP_NAME: str = "MySmartNotes"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"
    
    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # File Upload
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: str = "pdf,pptx,png,jpg,jpeg"
    
    # Processing
    OCR_ENABLED: bool = True
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    
    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
