
# MySmartNotes - AI-Powered Study Companion

## 📖 Project Overview
MySmartNotes is an AI-powered study companion that converts lecture materials (PDF, PPTX, images) into structured, AI-enhanced study notes. It features a multi-container architecture for scalability, providing RAG-based chat, quiz creation, and progress analytics.

## 🛠️ Tech Stack
- **Backend**: FastAPI (Python 3.9+)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (Served via Nginx)
- **Worker**: Dedicated Python process for background tasks (OCR, AI, Embeddings)
- **Database**: PostgreSQL 15 (SQLAlchemy ORM)
- **Reverse Proxy**: Nginx (Acts as API proxy and static file server)
- **Vector Search**: Local embeddings (sentence-transformers) stored in PostgreSQL
- **AI Providers**: Google Gemini (default), Hugging Face, Ollama
- **Document Processing**: pdfplumber, python-pptx, Tesseract OCR
- **Deployment**: Docker Compose (Multi-container stack)

## 📂 Key Directory Structure
- `app/`: Core application logic
  - `models/`: Database models (`db.py`)
  - `processing/`: Document extraction, OCR, and AI pipeline logic
  - `routers/`: API endpoints (auth, chat, documents, quizzes, etc.)
  - `schemas/`: Pydantic models for API validation
  - `static/`: Frontend assets (HTML, JS, CSS, Fonts)
  - `utils/`: Shared utilities (auth, db, tasks, websocket)
  - `main.py`: API entry point
  - `worker_main.py`: Background worker entry point
  - `nginx.conf`: Nginx configuration
- `data/`: Persistent storage (PostgreSQL data and uploaded files)
- `generated/`: Output location for generated study materials (PDFs, Word docs)
- `logs/`: Centralized logs for all services
- `scripts/`: Maintenance, dev, and migration scripts

## ⚙️ Configuration
- `.env`: Environment variables (API keys, DB URL, etc.)
- `app/config.py`: Pydantic settings management. Supports Global AI settings (admin-managed) and per-user personal settings.

## 🔄 Core Workflows
1. **Document Processing**: `app/processing/smart_pipeline.py` orchestrates extraction, while `app/worker_main.py` handles the heavy lifting in the background.
2. **Semantic Search (RAG)**: `app/processing/embeddings.py` generates chunks and vectors; `app/processing/search.py` performs similarity search.
3. **AI Chat**: `app/routers/chat.py` uses `app/processing/ai_client.py` to interact with multiple providers.
4. **Task Management**: `app/utils/tasks.py` manages a DB-backed task queue processed by the Worker.

## 📝 Development Guidelines
- **Database**: Use `app/utils/db.py` for session management. Supports both SQLite (local) and PostgreSQL (containerized).
- **Background Tasks**: Managed via the `Task` model and processed by the dedicated worker.
- **Frontend**: Keep it vanilla. JS files are in `app/static/js/`, styles in `app/static/styles/`.
- **API**: Follow RESTful conventions. Use Pydantic schemas for request/response validation.

## 🛡️ Security
- **Admin Bootstrap**: Configurable via `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`.
- **IP Filtering**: Managed via `IPFilter` model and system middleware in `main.py`.
- **Lockdown Mode**: Restricts access to local network only.
