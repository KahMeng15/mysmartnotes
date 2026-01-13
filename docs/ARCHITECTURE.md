# 🏗️ System Architecture

Comprehensive architecture documentation for MySmartNotes microservices-based application.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Microservices](#microservices)
4. [Data Flow](#data-flow)
5. [Communication Patterns](#communication-patterns)
6. [Scaling Strategy](#scaling-strategy)

---

## Architecture Overview

MySmartNotes uses a **microservices architecture** designed for scalability, maintainability, and independent deployment. The system is decomposed into specialized services that communicate through well-defined APIs.

### Design Principles

1. **Separation of Concerns** - Each service has a single, well-defined responsibility
2. **Loose Coupling** - Services communicate via APIs and message queues
3. **Async Processing** - Heavy tasks run in background workers
4. **Horizontal Scalability** - Add more instances to handle increased load
5. **Data Isolation** - Each service manages its own data domain
6. **Fault Tolerance** - Service failures don't cascade

### High-Level Architecture

```
┌──────────────────── CLIENT LAYER ────────────────────┐
│                                                        │
│  ┌──────────────┐         ┌──────────────┐          │
│  │   Browser    │         │  Mobile App  │          │
│  │  (Streamlit) │         │   (Future)   │          │
│  └──────┬───────┘         └──────┬───────┘          │
│         │                         │                   │
└─────────┼─────────────────────────┼──────────────────┘
          │                         │
          └─────────┬───────────────┘
                    │
┌───────────────────▼──── GATEWAY LAYER ────────────────┐
│                                                         │
│              ┌────────────────────┐                    │
│              │  nginx/Proxy       │                    │
│              │  - Load Balancing  │                    │
│              │  - SSL/TLS         │                    │
│              │  - Static Files    │                    │
│              └─────────┬──────────┘                    │
│                        │                                │
└────────────────────────┼────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
┌────────▼────┐  ┌───────▼─────┐  ┌─────▼────────┐
│  Streamlit  │  │   FastAPI   │  │  WebSocket   │
│  Frontend   │  │   Gateway   │  │   Handler    │
│  (2-N inst) │  │  (2-N inst) │  │              │
└─────────────┘  └───────┬─────┘  └──────────────┘
                         │
┌────────────────────────▼──── SERVICE LAYER ────────────┐
│                                                         │
│              ┌────────────────────┐                    │
│              │  Redis             │                    │
│              │  - Message Broker  │                    │
│              │  - Cache           │                    │
│              │  - Pub/Sub         │                    │
│              └─────────┬──────────┘                    │
│                        │                                │
│          ┌─────────────┼─────────────┐                │
│          │             │             │                │
│  ┌───────▼──────┐ ┌────▼────┐ ┌─────▼─────┐         │
│  │ OCR Worker   │ │AI Worker│ │  Gen      │         │
│  │ (2-N inst)   │ │(2-N inst)│ │  Worker   │         │
│  │              │ │         │ │  (2-N inst)│         │
│  └──────┬───────┘ └────┬────┘ └─────┬─────┘         │
│         │              │            │                │
└─────────┼──────────────┼────────────┼───────────────┘
          │              │            │
┌─────────▼──────────────▼────────────▼── DATA LAYER ──┐
│                                                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │PostgreSQL│  │ ChromaDB │  │  Ollama  │           │
│  │(Metadata)│  │ (Vectors)│  │  (AI/LLM)│           │
│  └──────────┘  └──────────┘  └──────────┘           │
│                                                        │
│  ┌──────────────────────────────────────┐            │
│  │  Shared File Storage                 │            │
│  │  /data/uploads, /data/generated      │            │
│  └──────────────────────────────────────┘            │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Frontend Layer

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **Streamlit** | Web UI framework | Rapid prototyping, Python-native, built-in components |
| **nginx** | Reverse proxy | Load balancing, SSL termination, static file serving |
| **WebSocket** | Real-time communication | Live progress updates, chat streaming |

### API Gateway Layer

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **FastAPI** | REST API framework | Async support, auto-docs, validation, WebSocket support |
| **Pydantic** | Data validation | Type safety, automatic validation, JSON schema |
| **python-jose** | JWT authentication | Secure token-based auth |
| **Uvicorn** | ASGI server | High performance, async support |

### Worker Layer

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **Celery** | Distributed task queue | Mature, scalable, supports multiple brokers |
| **Redis** | Message broker | Fast, persistent, supports pub/sub |
| **Flower** | Celery monitoring | Real-time task monitoring, web UI |

### AI & Processing

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **Ollama** | LLM inference | Local deployment, CPU-optimized, free |
| **Llama 3** | Language model | Open-source, good performance, quantized versions |
| **LayoutParser** | Document layout analysis | Detect figures vs text regions |
| **Detectron2** | Computer vision | Figure detection, region classification |
| **Tesseract** | OCR engine | Mature, accurate, free |
| **pdf2image** | PDF conversion | Convert PDF pages to images |
| **python-pptx** | PowerPoint parsing | Extract content from presentations |

### Data Layer

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **PostgreSQL** | Relational database | ACID compliance, concurrent access, mature |
| **ChromaDB** | Vector database | Embeddings storage, semantic search |
| **Redis** | Cache & pub/sub | In-memory speed, persistence support |
| **SQLAlchemy** | ORM | Database abstraction, migrations |

### Document Generation

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **python-docx** | Word document creation | Full formatting control, free |
| **fpdf** | PDF generation | Simple quizzes and reports |
| **Pillow** | Image processing | Resize, crop, optimize images |

### Utilities

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **DuckDuckGo API** | Web search | Privacy-focused, no API key required |
| **bcrypt** | Password hashing | Industry standard, secure |
| **Python logging** | Application logging | Built-in, flexible configuration |

---

## Microservices

### 1. Frontend Service

**Technology:** Streamlit  
**Instances:** 2-N (load balanced)  
**Responsibilities:**
- User interface rendering
- API client communication
- WebSocket client management
- Session state management

**Key Components:**
- `app.py` - Main Streamlit application
- `/pages` - Multi-page interface (Dashboard, Chat, Quiz, etc.)
- `/components` - Reusable UI components (sidebar, panels)
- `/utils` - API client, WebSocket client, helpers

**Communication:**
- HTTP requests to API Gateway
- WebSocket connection for real-time updates
- Session data stored in Redis (via API Gateway)

**Scaling:**
- Horizontal: Add more instances behind nginx
- Load balancing: Round-robin or least-connections
- Session affinity: Sticky sessions if needed

---

### 2. API Gateway Service

**Technology:** FastAPI  
**Instances:** 2-N (load balanced)  
**Responsibilities:**
- Request authentication & authorization
- Request routing and validation
- WebSocket connection management
- File upload handling
- Rate limiting
- API documentation (auto-generated)

**Key Endpoints:**

**Authentication:**
- `POST /auth/register` - User registration
- `POST /auth/login` - User login
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout (invalidate tokens)

**Subjects:**
- `GET /subjects` - List all subjects
- `POST /subjects` - Create new subject
- `GET /subjects/{id}` - Get subject details
- `PUT /subjects/{id}` - Update subject
- `DELETE /subjects/{id}` - Delete subject

**Lectures:**
- `GET /subjects/{id}/lectures` - List lectures in subject
- `POST /subjects/{id}/lectures/upload` - Upload lecture file
- `GET /lectures/{id}` - Get lecture details
- `PUT /lectures/{id}` - Update lecture metadata
- `DELETE /lectures/{id}` - Delete lecture

**Documents:**
- `GET /lectures/{id}/documents` - List generated documents
- `POST /documents/generate` - Generate new document
- `GET /documents/{id}/download` - Download document

**Chat:**
- `WebSocket /ws/{user_id}` - Real-time chat
- `POST /chat` - Send chat message (alternative to WebSocket)

**Tasks:**
- `GET /tasks/{task_id}` - Get task status
- `DELETE /tasks/{task_id}` - Cancel task

**Middleware Stack:**
1. CORS - Cross-origin resource sharing
2. Authentication - JWT verification
3. Rate Limiting - Request throttling
4. Logging - Request/response logging
5. Error Handling - Centralized exception handling

**Scaling:**
- Horizontal: Add more instances
- Stateless: No local state (uses Redis for sessions)
- Load balancing: nginx round-robin

---

### 3. OCR Worker Service

**Technology:** Celery + Python  
**Instances:** 2-N (task queue based)  
**Queue:** `ocr` (high priority)  
**Responsibilities:**
- PDF/PPTX file processing
- Layout detection (figures vs text)
- Figure extraction and cropping
- OCR text extraction
- Text cleaning and preprocessing

**Task:** `process_lecture(lecture_id, file_path)`

**Processing Pipeline:**

```python
1. Load file from storage
   ↓
2. Convert to images (300 DPI)
   ↓
3. For each page:
   ├─ Run LayoutParser
   ├─ Detect figure regions
   ├─ Crop and save figures
   ├─ Extract text from non-figure regions
   └─ Clean and normalize text
   ↓
4. Queue AI Worker for embeddings
   ↓
5. Update database status
   ↓
6. Publish completion event
```

**Performance Characteristics:**
- **CPU Bound:** Image processing, OCR, layout detection
- **Concurrency:** 1-2 tasks per CPU core
- **Memory:** ~500MB per task
- **Duration:** ~5-10 seconds per page

**Scaling:**
- Add more worker instances
- Increase worker concurrency (--concurrency flag)
- Distribute across multiple machines

---

### 4. AI Worker Service

**Technology:** Celery + Python  
**Instances:** 2-N (task queue based)  
**Queue:** `ai` (medium priority)  
**Responsibilities:**
- Text embedding generation
- RAG query processing
- LLM response generation
- Semantic search

**Tasks:**

**`embed_chunks(lecture_id, chunks)`**
- Generate embeddings for text chunks
- Store in ChromaDB with metadata
- Batch processing for efficiency

**`generate_response(query, context, use_web)`**
- Embed query
- Search ChromaDB for similar chunks
- Optionally query web (DuckDuckGo)
- Generate LLM response
- Stream response chunks

**Ollama Integration:**
```python
# Embedding generation
embeddings = ollama.embeddings(
    model="llama3:8b-instruct-q4_0",
    prompt=text
)

# Response generation
response = ollama.generate(
    model="llama3:8b-instruct-q4_0",
    prompt=formatted_prompt,
    stream=True
)
```

**Performance Characteristics:**
- **CPU/Memory Bound:** LLM inference
- **Concurrency:** 2-4 tasks per worker (shared Ollama service)
- **Memory:** ~2GB per Ollama instance
- **Duration:** 1-30 seconds per query

**Scaling:**
- Add more worker instances (share same Ollama)
- Multiple Ollama instances (if needed)
- Prioritize interactive queries over batch jobs

---

### 5. Generation Worker Service

**Technology:** Celery + Python  
**Instances:** 2-N (task queue based)  
**Queue:** `generation` (low priority)  
**Responsibilities:**
- Cheat sheet generation (Word)
- Quiz generation (PDF)
- Flashcard generation (JSON)
- Past paper answer generation

**Tasks:**

**`create_cheat_sheet(lecture_id, options)`**
- Query ChromaDB for summarized content
- Load cropped figures from storage
- Generate Word document:
  - 2-column layout
  - Arial 9pt body, 11pt headings
  - 0.5" margins
  - Figures at 3.2" width
- Save to `/data/generated/`

**`create_quiz(lecture_id, options)`**
- Extract key concepts from ChromaDB
- Use LLM to generate questions
- Format as PDF with fpdf
- Include answer key

**`create_flashcards(lecture_id, options)`**
- Identify Q&A pairs from content
- Generate flashcard JSON
- Initialize SM-2 algorithm data

**Performance Characteristics:**
- **IO Bound:** File operations, database queries
- **Concurrency:** 4-8 tasks per worker
- **Memory:** ~200MB per task
- **Duration:** 10-60 seconds per document

**Scaling:**
- Add more worker instances
- High concurrency per worker (IO bound)

---

### 6. Database Services

#### PostgreSQL

**Purpose:** Primary relational database  
**Schema:** See [DATABASE.md](DATABASE.md)  
**Tables:**
- users, subjects, lectures
- generated_documents, flashcards
- share_links, study_sessions

**Configuration:**
```yaml
# Production settings
max_connections: 100
shared_buffers: 256MB
effective_cache_size: 1GB
work_mem: 4MB
```

**Backup Strategy:**
- Daily full backup (pg_dump)
- Point-in-time recovery (WAL archiving)
- Retention: 30 days

**Scaling:**
- Read replicas for query distribution
- Connection pooling (PgBouncer)
- Partitioning for large tables

#### ChromaDB

**Purpose:** Vector database for embeddings  
**Collections:** One per subject  
**Configuration:**
```python
client = chromadb.PersistentClient(
    path="/data/chroma_db",
    settings=Settings(
        anonymized_telemetry=False
    )
)
```

**Scaling:**
- Single instance handles millions of vectors
- For larger scale: Use Chroma server mode
- Horizontal scaling with sharding

#### Redis

**Purpose:** Cache, message broker, pub/sub  
**Databases:**
- DB 0: Celery broker
- DB 1: Celery results
- DB 2: Application cache
- DB 3: User sessions
- DB 4: Rate limiting
- DB 5: Pub/Sub

**Configuration:**
```conf
maxmemory 2gb
maxmemory-policy allkeys-lru
appendonly yes  # Persistence
```

**Scaling:**
- Redis Cluster for horizontal scaling
- Separate instances for broker vs cache

---

## Data Flow

### 1. User Registration Flow

```
Client → API Gateway → PostgreSQL
         ↓
      Generate JWT
         ↓
      Return tokens
```

### 2. Lecture Upload & Processing Flow

```
Client → API Gateway → Save file → PostgreSQL
         ↓
      Queue OCR task → Redis → OCR Worker
                               ↓
                          Process pages
                               ↓
                          Queue AI task → AI Worker
                                          ↓
                                   Generate embeddings
                                          ↓
                                      ChromaDB
                               ↓
                          Update PostgreSQL
                               ↓
                          Publish progress → Redis Pub/Sub
                                            ↓
                                         WebSocket
                                            ↓
                                          Client
```

### 3. Chat Query Flow

```
Client → WebSocket → API Gateway → Redis (cache check)
                                   ↓ (cache miss)
                              Generate embedding
                                   ↓
                              ChromaDB (search)
                                   ↓
                              Web search (optional)
                                   ↓
                              Queue AI task → AI Worker
                                              ↓
                                          Ollama LLM
                                              ↓
                                          Stream response
                                              ↓
                                          Redis Pub/Sub
                                              ↓
                                          WebSocket
                                              ↓
                                          Client
```

### 4. Document Generation Flow

```
Client → API Gateway → Queue task → Redis → Generation Worker
                                             ↓
                                        Query ChromaDB
                                             ↓
                                        Load figures
                                             ↓
                                        Generate document
                                             ↓
                                        Save file
                                             ↓
                                        PostgreSQL
                                             ↓
                                        Notify client
                                             ↓
                                        WebSocket
                                             ↓
                                        Client
```

---

## Communication Patterns

### 1. Synchronous (REST)

Used for: CRUD operations, file uploads

```
Client → API Gateway → Database → API Gateway → Client
```

**Characteristics:**
- Request-response pattern
- Client waits for response
- Suitable for fast operations (<1s)

### 2. Asynchronous (Task Queue)

Used for: Heavy processing (OCR, AI, generation)

```
Client → API Gateway → Queue → Worker → Database
                      ↓
                  Task ID
                      ↓
                   Client
```

**Characteristics:**
- Non-blocking
- Client gets immediate task ID
- Worker processes in background
- Status checked via polling or WebSocket

### 3. Event-Driven (Pub/Sub)

Used for: Real-time updates, progress notifications

```
Worker → Redis Pub/Sub → WebSocket → Client
```

**Characteristics:**
- Push-based notifications
- Real-time updates
- Multiple subscribers supported

### 4. Streaming (WebSocket)

Used for: Chat, real-time progress

```
Client ←→ WebSocket ←→ API Gateway ←→ Redis Pub/Sub ←→ Workers
```

**Characteristics:**
- Bi-directional communication
- Low latency
- Persistent connection

---

## Scaling Strategy

### Vertical Scaling (Scale Up)

Add more resources to existing machines:

| Component | CPU | RAM | Storage |
|-----------|-----|-----|---------|
| API Gateway | 2-4 cores | 2-4GB | 10GB |
| Frontend | 1-2 cores | 1-2GB | 10GB |
| OCR Worker | 4-8 cores | 4-8GB | 50GB |
| AI Worker | 4-8 cores | 8-16GB | 50GB |
| Generation Worker | 2-4 cores | 2-4GB | 50GB |
| PostgreSQL | 4-8 cores | 8-16GB | 100GB+ |
| Redis | 2-4 cores | 4-8GB | 20GB |
| Ollama | 4-8 cores | 8-16GB | 50GB |

### Horizontal Scaling (Scale Out)

Add more instances:

| Users | Frontend | API Gateway | OCR Workers | AI Workers | Gen Workers |
|-------|----------|-------------|-------------|------------|-------------|
| 1-10 | 1 | 1 | 1 | 2 | 1 |
| 10-100 | 2 | 2 | 2 | 4 | 2 |
| 100-1K | 4 | 4 | 4 | 8 | 4 |
| 1K-10K | 8 | 8 | 8 | 16 | 8 |

### Auto-Scaling Triggers

**Scale Up When:**
- CPU usage > 70% for 5 minutes
- Memory usage > 80%
- Queue length > 100 tasks
- Response time > 3 seconds

**Scale Down When:**
- CPU usage < 30% for 15 minutes
- Queue length < 10 tasks
- Low request rate

### Load Balancing

**nginx Configuration:**
```nginx
upstream frontend {
    least_conn;  # Route to least busy instance
    server frontend1:8501;
    server frontend2:8501;
    server frontend3:8501;
}

upstream api_gateway {
    ip_hash;  # Sticky sessions for WebSocket
    server gateway1:8000;
    server gateway2:8000;
}
```

### Database Scaling

**Read Scaling:**
- PostgreSQL read replicas
- Read-heavy queries to replicas
- Write operations to primary

**Connection Pooling:**
```python
# SQLAlchemy pool settings
engine = create_engine(
    DATABASE_URL,
    pool_size=10,  # Persistent connections
    max_overflow=20,  # Extra connections when needed
    pool_timeout=30,
    pool_recycle=3600  # Recycle after 1 hour
)
```

**Caching Strategy:**
- Redis cache for frequently accessed data
- TTL-based expiration
- Cache invalidation on writes

---

For deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).  
For development setup, see [DEVELOPMENT.md](DEVELOPMENT.md).
