# 🚀 Deployment Guide

Simple deployment for MySmartNotes using a single Docker container.

## Deployment Options

| Option | Best For | Complexity |
|--------|----------|-----------|
| **Docker (Recommended)** | Everyone | Very Low |
| **Bare Metal** | Direct Linux server | Low |
| **Cloud** | Managed hosting | Low |

---

## Docker Deployment (Recommended)

### Prerequisites

- Docker installed
- Docker Compose (optional)
- 2GB RAM minimum

### Option 1: Docker Run (Simplest)

```bash
# Pull the image
docker pull <your-registry>/mysmartnotes

# Run the container
docker run -p 8000:8000 \
  -v $(pwd)/data:/app/data \
  -e GEMINI_API_KEY=$YOUR_API_KEY \
  -e JWT_SECRET_KEY=$(openssl rand -base64 32) \
  mysmartnotes
```

Your app is at: http://localhost:8000

### Option 2: Docker Compose (Preferred)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    image: mysmartnotes:latest
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=sqlite:///./data/app.db
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - HUGGINGFACE_API_KEY=${HUGGINGFACE_API_KEY}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      - DEBUG=False
    volumes:
      - ./data:/app/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

**Start:**
```bash
# Create .env file
cat > .env << EOF
GEMINI_API_KEY=your-key-here
HUGGINGFACE_API_KEY=your-key-here
JWT_SECRET_KEY=$(openssl rand -base64 32)
EOF

# Start container
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

---

## Building Docker Image

### Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    poppler-utils \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy code
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Expose port
EXPOSE 8000

# Run app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Build Image

```bash
docker build -t mysmartnotes:latest .
```

---

## Cloud Deployment

### Heroku

```bash
# Install Heroku CLI
brew install heroku

# Login
heroku login

# Create app
heroku create your-app-name

# Set environment variables
heroku config:set GEMINI_API_KEY=your-key
heroku config:set JWT_SECRET_KEY=$(openssl rand -base64 32)

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Railway.app

```bash
# Connect GitHub repo
# Add environment variables in Railway dashboard
# Railway auto-deploys on git push
```

### Render

```bash
# Connect GitHub repo in Render dashboard
# Set environment variables
# Render auto-deploys on git push
```

---

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL=sqlite:///./data/app.db

# Security
JWT_SECRET_KEY=<generate-strong-key>
JWT_ALGORITHM=HS256

# External APIs
GEMINI_API_KEY=<your-key>
HUGGINGFACE_API_KEY=<your-key>

# Server
HOST=0.0.0.0
PORT=8000
DEBUG=False
WORKERS=4

# File paths (in Docker)
UPLOAD_PATH=/app/data/uploads
GENERATED_PATH=/app/data/generated
EMBEDDINGS_PATH=/app/data/embeddings
```

### Generate JWT Secret

```bash
# Linux/macOS
openssl rand -base64 32

# Python
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

---

## SSL/TLS Setup

### Option 1: Let's Encrypt (Free)

Using Certbot with docker-compose:

```yaml
version: '3.8'

services:
  app:
    image: mysmartnotes:latest
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
```

**nginx.conf:**
```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    location / {
        proxy_pass http://app:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}
```

**Get certificate:**
```bash
certbot certonly --manual --preferred-challenges dns -d yourdomain.com
# Move certs to ./ssl/
```

### Option 2: Self-Signed (Development)

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ./ssl/privkey.pem \
  -out ./ssl/fullchain.pem
```

---

## Backup & Recovery

### Backup Database

The SQLite database is just a file:

```bash
# Backup
cp /data/app.db /backups/app_$(date +%Y%m%d).db

# Or using docker-compose
docker-compose exec app cp /app/data/app.db /app/data/backups/app_$(date +%Y%m%d).db
```

### Automated Backups

```bash
#!/bin/bash
# backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"

mkdir -p $BACKUP_DIR

# Backup database
docker-compose exec -T app cp /app/data/app.db /app/data/backups/app_$DATE.db

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz data/uploads/

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
```

**Schedule with cron:**
```bash
chmod +x backup.sh
# Add to crontab: 0 2 * * * /path/to/backup.sh
```

### Restore from Backup

```bash
# Stop container
docker-compose down

# Restore database
cp backups/app_20250120.db data/app.db

# Start container
docker-compose up -d
```

---

## Monitoring

### Health Check

```bash
# Check if app is running
curl http://localhost:8000/health

# Response: {"status": "ok"}
```

### View Logs

```bash
# Docker
docker-compose logs -f

# Specific service
docker logs -f <container-id>

# Last 100 lines
docker-compose logs --tail=100
```

### Performance

```bash
# Check container resource usage
docker stats

# Monitor specific container
docker stats <container-name>
```

---

## Scaling

For 0-10 users: Single container is sufficient.

If you grow beyond 10 users later, consider:
- Multiple app instances behind a load balancer
- External PostgreSQL database
- Redis cache layer
- Kubernetes for orchestration

For now: Keep it simple with single container.

---

## Troubleshooting

### Container won't start

```bash
# Check logs
docker-compose logs app

# Check image exists
docker images

# Rebuild image
docker-compose build --no-cache

# Restart
docker-compose restart
```

### Database connection error

```bash
# Check database file exists
ls -la data/app.db

# Check permissions
chmod 666 data/app.db

# Restart container
docker-compose restart
```

### Out of disk space

```bash
# Check disk usage
df -h

# Clean up Docker
docker system prune

# Remove old backups
rm data/backups/*.db.* -v
```

### Port 8000 already in use

```bash
# Use different port
# Edit docker-compose.yml
ports:
  - "8001:8000"  # Use 8001 instead

docker-compose up -d
```

---

For development setup, see [DEVELOPMENT.md](DEVELOPMENT.md).  
For security best practices, see [SECURITY.md](SECURITY.md).
