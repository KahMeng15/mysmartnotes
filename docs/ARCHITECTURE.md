# 🏗️ System Architecture

Simplified architecture documentation for MySmartNotes - optimized for personal/small team use.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Application Structure](#application-structure)
4. [Data Flow](#data-flow)
5. [Background Task Processing](#background-task-processing)
6. [Deployment](#deployment)

---

## Architecture Overview

MySmartNotes uses a **simplified monolithic architecture** designed for easy deployment and maintenance on a single Docker container. All components run in one process with background tasks handled via threading and async/await.

### Design Principles

1. **Simplicity** - Single codebase, easy to understand and modify
2. **Self-Contained** - All code runs in one Docker container
3. **Lightweight** - Minimal external dependencies (SQLite, no Ollama)
4. **External APIs** - Leverage cloud services for AI (Gemini, Hugging Face)
5. **WebSocket Support** - Real-time updates with simple pub/sub
6. **Single-File Startup** - Run `python main.py` and everything starts

### High-Level Architecture

```
┌────────────────── BROWSER ──────────────────┐
│                                              │
│  ┌──────────────────────────────────────┐  │
│  │   HTML/JavaScript Frontend           │  │
│  │   (Served from /static/)             │  │
│  └────────┬─────────────────────────────┘  │
│           │                                  │
└───────────┼──────────────────────────────────┘
            │
     HTTP/WebSocket
            │
            ▼
┌─────────────────────────────────────────────┐
│                                             │
│        FastAPI Application (Single Port)   │
│                                             │
│  ┌────────────────────────────────────┐   │
│  │  REST API Routes                   │   │
│  │  - /auth/* (login/register)        │   │
│  │  - /api/subjects/*                 │   │
│  │  - /api/lectures/*                 │   │
│  │  - /api/documents/*                │   │
│  │  - /api/chat                       │   │
│  └────────────────────────────────────┘   │
│                                             │
│  ┌────────────────────────────────────┐   │
│  │  WebSocket Handler (/ws)           │   │
│  │  - Real-time progress updates      │   │
│  │  - Live chat streaming             │   │
│  └────────────────────────────────────┘   │
│                                             │
│  ┌────────────────────────────────────┐   │
│  │  Background Task Queue             │   │
│  │  - OCR processing                  │   │
│  │  - Document generation             │   │
│  │  - Scheduled tasks                 │   │
│  │  (Runs in thread pool)             │   │
│  └────────────────────────────────────┘   │
│                                             │
│  ┌────────────────────────────────────┐   │
│  │  Database & Cache Layer            │   │
│  │  - SQLite (file-based)             │   │
│  │  - In-memory cache                 │   │
│  │  - Vector embeddings (simple)      │   │
│  └────────────────────────────────────┘   │
│                                             │
│  ┌────────────────────────────────────┐   │
│  │  External Services                 │   │
│  │  - Gemini API / Hugging Face       │   │
│  │    (for AI/LLM)                    │   │
│  │  - DuckDuckGo (web search)         │   │
│  │  - File storage (uploads)          │   │
│  └────────────────────────────────────┘   │
│                                             │
└─────────────────────────────────────────────┘
            │
            ▼
    /data (Docker volume)
    ├── app.db (SQLite)
    ├── uploads/
    ├── generated/
    └── embeddings/
```

---

## Tech Stack

### Backend

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **FastAPI** | Web framework | Async, WebSocket, auto-docs, minimal setup |
| **Uvicorn** | ASGI server | Fast, single process, production-ready |
| **Pydantic** | Data validation | Type safety, JSON schema generation |
| **SQLite** | Database | Zero config, file-based, perfect for small apps |
| **SQLAlchemy** | ORM | Simple model definitions, migrations |

### Frontend

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **HTML/CSS/JS** | User interface | Lightweight, served as static files |
| **WebSocket** | Real-time updates | Live progress, streaming responses |
| **Fetch API** | HTTP requests | Modern, built-in, no dependencies |

### Background Tasks

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **ThreadPoolExecutor** | Async task processing | Built-in, simple, no Redis needed |
| **asyncio** | Concurrent processing | Python native, integrates with FastAPI |

### Document Processing

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **pdf2image** | PDF → images | Extract pages for processing |
| **Tesseract-OCR** | Text extraction | Accurate, free, open-source |
| **Pillow** | Image manipulation | Crop, resize, process figures |
| **python-pptx** | PowerPoint parsing | Extract content from presentations |
| **python-docx** | Word generation | Create study guides |
| **fpdf2** | PDF generation | Create quizzes and reports |

### AI & LLM

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **Google Gemini API** | LLM & embeddings | Free tier, powerful, no local setup |
| **Hugging Face API** | Alternative LLM | Optional alternative, inference API |
| **sentence-transformers** | Local embeddings | Fast, runs on CPU, no API key |
| **DuckDuckGo API** | Web search | No API key required, privacy-focused |

### Utilities

| Technology | Purpose | Why Chosen |
|------------|---------|------------|
| **bcrypt** | Password hashing | Secure, industry standard |
| **PyJWT** | JWT tokens | Simple authentication |
| **python-multipart** | File uploads | Handle multipart/form-data |
| **python-dotenv** | Config management | Environment variables from .env |

---

## Application Structure

### Single FastAPI Application

```python
# main.py
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Middleware & startup
# - Database initialization
# - Configuration loading
# - Background task queue setup

# API Routes (all in one app)
# /auth/* - Authentication
# /api/subjects/* - Subject management
# /api/lectures/* - Lecture upload & processing
# /api/documents/* - Generated documents
# /api/chat - Chat interface
# /ws - WebSocket for real-time updates

# WebSocket connection manager
# - Handles client connections
# - Broadcasts task progress
# - Streams chat responses

# Background task queue
# - ThreadPoolExecutor for background work
# - Task status tracking
# - Progress notifications

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")
```

### Project Organization

```
/app
├── main.py              # FastAPI app entry point
├── config.py            # Configuration & environment variables
├── requirements.txt     # Python dependencies
│
├── /routers
│   ├── auth.py         # Authentication endpoints
│   ├── subjects.py     # Subject CRUD
│   ├── lectures.py     # Lecture upload & processing
│   ├── documents.py    # Generated documents
│   ├── chat.py         # Chat endpoint
│   └── tasks.py        # Task status tracking
│
├── /models
│   └── db.py           # SQLAlchemy models
│
├── /schemas
│   └── schemas.py      # Pydantic models
│
├── /processing
│   ├── ocr.py          # OCR processing
│   ├── ai_client.py    # Gemini/HF API client
│   ├── generators.py   # Document generation
│   └── search.py       # Web search
│
├── /utils
│   ├── db.py           # Database utilities
│   ├── auth.py         # JWT utilities
│   ├── tasks.py        # Task queue management
│   └── websocket.py    # WebSocket utilities
│
├── /static
│   ├── index.html      # Main page
│   ├── style.css       # Styling
│   ├── app.js          # Frontend logic
│   └── /assets         # Images, icons
│
├── /data (mounted volume)
│   ├── app.db          # SQLite database
│   ├── /uploads        # User uploaded files
│   ├── /generated      # Generated documents
│   └── /embeddings     # Vector embeddings cache
│
└── Dockerfile          # Container configuration
```

## Data Flow

### 1. User Registration

```
Browser ──POST /auth/register──> FastAPI
                                    │
                                    ▼
                            Hash password (bcrypt)
                                    │
                                    ▼
                            Save to SQLite
                                    │
                                    ▼
                          Generate JWT token
                                    │
                                    ▼
                        Return token to Browser
```

### 2. Lecture Upload & Processing

```
Browser ──POST /api/lectures/upload + file──> FastAPI
                                                 │
                                                 ├─ Save file to /data/uploads
                                                 ├─ Create lecture record in SQLite
                                                 ├─ Queue background task
                                                 └─ Return task_id to client
                                                    │
                                ┌──────────────────┘
                                ▼
                        Background Task (thread)
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              Extract   Extract   Generate
              pages    text      embeddings
              (PDF→    (OCR)     (sentence-
              images)            transformers)
                    │           ▼
                    │      Store in /data/embeddings
                    │           │
                    └───────────┼───────────┐
                                ▼
                        Update SQLite (completed)
                                │
                                ▼
                    Broadcast to Browser via WebSocket
```

### 3. Chat Query

```
Browser ──WebSocket message──> FastAPI
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
              Embed query  Search local   Optional:
              (sentence-   embeddings     Web search
              transformers) in SQLite     (DuckDuckGo)
                    │            │            │
                    └────────────┼────────────┘
                                 ▼
                    Build context from results
                                 │
                                 ▼
                    Call Gemini/HF API with context
                                 │
                                 ▼
                    Stream response back via WebSocket
```

### 4. Document Generation

```
Browser ──POST /api/documents/generate──> FastAPI
                                             │
                                             ├─ Validate request
                                             ├─ Queue background task
                                             └─ Return task_id
                                                │
                                ┌───────────────┘
                                ▼
                        Background Task (thread)
                                │
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
               Query      Generate    Generate
              embeddings  content     formatting
              from        (AI API)    (python-docx)
              SQLite                  │
                    │           ▼
                    │      Save to /data/generated
                    │           │
                    └───────────┼───────────┐
                                ▼
                        Update SQLite (completed)
                                │
                                ▼
                    Notify Browser via WebSocket
```

## Background Task Processing

### Task Queue (ThreadPoolExecutor)

FastAPI handles background tasks with a simple thread pool:

```python
from concurrent.futures import ThreadPoolExecutor

executor = ThreadPoolExecutor(max_workers=4)

@app.post("/api/lectures/upload")
async def upload_lecture(file: UploadFile):
    # Save file immediately
    file_path = await save_file(file)
    
    # Queue background processing
    task_id = queue_task(
        executor.submit(process_lecture, file_path)
    )
    
    # Return immediately to user
    return {"task_id": task_id, "status": "processing"}

# In background
def process_lecture(file_path):
    # Long-running task
    extract_pages(file_path)
    perform_ocr(file_path)
    generate_embeddings(file_path)
    notify_clients(task_id, "completed")
```

### Task Status Tracking

```python
# In-memory task store (SQLite for persistence)
tasks = {
    "task_123": {
        "status": "processing",      # processing, completed, failed
        "progress": 65,               # 0-100%
        "started_at": "2025-01-20T10:00:00Z",
        "result": None
    }
}

# WebSocket broadcasts progress
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    async for message in websocket:
        if message["type"] == "subscribe_task":
            task_id = message["task_id"]
            # Send updates as task progresses
            await websocket.send_json({
                "task_id": task_id,
                "progress": tasks[task_id]["progress"]
            })
```

## WebSocket Real-Time Updates

### Connection Manager

```python
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
    
    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

# Global manager
manager = ConnectionManager()

# Broadcast task progress
async def notify_progress(task_id: str, progress: int):
    await manager.broadcast({
        "type": "task_progress",
        "task_id": task_id,
        "progress": progress
    })

# Stream chat response
async def stream_response(task_id: str, response_text: str):
    for chunk in response_text.split():
        await manager.broadcast({
            "type": "chat_chunk",
            "task_id": task_id,
            "chunk": chunk
        })
        await asyncio.sleep(0.01)  # Rate limiting
```

## Deployment

### Docker Container

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Copy code
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Expose port
EXPOSE 8000

# Run app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=sqlite:///./data/app.db
      - GEMINI_API_KEY=${GEMINI_API_KEY}
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

### Single Command Startup

```bash
# Local development
python main.py

# Production (Docker)
docker run -p 8000:8000 -v $(pwd)/data:/app/data -e GEMINI_API_KEY=$KEY mysmartnotes
```

---

For database schema, see [DATABASE.md](DATABASE.md).  
For development setup, see [DEVELOPMENT.md](DEVELOPMENT.md).  
For deployment, see [DEPLOYMENT.md](DEPLOYMENT.md).
