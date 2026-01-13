# 🚀 Deployment Guide

Complete deployment instructions for MySmartNotes across different environments.

## Table of Contents

1. [Deployment Options](#deployment-options)
2. [Docker Compose Deployment](#docker-compose-deployment)
3. [Production Configuration](#production-configuration)
4. [Scaling Strategies](#scaling-strategies)
5. [SSL/TLS Setup](#ssltls-setup)
6. [Backup & Recovery](#backup--recovery)
7. [Updates & Maintenance](#updates--maintenance)

---

## Deployment Options

| Option | Best For | Complexity | Cost |
|--------|----------|------------|------|
| **Docker Compose (Single Server)** | Small teams, <1000 users | Low | $20-100/month |
| **Docker Swarm** | Medium scale, high availability | Medium | $100-500/month |
| **Kubernetes** | Enterprise, >10,000 users | High | $500+/month |
| **Managed Services** | Quick deployment, less management | Low | Variable |

---

## Docker Compose Deployment

### Prerequisites

**Server Requirements:**

| Users | CPU | RAM | Storage | Bandwidth |
|-------|-----|-----|---------|-----------|
| 10-100 | 4 cores | 8GB | 50GB SSD | 100Mbps |
| 100-1K | 8 cores | 16GB | 200GB SSD | 1Gbps |
| 1K-10K | 16 cores | 32GB | 500GB SSD | 10Gbps |

**Software Requirements:**
- Ubuntu 22.04 LTS (recommended) or similar Linux distro
- Docker 24.0+
- Docker Compose 2.20+
- Git

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker-compose --version
```

### Step 2: Clone and Configure

```bash
# Clone repository
cd /opt
sudo git clone <repo-url> mysmartnotes
cd mysmartnotes

# Set permissions
sudo chown -R $USER:$USER /opt/mysmartnotes

# Create data directories
mkdir -p data/{uploads,generated,chroma_db,backups}
chmod -R 755 data/
```

### Step 3: Environment Configuration

```bash
# Copy environment template
cp .env.example .env

# Generate secure secrets
export POSTGRES_PASSWORD=$(openssl rand -base64 32)
export REDIS_PASSWORD=$(openssl rand -base64 32)
export JWT_SECRET_KEY=$(openssl rand -base64 64)

# Update .env file
cat > .env << EOF
# Environment
ENVIRONMENT=production
DEBUG=false

# Database
DATABASE_URL=postgresql://user:${POSTGRES_PASSWORD}@postgres:5432/mysmartnotes
POSTGRES_USER=user
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=mysmartnotes

# Redis
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
REDIS_PASSWORD=${REDIS_PASSWORD}

# JWT
JWT_SECRET_KEY=${JWT_SECRET_KEY}
JWT_ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7

# Ollama
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=llama3:8b-instruct-q4_0

# File Storage
UPLOAD_PATH=/data/uploads
GENERATED_PATH=/data/generated

# Worker Settings
CELERY_WORKERS=4
CELERY_CONCURRENCY=4

# OCR Settings
OCR_DPI=300
TESSERACT_LANG=eng

# API Settings
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com

# Rate Limiting
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_PER_HOUR=1000

# Logging
LOG_LEVEL=INFO
EOF

# Secure the .env file
chmod 600 .env
```

### Step 4: Deploy Application

```bash
# Build and start services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Check service status
docker-compose ps

# View logs
docker-compose logs -f

# Initialize database (first time only)
docker-compose exec api_gateway python /app/scripts/init_db.py

# Pull AI model (first time only)
docker-compose exec ollama ollama pull llama3:8b-instruct-q4_0

# Test application
curl http://localhost/health
```

### Step 5: Configure Firewall

```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Or iptables
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
```

---

## Production Configuration

### docker-compose.prod.yml

```yaml
version: '3.8'

services:
  nginx:
    restart: always
    
  frontend:
    restart: always
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
  
  api_gateway:
    restart: always
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
        reservations:
          cpus: '1.0'
          memory: 1G
    environment:
      - WORKERS=4
  
  celery_worker_ocr:
    image: mysmartnotes_worker
    restart: always
    command: celery -A celery_app worker -Q ocr --loglevel=info --concurrency=2
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '4.0'
          memory: 4G
    volumes:
      - ./data:/data
    depends_on:
      - redis
      - postgres
    networks:
      - app_network
  
  celery_worker_ai:
    image: mysmartnotes_worker
    restart: always
    command: celery -A celery_app worker -Q ai --loglevel=info --concurrency=4
    deploy:
      replicas: 4
      resources:
        limits:
          cpus: '4.0'
          memory: 8G
    depends_on:
      - redis
      - ollama
    networks:
      - app_network
  
  celery_worker_generation:
    image: mysmartnotes_worker
    restart: always
    command: celery -A celery_app worker -Q generation --loglevel=info --concurrency=4
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2.0'
          memory: 2G
    volumes:
      - ./data:/data
    networks:
      - app_network
  
  celery_beat:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
  
  flower:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
  
  redis:
    restart: always
    command: >
      redis-server
      --appendonly yes
      --requirepass ${REDIS_PASSWORD}
      --maxmemory 4gb
      --maxmemory-policy allkeys-lru
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
  
  postgres:
    restart: always
    command: >
      postgres
      -c max_connections=100
      -c shared_buffers=256MB
      -c effective_cache_size=1GB
      -c work_mem=4MB
    deploy:
      resources:
        limits:
          cpus: '4.0'
          memory: 8G
    volumes:
      - postgres_prod:/var/lib/postgresql/data
  
  ollama:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '8.0'
          memory: 16G

volumes:
  postgres_prod:
    driver: local
```

### nginx Configuration

Create `docker/nginx.conf`:

```nginx
upstream frontend {
    least_conn;
    server frontend1:8501;
    server frontend2:8501;
    server frontend3:8501;
}

upstream api {
    ip_hash;  # Sticky sessions for WebSocket
    server api_gateway1:8000;
    server api_gateway2:8000;
    server api_gateway3:8000;
}

# Rate limiting
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=1r/s;

server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;
    
    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;
    
    # SSL Configuration
    ssl_certificate /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Client upload size
    client_max_body_size 100M;
    client_body_timeout 300s;
    
    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
    
    # API
    location /api {
        limit_req zone=api_limit burst=20 nodelay;
        
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # WebSocket
    location /ws {
        proxy_pass http://api;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
    
    # File uploads
    location /api/lectures/upload {
        limit_req zone=upload_limit burst=5 nodelay;
        
        proxy_pass http://api;
        proxy_request_buffering off;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    # Static files (generated documents)
    location /downloads {
        alias /usr/share/nginx/html/downloads;
        expires 7d;
        add_header Cache-Control "public, immutable";
    }
    
    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
```

---

## Scaling Strategies

### Horizontal Scaling

**Scale specific services:**

```bash
# Scale frontend
docker-compose up -d --scale frontend=5

# Scale workers
docker-compose up -d --scale celery_worker_ai=8

# Scale API gateway
docker-compose up -d --scale api_gateway=4
```

### Auto-Scaling (Docker Swarm)

**Convert to Docker Swarm:**

```bash
# Initialize swarm
docker swarm init

# Deploy stack
docker stack deploy -c docker-compose.yml -c docker-compose.prod.yml mysmartnotes

# Scale services
docker service scale mysmartnotes_api_gateway=5
docker service scale mysmartnotes_celery_worker_ai=10
```

**Auto-scaling configuration:**

```yaml
# docker-compose.swarm.yml
services:
  api_gateway:
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
        max_attempts: 3
      placement:
        constraints:
          - node.role == worker
```

### Database Read Replicas

**PostgreSQL replication:**

```yaml
# docker-compose.yml
services:
  postgres_primary:
    image: postgres:15-alpine
    environment:
      - POSTGRES_REPLICATION=master
    volumes:
      - postgres_primary_data:/var/lib/postgresql/data
  
  postgres_replica1:
    image: postgres:15-alpine
    environment:
      - POSTGRES_REPLICATION=slave
      - POSTGRES_MASTER_HOST=postgres_primary
    volumes:
      - postgres_replica1_data:/var/lib/postgresql/data
```

---

## SSL/TLS Setup

### Option 1: Let's Encrypt (Free)

**Using Certbot:**

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Generate certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Test renewal
sudo certbot renew --dry-run

# Auto-renewal (crontab)
sudo crontab -e
# Add: 0 0 * * * certbot renew --quiet
```

**Docker Certbot:**

```yaml
# docker-compose.yml
services:
  certbot:
    image: certbot/certbot
    volumes:
      - ./docker/ssl:/etc/letsencrypt
      - ./docker/certbot-www:/var/www/certbot
    entrypoint: "/bin/sh -c 'trap exit TERM; while :; do certbot renew; sleep 12h & wait $${!}; done;'"
```

### Option 2: Self-Signed (Development)

```bash
# Generate certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout docker/ssl/privkey.pem \
  -out docker/ssl/fullchain.pem \
  -subj "/CN=localhost"
```

---

## Backup & Recovery

### Automated Backup Script

Create `scripts/backup.sh`:

```bash
#!/bin/bash

BACKUP_DIR="/opt/mysmartnotes/data/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker-compose exec -T postgres pg_dump -U user mysmartnotes | gzip > $BACKUP_DIR/postgres_$DATE.sql.gz

# Backup ChromaDB
tar -czf $BACKUP_DIR/chroma_$DATE.tar.gz data/chroma_db/

# Backup uploads
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz data/uploads/

# Backup .env file
cp .env $BACKUP_DIR/env_$DATE

# Delete backups older than 30 days
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completed: $DATE"
```

**Schedule with cron:**

```bash
chmod +x scripts/backup.sh

# Add to crontab
crontab -e
# Daily at 2 AM
0 2 * * * /opt/mysmartnotes/scripts/backup.sh >> /var/log/mysmartnotes_backup.log 2>&1
```

### Restore from Backup

```bash
# Stop services
docker-compose down

# Restore PostgreSQL
gunzip < backups/postgres_20260113_020000.sql.gz | docker-compose exec -T postgres psql -U user mysmartnotes

# Restore ChromaDB
tar -xzf backups/chroma_20260113_020000.tar.gz -C data/

# Restore uploads
tar -xzf backups/uploads_20260113_020000.tar.gz -C data/

# Start services
docker-compose up -d
```

### Remote Backup (S3/Cloud)

```bash
# Install AWS CLI
pip install awscli

# Configure AWS
aws configure

# Sync backups to S3
aws s3 sync /opt/mysmartnotes/data/backups/ s3://your-bucket/mysmartnotes-backups/

# Add to backup script
echo "aws s3 sync $BACKUP_DIR/ s3://your-bucket/mysmartnotes-backups/" >> scripts/backup.sh
```

---

## Updates & Maintenance

### Update Application

```bash
# Pull latest code
cd /opt/mysmartnotes
git pull origin main

# Rebuild and restart services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Run migrations if needed
docker-compose exec api_gateway python /app/scripts/migrate_db.py

# Check logs
docker-compose logs -f
```

### Update Docker Images

```bash
# Pull latest base images
docker-compose pull

# Rebuild services
docker-compose build --no-cache

# Restart with new images
docker-compose up -d
```

### Zero-Downtime Deployment

```bash
# Use Docker Swarm rolling updates
docker service update --image mysmartnotes_api_gateway:latest mysmartnotes_api_gateway

# Or with docker-compose
docker-compose up -d --no-deps --build api_gateway
```

### Health Checks

**Add to docker-compose.yml:**

```yaml
services:
  api_gateway:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

### Monitoring Setup

See [MONITORING.md](MONITORING.md) for detailed monitoring configuration.

---

For security best practices, see [SECURITY.md](SECURITY.md).  
For troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
