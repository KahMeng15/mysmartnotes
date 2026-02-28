# ⚙️ Resource Requirements

Simple resource breakdown for MySmartNotes - optimized for minimal requirements.

## System Requirements

### Minimum Setup (Personal Use)

**Recommended:** Most users will be fine with this.

```
CPU: 2 cores
RAM: 4GB
Storage: 10GB
Bandwidth: Any (local network)
```

**Usage:** 1 user, personal study

### Small Team Setup (Friends)

**Recommended:** For small friend group (5-10 people).

```
CPU: 4 cores
RAM: 8GB
Storage: 50GB
Bandwidth: 100Mbps+
```

**Usage:** 5-10 concurrent users

### Medium Deployment

**If your friends grow to 50+ users:**

```
CPU: 8 cores
RAM: 16GB
Storage: 100GB+
Bandwidth: 1Gbps+
```

---

## Component Resource Usage

### Single FastAPI Application

```
Base Memory: ~100MB
Per Concurrent User: ~5-10MB

Examples:
- 10 users: ~150-200MB
- 50 users: ~250-600MB
- 100 users: ~400-1.2GB
```

### SQLite Database

```
Memory: ~50MB + (indexed data size ÷ 100)

Examples:
- 100 lectures: ~50MB
- 1000 lectures: ~100MB
- 5000 lectures: ~200MB

Disk (data):
- 1 lecture: ~2-5MB
- 100 lectures: ~200-500MB
- 1000 lectures: ~2-5GB
```

### Vector Embeddings (Local)

```
Memory (in-memory cache): 
- Per embedding: ~3KB (384-dim)
- 1000 embeddings: ~3MB
- 10000 embeddings: ~30MB
- 100000 embeddings: ~300MB
```

### Background Tasks (ThreadPool)

```
Per Task: ~50-100MB (temporary)
Concurrent Tasks: 1-4

Total for 4 concurrent tasks: ~200-400MB
```

### OCR Processing (Tesseract)

```
Per Page: ~20-50MB (image buffers)
Typical Lecture (50 pages): Processes sequentially, ~100MB peak
```

### External API Calls

```
Memory: Minimal (~1MB per request)
Cost: Pay-per-use (Gemini: $0.002/1K input tokens)
```

---

## Total Memory Usage

### Scenario 1: Personal Use (1 user)

```
FastAPI: ~110MB
SQLite: ~50MB
Embeddings Cache: ~10MB
Background Tasks: 0MB (no tasks running)
─────────
Total: ~170MB
```

### Scenario 2: Friend Group (10 concurrent users)

```
FastAPI: ~150MB (100 + 50)
SQLite: ~100MB
Embeddings Cache: ~50MB
Background Tasks: ~200MB (1-2 tasks)
─────────
Total: ~500MB
```

### Scenario 3: Growing Team (50+ concurrent)

```
FastAPI: ~600MB (100 + 500)
SQLite: ~200MB
Embeddings Cache: ~200MB
Background Tasks: ~300MB (2-4 tasks)
─────────
Total: ~1.3GB
```

---

## Storage Usage

### Per Lecture File

| Item | Size |
|------|------|
| Original PDF/PPTX | 2-10MB |
| Extracted images | 5-20MB |
| Text + embeddings | 0.5-2MB |
| **Total per lecture** | **7-32MB** |

### Growth Rate

```
100 lectures: 0.7-3.2GB
500 lectures: 3.5-16GB
1000 lectures: 7-32GB
```

---

## Optimization Tips

### 1. Use External APIs for AI

Instead of running Ollama locally:

```
Ollama (local): Saves money, uses 2-8GB RAM
Gemini API: Uses minimal RAM, cheap ($0.002/1K tokens)
Hugging Face API: Similar to Gemini
```

**Result:** Save 2-8GB RAM by using APIs!

### 2. Limit Embedding Cache

```python
# Keep only recent embeddings in memory
max_embeddings_in_memory = 10000  # ~30MB

# Older embeddings stored to disk (JSON)
```

### 3. Compress Generated Documents

```python
# Compress PDF files
# Store as zips instead of separate files
```

### 4. Schedule Cleanup

```python
# Delete files older than 90 days
# Archive old study sessions
```

---

## Cost Estimates (Cloud)

### DigitalOcean Droplet

| Size | CPU | RAM | Storage | Cost/month |
|------|-----|-----|---------|-----------|
| **s-1vcpu-512mb** | 1 | 512MB | 10GB | $4 |
| **s-1vcpu-1gb** | 1 | 1GB | 25GB | $6 |
| **s-2vcpu-2gb** | 2 | 2GB | 50GB | $12 |
| **s-4vcpu-8gb** | 4 | 8GB | 160GB | $48 |

### Heroku

```
Free tier: $0/month (limited)
Hobby tier: $7/month (recommended for friends)
Standard: $50+/month (for serious use)
```

### Other Services

| Service | Cost |
|---------|------|
| **Railway** | $5+/month |
| **Render** | $7+/month |
| **AWS** | $5-50+/month |
| **Vercel** | $20+/month |

---

## Deployment Recommendations

### Local Testing
```
RAM: 4GB minimum
Storage: 10GB
Best for: Development
```

### Friend Group (0-10 users)
```
RAM: 2-4GB
Storage: 50GB
Cost: $5-10/month
Best for: $4-6 DigitalOcean + SQLite
```

### Growing Team (10-50 users)
```
RAM: 8GB
Storage: 100GB+
Cost: $20-50/month
Best for: $12-24 DigitalOcean + SQLite
```

### Production (50+ users)
```
RAM: 16GB+
Storage: 500GB+
Cost: $100+/month
Best for: Managed database + Load balancing
```

---

## Performance Tips

### 1. Single Container Performance

**No performance penalty** for single container:
- FastAPI auto-scales with uvicorn workers
- SQLite handles concurrent reads efficiently
- Embeddings cache is instant

### 2. Request Latency

```
Auth/Login: ~50ms
List subjects: ~10ms
Upload file: ~500ms (depends on file size)
Chat query: ~2-10s (depends on AI API)
Generate document: ~5-30s (depends on length)
```

### 3. Database Queries

```python
# Fast queries
SELECT * FROM users WHERE id = 1          # ~5ms
SELECT * FROM lectures WHERE subject_id = 5  # ~10ms

# Slower queries (but still fast for small datasets)
SELECT * FROM lectures JOIN embeddings...  # ~50-100ms
```

---

For deployment options, see [DEPLOYMENT.md](DEPLOYMENT.md).  
For development setup, see [DEVELOPMENT.md](DEVELOPMENT.md).
