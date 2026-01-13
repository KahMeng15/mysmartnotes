# Resource Requirements & Optimization Guide

Detailed CPU and RAM requirements for each component with optimization strategies.

## Component Resource Breakdown

### Minimal Development Setup (Single User)

**Total: ~4GB RAM, 2 CPU cores**

| Component | RAM | CPU | Notes |
|-----------|-----|-----|-------|
| **PostgreSQL** | 256MB | 0.5 cores | Minimal config, connection_limit=20 |
| **Redis** | 128MB | 0.25 cores | Used for caching and message queue |
| **Ollama + Llama3:8b** | 2GB | 1 core | Model loaded in memory (quantized) |
| **ChromaDB** | 256MB | 0.25 cores | Vector database for embeddings |
| **Streamlit Frontend** | 256MB | 0.25 cores | Single instance |
| **FastAPI Gateway** | 256MB | 0.25 cores | Single worker |
| **Celery Worker (OCR)** | 512MB | 0.5 cores | One worker, processes 1 task at a time |
| **Celery Worker (AI)** | 384MB | 0.5 cores | One worker with Ollama access |
| **Celery Worker (Gen)** | 256MB | 0.25 cores | Document generation |
| **nginx** | 64MB | 0.1 cores | Reverse proxy |

### Small Production Setup (10-50 Users)

**Total: ~6GB RAM, 4 CPU cores**

| Component | RAM | CPU | Notes |
|-----------|-----|-----|-------|
| **PostgreSQL** | 512MB | 1 core | max_connections=50, shared_buffers=128MB |
| **Redis** | 256MB | 0.5 cores | Increased cache size |
| **Ollama + Llama3:8b** | 2.5GB | 2 cores | Better inference performance |
| **ChromaDB** | 512MB | 0.5 cores | More embedding storage |
| **Streamlit Frontend** | 512MB | 0.5 cores | 2 replicas × 256MB |
| **FastAPI Gateway** | 512MB | 0.5 cores | 2 workers × 256MB |
| **Celery Worker (OCR)** | 768MB | 1 core | 2 workers for parallel processing |
| **Celery Worker (AI)** | 512MB | 0.5 cores | 2 workers |
| **Celery Worker (Gen)** | 384MB | 0.5 cores | 1-2 workers |
| **nginx** | 128MB | 0.25 cores | Load balancer for multiple frontends |
| **Celery Beat** | 64MB | 0.1 cores | Scheduled tasks |
| **Flower** | 128MB | 0.1 cores | Celery monitoring (optional) |

### Medium Production Setup (100-500 Users)

**Total: ~12GB RAM, 8 CPU cores**

| Component | RAM | CPU | Notes |
|-----------|-----|-----|-------|
| **PostgreSQL** | 2GB | 2 cores | max_connections=100, shared_buffers=512MB |
| **Redis** | 512MB | 1 core | Larger cache, pub/sub for WebSocket |
| **Ollama + Llama3:8b** | 4GB | 3 cores | Higher concurrency |
| **ChromaDB** | 1GB | 1 core | Larger vector storage |
| **Streamlit Frontend** | 1GB | 1 core | 4 replicas × 256MB |
| **FastAPI Gateway** | 1GB | 1 core | 4 workers × 256MB |
| **Celery Worker (OCR)** | 1.5GB | 2 cores | 3-4 workers, high memory for image processing |
| **Celery Worker (AI)** | 1GB | 1 core | 4 workers |
| **Celery Worker (Gen)** | 512MB | 0.5 cores | 2 workers |
| **nginx** | 256MB | 0.5 cores | Multiple upstream servers |

### Large Production Setup (1000+ Users)

**Total: ~24GB RAM, 16 CPU cores**

| Component | RAM | CPU | Notes |
|-----------|-----|-----|-------|
| **PostgreSQL** | 4GB | 4 cores | Optimized for high concurrency |
| **Redis** | 1GB | 1 core | High throughput cache |
| **Ollama + Llama3:8b** | 8GB | 4 cores | Multiple concurrent inferences |
| **ChromaDB** | 2GB | 1 core | Large embedding dataset |
| **Streamlit Frontend** | 2GB | 2 cores | 8 replicas × 256MB |
| **FastAPI Gateway** | 2GB | 2 cores | 8 workers × 256MB |
| **Celery Worker (OCR)** | 3GB | 3 cores | 6-8 workers |
| **Celery Worker (AI)** | 2GB | 2 cores | 8 workers |
| **Celery Worker (Gen)** | 1GB | 1 core | 4 workers |
| **nginx** | 512MB | 0.5 cores | Load balancing and SSL termination |

---

## Per-Component Deep Dive

### 1. PostgreSQL Database

**Why it uses RAM:**
- Connection pooling (each connection ~5-10MB)
- Query cache
- Shared buffers (cached table data)
- Work memory for sorting/joins

**Optimization strategies:**

```yaml
# Minimal (256MB)
postgres:
  command: >
    postgres
    -c max_connections=20
    -c shared_buffers=64MB
    -c effective_cache_size=128MB
    -c work_mem=2MB

# Small Production (512MB)
postgres:
  command: >
    postgres
    -c max_connections=50
    -c shared_buffers=128MB
    -c effective_cache_size=384MB
    -c work_mem=4MB

# Medium Production (2GB)
postgres:
  command: >
    postgres
    -c max_connections=100
    -c shared_buffers=512MB
    -c effective_cache_size=1536MB
    -c work_mem=8MB
```

**CPU Usage:**
- Minimal: 0.5 cores (few queries, simple operations)
- Production: 2-4 cores (concurrent queries, complex joins, indexing)

---

### 2. Redis

**Why it uses RAM:**
- In-memory data structure store
- Celery task queue messages
- WebSocket pub/sub messages
- Session cache

**Optimization strategies:**

```yaml
# Minimal (128MB)
redis:
  command: >
    redis-server
    --maxmemory 128mb
    --maxmemory-policy allkeys-lru

# Small Production (256MB)
redis:
  command: >
    redis-server
    --maxmemory 256mb
    --maxmemory-policy allkeys-lru
    --save 60 1000

# Medium Production (512MB)
redis:
  command: >
    redis-server
    --maxmemory 512mb
    --maxmemory-policy allkeys-lru
    --appendonly yes
```

**CPU Usage:**
- Minimal: 0.25 cores (single-threaded, but very efficient)
- Production: 0.5-1 core (high throughput operations)

---

### 3. Ollama + Llama3:8b

**Why it uses RAM:**
- Model weights loaded in memory (~4GB for 8B quantized model)
- Context window (conversation history)
- Inference buffer

**Model size options:**

| Model | RAM Required | Speed | Quality |
|-------|-------------|-------|---------|
| Llama3:3b-q4 | 1.5GB | Very Fast | Good |
| Llama3:8b-q4 | 2GB | Fast | Better |
| Llama3:8b-q8 | 4GB | Medium | Best (8-bit) |
| Llama3:70b-q4 | 8GB | Slow | Excellent |

**Optimization strategies:**

```yaml
# Minimal - Use smaller model
ollama:
  environment:
    - OLLAMA_NUM_PARALLEL=1
    - OLLAMA_MAX_LOADED_MODELS=1
  deploy:
    resources:
      limits:
        memory: 2G

# Production - Better model
ollama:
  environment:
    - OLLAMA_NUM_PARALLEL=4
    - OLLAMA_MAX_LOADED_MODELS=1
  deploy:
    resources:
      limits:
        memory: 8G
```

**Alternative: Use external API:**
- OpenAI API: $0 RAM, $0.002/1K tokens
- Anthropic Claude: $0 RAM, $0.008/1K tokens
- Removes largest RAM requirement!

**CPU Usage:**
- Minimal: 1 core (sequential inference)
- Production: 2-4 cores (parallel inference, CPU-optimized quantized model)

---

### 4. ChromaDB

**Why it uses RAM:**
- Vector embeddings cache
- HNSW index in memory
- Query processing

**Data size estimates:**

| Lectures | Embeddings | RAM Needed |
|----------|-----------|-----------|
| 10 | ~10K vectors | 256MB |
| 50 | ~50K vectors | 512MB |
| 200 | ~200K vectors | 1GB |
| 1000 | ~1M vectors | 2GB |

**Optimization strategies:**

```python
# Use persistent storage with smaller cache
chroma_client = chromadb.PersistentClient(
    path="/data/chroma_db",
    settings=Settings(
        anonymized_telemetry=False,
        allow_reset=True,
        chroma_memory_limit_bytes=256 * 1024 * 1024  # 256MB
    )
)
```

**CPU Usage:**
- Minimal: 0.25 cores (infrequent queries)
- Production: 0.5-1 core (vector similarity search)

---

### 5. Streamlit Frontend

**Why it uses RAM:**
- Python runtime (~100MB base)
- Session state per user (~5-10MB)
- WebSocket connections
- UI rendering

**Per-instance calculation:**
- Base: 100MB
- Per user: 10MB
- For 10 users: 100MB + (10 × 10MB) = 200MB

**Optimization strategies:**

```yaml
# Single instance (dev)
frontend:
  deploy:
    replicas: 1
    resources:
      limits:
        memory: 256M

# Multiple instances (production)
frontend:
  deploy:
    replicas: 4
    resources:
      limits:
        memory: 256M  # per instance
      # Total: 1GB for 4 instances
```

**CPU Usage:**
- Per instance: 0.25 cores
- Scales linearly with replicas

---

### 6. FastAPI Gateway

**Why it uses RAM:**
- Python runtime (~100MB)
- Uvicorn workers
- Database connection pool
- WebSocket connections

**Worker calculation:**
- Formula: `workers = (2 × CPU cores) + 1`
- Each worker: ~128MB

**Optimization strategies:**

```python
# Minimal (1 worker)
uvicorn app:app --workers 1 --limit-concurrency 100

# Small Production (4 workers)
uvicorn app:app --workers 4 --limit-concurrency 500

# Connection pool optimization
engine = create_engine(
    DATABASE_URL,
    pool_size=5,  # Minimal: 5, Production: 20
    max_overflow=10  # Minimal: 5, Production: 40
)
```

**CPU Usage:**
- Minimal: 0.25 cores (1 worker)
- Production: 1-2 cores (4-8 workers)

---

### 7. Celery Workers

**Why OCR workers use more RAM:**
- PIL/Pillow image loading
- LayoutParser/Detectron2 models
- Tesseract OCR
- Temporary file buffers

**Memory per task type:**

| Task Type | RAM per Task | Reason |
|-----------|-------------|--------|
| OCR Processing | 256-512MB | Large images, ML models |
| AI/RAG Query | 128-256MB | Ollama client, embeddings |
| Document Generation | 64-128MB | python-docx, fpdf |

**Optimization strategies:**

```python
# Limit concurrency based on available RAM
@celery_app.task(bind=True)
def process_lecture_ocr(self, lecture_id: int):
    # Single worker with concurrency=1
    # RAM: 512MB × 1 = 512MB total
    pass

# Production: Multiple workers, lower concurrency
# 2 workers × concurrency=2 × 256MB = 1GB total
```

```yaml
# Minimal setup
celery_worker_ocr:
  command: celery -A celery_app worker -Q ocr --concurrency=1
  deploy:
    replicas: 1
    resources:
      limits:
        memory: 512M

# Production setup
celery_worker_ocr:
  command: celery -A celery_app worker -Q ocr --concurrency=2
  deploy:
    replicas: 2
    resources:
      limits:
        memory: 768M
```

**CPU Usage:**
- OCR: 0.5-1 core per task (image processing, ML inference)
- AI: 0.25-0.5 cores per task (API calls to Ollama)
- Generation: 0.1-0.25 cores per task (document creation)

---

## Optimization Strategies

### Strategy 1: Bare Minimum (2GB RAM)

For personal use, single user:

```yaml
services:
  postgres:
    command: postgres -c max_connections=10 -c shared_buffers=64MB
    deploy:
      resources:
        limits:
          memory: 256M
  
  redis:
    command: redis-server --maxmemory 64mb
    deploy:
      resources:
        limits:
          memory: 128M
  
  # Use external AI API instead of Ollama
  # Saves 2GB+ RAM!
  
  chroma:
    deploy:
      resources:
        limits:
          memory: 128M
  
  frontend:
    deploy:
      replicas: 1
      resources:
        limits:
          memory: 256M
  
  api_gateway:
    command: uvicorn app:app --workers 1
    deploy:
      resources:
        limits:
          memory: 256M
  
  # Single unified worker instead of 3 separate
  celery_worker:
    command: celery -A celery_app worker -Q ocr,ai,generation --concurrency=1
    deploy:
      resources:
        limits:
          memory: 512M
```

**Total: ~1.5GB RAM** (if using external AI API)

### Strategy 2: Use External Services

Replace self-hosted components:

| Component | Self-Hosted RAM | External Alternative | Cost |
|-----------|----------------|---------------------|------|
| **Ollama** | 2-8GB | OpenAI API | $0.002/1K tokens |
| **PostgreSQL** | 256MB-4GB | Supabase Free | $0 (500MB) |
| **Redis** | 128MB-1GB | Upstash Free | $0 (10K commands/day) |
| **ChromaDB** | 256MB-2GB | Pinecone Free | $0 (100K vectors) |

**Minimal self-hosted + external services: ~512MB RAM**

### Strategy 3: Docker Resource Limits

Always set memory limits to prevent OOM:

```yaml
services:
  api_gateway:
    deploy:
      resources:
        limits:
          memory: 512M
          cpus: '0.5'
        reservations:
          memory: 256M
          cpus: '0.25'
```

### Strategy 4: Swap Configuration

For systems with limited RAM, configure swap:

```bash
# Create 4GB swap file
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Make permanent
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Optimize swappiness
sudo sysctl vm.swappiness=10
```

**Note:** Swap is slower but allows running on 4GB RAM systems.

---

## Recommended Configurations

### Personal Use (1 user)

```
CPU: 2 cores
RAM: 4GB (or 2GB + external AI API)
Storage: 20GB
Cost: $5-10/month (VPS)
```

### Small Team (5-10 users)

```
CPU: 4 cores
RAM: 6GB
Storage: 50GB
Cost: $20-30/month (VPS)
```

### Small Business (50-100 users)

```
CPU: 8 cores
RAM: 12GB
Storage: 100GB
Cost: $80-120/month (VPS or cloud)
```

### Enterprise (1000+ users)

```
CPU: 16+ cores
RAM: 24GB+
Storage: 500GB+
Cost: $400+/month (cloud with auto-scaling)
```

---

## Monitoring Resource Usage

```bash
# Check container resource usage
docker stats

# Check specific container
docker stats mysmartnotes_api_gateway_1

# Check system resources
htop

# Check memory breakdown
free -h
```

---

For deployment configurations, see [DEPLOYMENT.md](DEPLOYMENT.md).  
For monitoring setup, see [MONITORING.md](MONITORING.md).
