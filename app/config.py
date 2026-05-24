"""Configuration management"""
from functools import lru_cache

from pydantic_settings import BaseSettings


# Hardcoded constants (not configurable via environment)
APP_NAME = "MySmartNotes"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
ALLOWED_EXTENSIONS = "pdf,pptx,png,jpg,jpeg"
OCR_ENABLED = True
AI_POLISH_ENABLED = True
EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

# Database defaults
DB_POOL_SIZE = 20
DB_MAX_OVERFLOW = 40
DB_POOL_TIMEOUT_SECONDS = 30
DB_POOL_RECYCLE_SECONDS = 1800


class Settings(BaseSettings):
    """Application settings from environment variables."""

    # Database Configuration
    # Use these to construct the PostgreSQL connection string
    DB_USER: str = "mysmartnotes"
    DB_PASSWORD: str = ""
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "mysmartnotes"

    # Runtime Environment
    ENVIRONMENT: str = "development"  # development, staging, production

    # JWT Security
    # Generate a secure key with: openssl rand -hex 32
    SECRET_KEY: str = ""

    # CORS
    CORS_ALLOWED_ORIGINS: str = "http://localhost:8000,http://127.0.0.1:8000"

    # Session Cookie Security
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"  # strict, lax, none
    CSRF_COOKIE_NAME: str = "csrf_token"
    CSRF_HEADER_NAME: str = "X-CSRF-Token"

    # Encryption for secrets stored in DB (Fernet key)
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    APP_ENCRYPTION_KEY: str = ""

    # Background task retention
    TASK_RETENTION_DAYS: int = 14

    # Admin Bootstrap
    ADMIN_EMAIL: str = ""

    # Global AI Configuration (Administrator-managed)
    GLOBAL_AI_PROVIDER: str = "gemini"  # Options: gemini, huggingface, ollama
    GLOBAL_GEMINI_API_KEY: str = ""
    GLOBAL_HUGGINGFACE_TOKEN: str = ""
    GLOBAL_AI_MODEL: str = ""
    GLOBAL_REASONING_LEVEL: str = "medium"  # Options: low, medium, high

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
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Server
    HOST: str = "0.0.0.0"  # nosec - intentional for Docker/container deployments
    PORT: int = 8000

    # File Upload
    MAX_UPLOAD_SIZE_MB: int = 50

    # Expose hardcoded constants through settings for backward compatibility
    @property
    def APP_NAME(self) -> str:
        return APP_NAME

    @property
    def ALGORITHM(self) -> str:
        return ALGORITHM

    @property
    def ACCESS_TOKEN_EXPIRE_MINUTES(self) -> int:
        return ACCESS_TOKEN_EXPIRE_MINUTES

    @property
    def ALLOWED_EXTENSIONS(self) -> str:
        return ALLOWED_EXTENSIONS

    @property
    def OCR_ENABLED(self) -> bool:
        return OCR_ENABLED

    @property
    def EMBEDDING_MODEL(self) -> str:
        return EMBEDDING_MODEL

    @property
    def AI_POLISH_ENABLED(self) -> bool:
        return AI_POLISH_ENABLED

    @property
    def DB_POOL_SIZE(self) -> int:
        return DB_POOL_SIZE

    @property
    def DB_MAX_OVERFLOW(self) -> int:
        return DB_MAX_OVERFLOW

    @property
    def DB_POOL_TIMEOUT_SECONDS(self) -> int:
        return DB_POOL_TIMEOUT_SECONDS

    @property
    def DB_POOL_RECYCLE_SECONDS(self) -> int:
        return DB_POOL_RECYCLE_SECONDS

    @property
    def DATABASE_URL(self) -> str:
        """Construct SQLAlchemy database URL"""
        return f"postgresql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
