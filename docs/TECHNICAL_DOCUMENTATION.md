# MySmartNotes Technical Documentation

## 1. Introduction
MySmartNotes is an AI-powered study companion designed to convert lecture materials (PDF, PPTX, images) into structured, searchable, and interactive study notes. It provides students and small study groups with tools for semantic Q&A, quiz generation, and progress tracking.

The project is built with a focus on **scalability, reliability, and privacy**, using a **multi-container architecture** to separate API concerns from resource-intensive background processing.

---

## 2. Architecture & Tech Stack

MySmartNotes follows a modular, multi-service architecture designed for reliable performance.

### 2.1 Services
- **Frontend (Nginx)**: Serves static assets and acts as a reverse proxy for the API.
- **API (FastAPI)**: Handles user authentication, database CRUD operations, and task submission.
- **Worker (Python)**: Dedicated background process that polls for tasks (OCR, AI, Embeddings) and executes them.
- **Database (PostgreSQL)**: Persistent storage for application data and the task queue.

### 2.2 Stack
- **Backend Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL 15 with SQLAlchemy ORM.
- **Vector Search**: Local embeddings generated via `sentence-transformers` and stored in PostgreSQL.
- **Background Tasks**: Managed via a DB-backed task queue processed by the dedicated worker.
- **AI Integration**: Custom `AIClient` supporting Google Gemini, Hugging Face Inference API, and local Ollama.

### 2.3 Frontend
- **Framework**: Vanilla JavaScript, HTML5, and CSS3.
- **Build System**: Zero-build (no npm/webpack required).
- **Markdown Rendering**: `marked.js` on the client-side.
- **Real-time Updates**: WebSockets for live processing progress.

---

## 3. Data Models & Database Schema

The database consists of several key entities managed via SQLAlchemy:

- **User**: Authentication, personal AI configurations, and Pomodoro preferences.
- **SubjectGroup**: Organizes subjects into higher-level categories (e.g., "Semester 1").
- **Subject**: Individual courses or topics.
- **Lecture**: The core document entity. Stores file metadata and extracted content.
- **LectureEmbedding**: Stores vector embeddings and text chunks for semantic search.
- **Task**: Tracking background processing jobs (OCR, Embeddings, AI generation).
- **ChatMessage**: Stores conversation history and RAG sources.
- **Quiz / QuizQuestion / QuizProgress**: Handles AI-generated quizzes and SRS tracking.
- **StudySession**: Tracks time spent studying and performance metrics.
- **Summary**: Stores versioned AI-generated summaries and cheat sheets.
- **SystemSettings**: Global configuration for system-wide AI and security limits.

---

## 4. Core Workflows

### 4.1 Document Processing Pipeline (`SmartPipeline`)
The extraction pipeline is designed to preserve the semantic structure of lecture slides.

1. **Submission**: When a user uploads a file, the API creates an `ocr` task in the database.
2. **Extraction**:
   - **PDF**: Uses `pdfplumber` for table extraction and a custom `FontAwareExtractor` to detect headings.
   - **PPTX**: Uses `python-pptx` to extract text from shapes.
3. **Worker Processing**: The Worker picks up the task, performs the extraction, and updates the task status.
4. **AI Polish**: (Optional) Refines formatting and ensures logical consistency.

### 4.2 Semantic Search & RAG
MySmartNotes implements a "Zero-Config RAG" system:

1. **Chunking**: Extracted text is split into ~500-character chunks.
2. **Embedding**: Chunks are converted into 384-dimensional vectors using `sentence-transformers` on the Worker.
3. **Storage**: Vectors are stored in the `lecture_embeddings` table in PostgreSQL.
4. **Retrieval**: At query time, the user's question is embedded, and cosine similarity is calculated to find relevant chunks.
5. **Augmentation**: Top-K chunks are injected into the LLM prompt as context.

### 4.3 AI Integration (`AIClient`)
The system abstracts AI providers to allow flexibility:

- **Gemini**: Primary provider for high-speed processing.
- **Hugging Face**: Support for open-source models via the Inference API.
- **Ollama**: Offline support with local models.

---

## 5. Security & Authentication

- **JWT Auth**: Stateless authentication using JSON Web Tokens.
- **Encryption**: Sensitive API keys are encrypted at rest using Fernet (AES-128).
- **IP Filtering**: Built-in middleware to whitelist/blacklist IP addresses.
- **Lockdown Mode**: Restricts access to the local network only.

---

## 6. Directory Structure

```text
/
├── app/
│   ├── models/             # SQLAlchemy DB models
│   ├── processing/         # Core extraction & AI logic
│   ├── routers/            # FastAPI API endpoints
│   ├── static/             # Frontend assets (HTML, JS, CSS)
│   ├── utils/              # Utilities (Auth, Tasks, DB)
│   ├── main.py             # API entry point
│   ├── worker_main.py      # Background worker entry point
│   └── nginx.conf          # Nginx configuration
├── data/                   # Persistent storage (Postgres/Uploads)
├── docs/                   # Documentation files
├── logs/                   # Centralized logging directory
└── scripts/                # Utility & Dev scripts
```

---

## 7. Performance & Scaling

- **Worker Separation**: Decoupling processing from the API prevents the UI from becoming unresponsive during heavy tasks.
- **PostgreSQL**: Provides better concurrency and reliability than SQLite for multi-user environments.
- **Resource Usage**: Designed to run on modest hardware (4 vCPUs, 4GB RAM recommended for multi-container setup).

---

## 8. Development Guidelines

- **Database Migrations**: Managed via `app/utils/db.py`.
- **Worker Logic**: When adding new processing features, ensure they are integrated into the `Task` model and the `TASK_REGISTRY` in `worker_main.py`.
- **API**: Always use Pydantic schemas in `app/schemas/` for validation.
