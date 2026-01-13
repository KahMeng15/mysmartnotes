# 🔧 Troubleshooting Guide

Common issues, solutions, and debugging procedures for MySmartNotes.

## Table of Contents

1. [Common Issues](#common-issues)
2. [Docker Problems](#docker-problems)
3. [Database Issues](#database-issues)
4. [Celery Worker Problems](#celery-worker-problems)
5. [OCR & AI Issues](#ocr--ai-issues)
6. [Performance Problems](#performance-problems)
7. [Network & Connectivity](#network--connectivity)
8. [FAQ](#faq)

---

## Common Issues

### Application Won't Start

**Symptoms:**
- Services fail to start
- Error messages in docker-compose logs
- Container exits immediately

**Diagnosis:**

```bash
# Check service status
docker-compose ps

# View logs
docker-compose logs <service_name>

# Check for port conflicts
sudo lsof -i :8000  # API Gateway port
sudo lsof -i :8501  # Frontend port
sudo lsof -i :5432  # PostgreSQL port
sudo lsof -i :6379  # Redis port
```

**Solutions:**

1. **Port already in use:**
```bash
# Kill process using the port
sudo kill -9 $(sudo lsof -t -i:8000)

# Or change port in docker-compose.yml
ports:
  - "8001:8000"  # Use different host port
```

2. **Missing environment variables:**
```bash
# Check .env file exists
ls -la .env

# Verify required variables
cat .env | grep -E "DATABASE_URL|REDIS_URL|JWT_SECRET_KEY"

# Recreate from template
cp .env.example .env
# Edit with your values
```

3. **Docker daemon not running:**
```bash
# macOS
open -a Docker

# Linux
sudo systemctl start docker
```

### Service Health Check Failures

**Check service health:**

```bash
# API Gateway
curl http://localhost:8000/health

# Frontend
curl http://localhost:8501/_stcore/health

# Redis
docker-compose exec redis redis-cli ping

# PostgreSQL
docker-compose exec postgres pg_isready -U user -d mysmartnotes

# Ollama
curl http://localhost:11434/api/tags
```

**If unhealthy:**

```bash
# Restart specific service
docker-compose restart api_gateway

# Rebuild if code changed
docker-compose up -d --build api_gateway

# Check resource usage
docker stats
```

---

## Docker Problems

### Containers Keep Restarting

**Check restart logs:**

```bash
# View last 100 lines
docker-compose logs --tail=100 <service_name>

# Follow logs in real-time
docker-compose logs -f <service_name>
```

**Common causes:**

1. **Out of memory:**
```bash
# Check memory usage
docker stats

# Increase memory limit in docker-compose.yml
services:
  api_gateway:
    deploy:
      resources:
        limits:
          memory: 2G
```

2. **Application error on startup:**
```bash
# Check Python errors
docker-compose logs api_gateway | grep -i "error\|exception\|traceback"

# Enter container to debug
docker-compose exec api_gateway bash
python -c "import app; print('Import successful')"
```

3. **Database connection failure:**
```bash
# Check if postgres is ready
docker-compose exec postgres pg_isready

# Test connection from api_gateway
docker-compose exec api_gateway bash
python -c "from sqlalchemy import create_engine; engine = create_engine('postgresql://user:password@postgres:5432/mysmartnotes'); print(engine.connect())"
```

### Volume Permission Issues

**Symptoms:**
- Permission denied errors
- Cannot write to mounted volumes

**Solutions:**

```bash
# Fix permissions on data directories
sudo chown -R $USER:$USER data/

# If using bind mounts, check container user
docker-compose exec api_gateway id
# uid=1000(appuser) gid=1000(appuser)

# Match host and container UIDs
sudo chown -R 1000:1000 data/
```

### Image Build Failures

**Clear cache and rebuild:**

```bash
# Remove old images
docker system prune -a

# Build without cache
docker-compose build --no-cache

# Pull base images first
docker-compose pull
docker-compose build
```

---

## Database Issues

### Cannot Connect to Database

**Diagnosis:**

```bash
# Check if postgres container is running
docker-compose ps postgres

# Check postgres logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U user -d mysmartnotes -c "SELECT 1;"
```

**Solutions:**

1. **Wrong credentials:**
```bash
# Check environment variables
docker-compose exec api_gateway env | grep DATABASE_URL

# Should match postgres container
docker-compose exec postgres env | grep POSTGRES_
```

2. **Database not initialized:**
```bash
# Initialize database
docker-compose exec api_gateway python /app/scripts/init_db.py

# Check if tables exist
docker-compose exec postgres psql -U user -d mysmartnotes -c "\dt"
```

3. **Connection pool exhausted:**
```python
# In database.py, increase pool size
engine = create_engine(
    DATABASE_URL,
    pool_size=20,  # Increase from default 5
    max_overflow=40  # Increase from default 10
)
```

### Database Migration Errors

**Run migrations manually:**

```bash
# Check current version
docker-compose exec postgres psql -U user -d mysmartnotes -c "SELECT version FROM alembic_version;"

# Apply migrations
docker-compose exec api_gateway alembic upgrade head

# If migration fails, check logs
docker-compose logs api_gateway | grep -i "migration\|alembic"
```

**Reset database (DEVELOPMENT ONLY):**

```bash
# ⚠️ This deletes all data!
docker-compose down -v  # Remove volumes
docker-compose up -d
docker-compose exec api_gateway python /app/scripts/init_db.py
```

### Slow Database Queries

**Identify slow queries:**

```sql
-- Enable slow query logging
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- Log queries > 1s
SELECT pg_reload_conf();

-- View slow queries
docker-compose exec postgres tail -f /var/lib/postgresql/data/log/postgresql.log
```

**Add missing indexes:**

```sql
-- Check missing indexes
SELECT schemaname, tablename, attname, n_distinct, correlation
FROM pg_stats
WHERE schemaname = 'public'
AND n_distinct > 100
ORDER BY n_distinct DESC;

-- Add indexes
CREATE INDEX idx_lectures_user_id ON lectures(user_id);
CREATE INDEX idx_chat_messages_lecture_id ON chat_messages(lecture_id);
CREATE INDEX idx_generated_documents_user_id ON generated_documents(user_id);
```

**Vacuum and analyze:**

```bash
# Run vacuum
docker-compose exec postgres psql -U user -d mysmartnotes -c "VACUUM ANALYZE;"
```

---

## Celery Worker Problems

### Tasks Not Processing

**Check worker status:**

```bash
# View Flower dashboard
open http://localhost:5555

# Check active workers
docker-compose exec api_gateway celery -A celery_app inspect active

# Check queue sizes
docker-compose exec redis redis-cli LLEN celery
docker-compose exec redis redis-cli LLEN ocr
docker-compose exec redis redis-cli LLEN ai
docker-compose exec redis redis-cli LLEN generation
```

**Restart workers:**

```bash
# Restart all workers
docker-compose restart celery_worker_ocr celery_worker_ai celery_worker_generation

# Scale up workers
docker-compose up -d --scale celery_worker_ai=4
```

### Worker Memory Issues

**Check memory usage:**

```bash
docker stats celery_worker_ocr celery_worker_ai celery_worker_generation
```

**Configure worker memory limits:**

```python
# workers/celery_app.py
celery_app.conf.worker_max_tasks_per_child = 100  # Restart after 100 tasks
celery_app.conf.worker_max_memory_per_child = 500000  # 500MB
```

### Task Timeout Issues

**Increase task timeout:**

```python
# workers/tasks.py
@celery_app.task(bind=True, time_limit=3600, soft_time_limit=3300)
def process_lecture(self, lecture_id: int):
    # Task has 1 hour to complete
    pass
```

**Check for stuck tasks:**

```bash
# View active tasks
docker-compose exec api_gateway celery -A celery_app inspect active

# Revoke stuck task
docker-compose exec api_gateway celery -A celery_app control revoke <task_id> --terminate
```

---

## OCR & AI Issues

### Tesseract OCR Errors

**Symptoms:**
- "Tesseract not found" error
- OCR returns empty text

**Solutions:**

1. **Tesseract not installed:**
```bash
# Check installation
docker-compose exec celery_worker_ocr tesseract --version

# If missing, rebuild worker image
docker-compose build celery_worker_ocr
```

2. **Wrong language pack:**
```bash
# Install additional languages
docker-compose exec celery_worker_ocr apt-get update
docker-compose exec celery_worker_ocr apt-get install -y tesseract-ocr-chi-sim  # Chinese

# Or add to Dockerfile
RUN apt-get install -y tesseract-ocr-chi-sim tesseract-ocr-jpn
```

3. **Low quality images:**
```python
# Increase DPI in config
OCR_DPI = 600  # Default is 300

# Preprocess images
from PIL import Image, ImageEnhance
img = Image.open(image_path).convert('L')  # Convert to grayscale
enhancer = ImageEnhance.Contrast(img)
img = enhancer.enhance(2)  # Increase contrast
```

### Ollama Model Issues

**Model not found:**

```bash
# Check available models
docker-compose exec ollama ollama list

# Pull model
docker-compose exec ollama ollama pull llama3:8b-instruct-q4_0

# If pull fails, check disk space
docker-compose exec ollama df -h
```

**Slow inference:**

```bash
# Check Ollama logs
docker-compose logs ollama

# Monitor resource usage
docker stats ollama

# Reduce concurrent requests in workers
docker-compose up -d --scale celery_worker_ai=2  # Reduce from 4
```

**Out of memory:**

```yaml
# Increase Ollama memory limit
services:
  ollama:
    deploy:
      resources:
        limits:
          memory: 16G  # Increase from 8G
```

### ChromaDB Issues

**Connection errors:**

```bash
# Check ChromaDB logs
docker-compose logs chroma

# Test connection
docker-compose exec api_gateway python -c "import chromadb; client = chromadb.HttpClient(host='chroma', port=8000); print(client.heartbeat())"
```

**Embedding errors:**

```python
# Verify collection exists
collections = chroma_client.list_collections()
print(collections)

# Recreate collection if needed
chroma_client.delete_collection("lecture_embeddings")
collection = chroma_client.create_collection("lecture_embeddings")
```

---

## Performance Problems

### High CPU Usage

**Identify culprit:**

```bash
# Check per-container CPU
docker stats --no-stream

# Check processes inside container
docker-compose exec api_gateway top
```

**Solutions:**

1. **Too many workers:**
```python
# Reduce Celery concurrency
celery -A celery_app worker --concurrency=2
```

2. **Inefficient code:**
```python
# Use profiling
import cProfile
cProfile.run('your_function()')

# Or with line_profiler
@profile
def your_function():
    pass
```

### High Memory Usage

**Check memory:**

```bash
docker stats --no-stream

# Inside container
docker-compose exec api_gateway free -h
```

**Solutions:**

1. **Memory leaks:**
```python
# Use objgraph to find leaks
import objgraph
objgraph.show_growth()
# ... run your code
objgraph.show_growth()
```

2. **Large file processing:**
```python
# Process files in chunks
def process_large_file(file_path):
    with open(file_path, 'rb') as f:
        while chunk := f.read(8192):
            process_chunk(chunk)
```

### Slow Response Times

**Profile API endpoints:**

```python
# Add timing middleware
import time

@app.middleware("http")
async def timing_middleware(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = time.time() - start
    
    if duration > 1.0:  # Log slow requests
        logger.warning(f"Slow request: {request.url.path} took {duration:.2f}s")
    
    return response
```

**Optimize database queries:**

```python
# Use eager loading
lectures = db.query(Lecture).options(
    joinedload(Lecture.subject),
    joinedload(Lecture.pages)
).all()

# Add pagination
lectures = db.query(Lecture).limit(50).offset(page * 50).all()
```

---

## Network & Connectivity

### Cannot Access Frontend

**Check nginx:**

```bash
# View nginx logs
docker-compose logs nginx

# Test nginx config
docker-compose exec nginx nginx -t

# Reload nginx
docker-compose exec nginx nginx -s reload
```

**Check frontend container:**

```bash
# Is frontend running?
docker-compose ps frontend

# Test frontend directly
curl http://localhost:8501

# Check firewall
sudo ufw status
```

### WebSocket Connection Fails

**Check nginx WebSocket config:**

```nginx
location /ws {
    proxy_pass http://api_gateway:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 3600s;
}
```

**Test WebSocket:**

```python
# From browser console
const ws = new WebSocket('ws://localhost/ws?token=YOUR_TOKEN');
ws.onmessage = (event) => console.log(event.data);
```

### API Requests Timeout

**Increase timeout:**

```python
# In API client
import httpx

async with httpx.AsyncClient(timeout=60.0) as client:
    response = await client.post(...)
```

**nginx timeout:**

```nginx
location /api {
    proxy_read_timeout 300s;
    proxy_send_timeout 300s;
}
```

---

## FAQ

### How do I reset the entire application?

```bash
# ⚠️ This deletes ALL data!
docker-compose down -v
rm -rf data/
docker system prune -a
docker-compose up -d --build
docker-compose exec api_gateway python /app/scripts/init_db.py
docker-compose exec ollama ollama pull llama3:8b-instruct-q4_0
```

### How do I check if all services are healthy?

```bash
# Health check script
#!/bin/bash

services=("api_gateway:8000" "frontend:8501" "redis:6379" "postgres:5432")

for service in "${services[@]}"; do
    IFS=':' read -r name port <<< "$service"
    if nc -z localhost $port 2>/dev/null; then
        echo "✅ $name is running on port $port"
    else
        echo "❌ $name is NOT running on port $port"
    fi
done
```

### How do I backup my data?

```bash
# Run backup script
./scripts/backup.sh

# Verify backup
ls -lh data/backups/
```

### How do I update to the latest version?

```bash
# Pull latest code
git pull origin main

# Rebuild and restart
docker-compose down
docker-compose up -d --build

# Run migrations
docker-compose exec api_gateway python /app/scripts/migrate_db.py
```

### How do I view logs for debugging?

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api_gateway

# Last 100 lines
docker-compose logs --tail=100 celery_worker_ocr

# Search for errors
docker-compose logs | grep -i "error\|exception\|fail"
```

### How do I increase worker performance?

```bash
# Scale workers
docker-compose up -d --scale celery_worker_ai=8

# Increase concurrency per worker
# In docker-compose.yml:
command: celery -A celery_app worker -Q ai --concurrency=8
```

### How do I debug Python code in containers?

```python
# Add to your code
import pdb; pdb.set_trace()

# Or use remote debugging
import debugpy
debugpy.listen(("0.0.0.0", 5678))
debugpy.wait_for_client()
```

```yaml
# In docker-compose.yml
services:
  api_gateway:
    ports:
      - "5678:5678"  # Debug port
```

### Application is using too much disk space

```bash
# Check disk usage
df -h
du -sh data/*

# Clean old uploads
find data/uploads -type f -mtime +30 -delete

# Clean Docker
docker system prune -a --volumes

# Clean old logs
find /var/log -name "*.log" -mtime +7 -delete
```

### How do I enable debug mode?

```bash
# In .env
DEBUG=true
LOG_LEVEL=DEBUG

# Restart services
docker-compose restart
```

---

For deployment issues, see [DEPLOYMENT.md](DEPLOYMENT.md).  
For security concerns, see [SECURITY.md](SECURITY.md).  
For monitoring setup, see [MONITORING.md](MONITORING.md).
