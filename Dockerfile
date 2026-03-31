FROM python:3.11-slim-bookworm

WORKDIR /app

# Install system dependencies for OCR and PDF processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    poppler-utils \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user and writable runtime directories
RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /app/data /app/generated /app/output \
    && chown -R appuser:appuser /app

# Set Default Environment Variables (these can be overridden by docker-compose or run command)
ENV PYTHONPATH=. \
    PORT=8000 \
    DATABASE_URL=sqlite:///./data/app.db \
    DB_POOL_SIZE=20 \
    DB_MAX_OVERFLOW=40 \
    DB_POOL_TIMEOUT_SECONDS=30 \
    DB_POOL_RECYCLE_SECONDS=1800 \
    SECRET_KEY="" \
    ENVIRONMENT=development \
    ALLOW_SQLITE_IN_PRODUCTION=False \
    ALGORITHM=HS256 \
    ACCESS_TOKEN_EXPIRE_MINUTES=30 \
    CORS_ALLOWED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000 \
    COOKIE_SECURE=False \
    COOKIE_SAMESITE=lax \
    CSRF_COOKIE_NAME=csrf_token \
    CSRF_HEADER_NAME=X-CSRF-Token \
    APP_ENCRYPTION_KEY="" \
    TASK_RETENTION_DAYS=14 \
    GLOBAL_AI_PROVIDER=gemini \
    GLOBAL_GEMINI_API_KEY="" \
    GLOBAL_AI_MODEL="" \
    GLOBAL_HUGGINGFACE_TOKEN="" \
    GEMINI_API_KEY="" \
    HUGGINGFACE_TOKEN="" \
    AI_PROVIDER="" \
    OLLAMA_BASE_URL="" \
    APP_NAME=MySmartNotes \
    DEBUG=False \
    LOG_LEVEL=INFO \
    HOST=0.0.0.0 \
    MAX_UPLOAD_SIZE_MB=50 \
    ALLOWED_EXTENSIONS=pdf,pptx,png,jpg,jpeg \
    OCR_ENABLED=True \
    EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2 \
    FIREBASE_API_KEY="" \
    FIREBASE_AUTH_DOMAIN=mysmartnotes-965fe.firebaseapp.com \
    FIREBASE_PROJECT_ID=mysmartnotes-965fe \
    FIREBASE_STORAGE_BUCKET=mysmartnotes-965fe.firebasestorage.app \
    FIREBASE_MESSAGING_SENDER_ID="" \
    FIREBASE_APP_ID="" \
    FIREBASE_MEASUREMENT_ID=""

# Note: EXPOSE is mostly for documentation when using docker-compose, but we document 8000 here
EXPOSE 8000

USER appuser

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import requests, os; p = os.environ.get('PORT', '8000'); requests.get(f'http://localhost:{p}/health')"

# Run application
CMD ["python", "main.py"]
