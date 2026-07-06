# --- Stage 1: Builder ---
FROM python:3.11-slim-bookworm AS builder

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Create a virtual environment to keep dependencies isolated
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install Python dependencies
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install certifi && \
    pip install --default-timeout=1000 -r requirements.txt --trusted-host download.pytorch.org --trusted-host download-r2.pytorch.org


# --- Stage 2: Runtime ---
FROM python:3.11-slim-bookworm

LABEL org.opencontainers.image.source="https://github.com/kahmeng15/velonote"
LABEL org.opencontainers.image.description="velonote - AI-Powered Study Companion"
LABEL org.opencontainers.image.licenses="MIT"

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH" \
    PORT=8000 \
    ENVIRONMENT=production

WORKDIR /app

# Install runtime dependencies (e.g., Tesseract for OCR, Poppler for PDF images, OpenCV deps, and FFmpeg for audio processing)
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    poppler-utils \
    libsm6 \
    libxext6 \
    libxrender-dev \
    curl \
    gosu \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy the virtual environment from the builder stage
COPY --from=builder /opt/venv /opt/venv

# Copy application code
COPY . .

# Define build arguments for UID and GID (defaults to TrueNAS 'apps' user)
ARG USER_ID=568
ARG GROUP_ID=568

# Create non-root user and setup directories
RUN groupadd --gid ${GROUP_ID} appgroup \
    && useradd --create-home --shell /usr/sbin/nologin --uid ${USER_ID} --gid ${GROUP_ID} appuser \
    && mkdir -p /app/data /app/logs \
    && chown -R appuser:appgroup /app

# Prepare entrypoint script
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Expose port
EXPOSE 8000

# Start as root to allow entrypoint to fix permissions
ENTRYPOINT ["docker-entrypoint.sh"]

# Default command (can be overridden in docker-compose)
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
