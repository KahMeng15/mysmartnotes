FROM python:3.11-slim-bookworm

# Add labels for GHCR
LABEL org.opencontainers.image.source="https://github.com/kahmeng15/mysmartnotes"
LABEL org.opencontainers.image.description="MySmartNotes - AI-Powered Study Companion"
LABEL org.opencontainers.image.licenses="MIT"

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PORT=8000 \
    ENVIRONMENT=production

WORKDIR /app

# Install system dependencies
# We add curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    poppler-utils \
    libsm6 \
    libxext6 \
    libxrender-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies separately to leverage Docker cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (relying on .dockerignore to filter)
COPY . .

# Create non-root user and setup directories
RUN useradd --create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p /app/data /app/generated /app/output /app/uploads \
    && chown -R appuser:appuser /app

# Expose port
EXPOSE 8000

USER appuser

# Health check using curl
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Run application
CMD ["python", "-m", "app.main"]
