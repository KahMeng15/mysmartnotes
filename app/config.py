"""Configuration management"""
from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # Database
    DATABASE_URL: str = "sqlite:///./data/app.db"
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 40
    DB_POOL_TIMEOUT_SECONDS: int = 30
    DB_POOL_RECYCLE_SECONDS: int = 1800

    # Runtime Environment
    ENVIRONMENT: str = "development"  # development, staging, production
    ALLOW_SQLITE_IN_PRODUCTION: bool = False

    # JWT Security
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # CORS
    CORS_ALLOWED_ORIGINS: str = "http://localhost:8000,http://127.0.0.1:8000"

    # Session Cookie Security
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"  # strict, lax, none
    CSRF_COOKIE_NAME: str = "csrf_token"
    CSRF_HEADER_NAME: str = "X-CSRF-Token"

    # Encryption for secrets stored in DB (Fernet key, URL-safe base64-encoded 32-byte key)
    APP_ENCRYPTION_KEY: str = ""

    # Background task retention
    TASK_RETENTION_DAYS: int = 14

    # Admin Bootstrap
    ADMIN_EMAIL: str = ""
    ADMIN_PASSWORD: str = ""

    # Global AI Configuration (Administrator-managed)
    GLOBAL_AI_PROVIDER: str = "gemini"  # Options: gemini, huggingface, ollama
    GLOBAL_GEMINI_API_KEY: str = ""
    GLOBAL_HUGGINGFACE_TOKEN: str = ""
    GLOBAL_AI_MODEL: str = ""

    # Fallback AI Settings
    GEMINI_API_KEY: str = ""
    HUGGINGFACE_TOKEN: str = ""
    AI_PROVIDER: str = "gemini"
    OLLAMA_BASE_URL: str = ""

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
    HOST: str = "0.0.0.0"  # nosec - intentional for Docker/container deployments
    PORT: int = 8000

    # File Upload
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_EXTENSIONS: str = "pdf,pptx,png,jpg,jpeg"

    # Processing
    OCR_ENABLED: bool = True
    AI_POLISH_ENABLED: bool = True
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
