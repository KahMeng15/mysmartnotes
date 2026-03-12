
# MySmartNotes - AI-Powered Study Companion

## 📖 Project Overview
MySmartNotes is a lightweight, single-container web application designed to convert lecture materials (PDF, PPTX, images) into structured, AI-enhanced study notes. It features RAG-based chat, flashcard generation, quiz creation, and progress analytics.

## 🛠️ Tech Stack
- **Backend**: FastAPI (Python 3.9+)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (No build step)
- **Database**: SQLite (SQLAlchemy ORM)
- **Vector Search**: Local embeddings (sentence-transformers) stored in SQLite
- **AI Providers**: Google Gemini (default), Hugging Face, Ollama
- **Document Processing**: pdfplumber, python-pptx, Tesseract OCR
- **Deployment**: Docker (Single container)

## 📂 Key Directory Structure
- `app/`: Core application logic
  - `models/`: Database models (`db.py`)
  - `processing/`: Document extraction, OCR, and AI pipeline logic
  - `routers/`: API endpoints (auth, chat, documents, flashcards, etc.)
  - `schemas/`: Pydantic models for API validation
  - `static/`: Frontend assets (HTML, JS, CSS, Fonts)
  - `utils/`: Shared utilities (auth, db, tasks, websocket)
- `data/`: SQLite database storage
- `generated/`: Output location for generated study materials (PDFs, Word docs)
- `output/`: Extracted images and temporary processing files
- `scripts/`: Maintenance and migration scripts

## ⚙️ Configuration
- `.env`: Environment variables (API keys, DB URL, etc.)
- `app/config.py`: Pydantic settings management. Supports Global AI settings (admin-managed) and per-user personal settings.

## 🔄 Core Workflows
1. **Document Processing**: `app/processing/smart_pipeline.py` orchestrates font-aware text extraction, table detection, and OCR.
2. **Semantic Search (RAG)**: `app/processing/embeddings.py` generates chunks and vectors; `app/processing/search.py` performs similarity search for chat context.
3. **AI Chat**: `app/routers/chat.py` uses `app/processing/ai_client.py` to interact with multiple providers.
4. **Flashcards/Quizzes**: `app/processing/document_generator.py` handles AI-driven generation of study aids.

## 📝 Development Guidelines
- **Database**: Use `app/utils/db.py` for session management.
- **Background Tasks**: Managed via `ThreadPoolExecutor` in `app/utils/tasks.py` for simplicity.
- **Frontend**: Keep it vanilla. JS files are in `app/static/js/`, styles in `app/static/styles/`.
- **API**: Follow RESTful conventions. Use Pydantic schemas for request/response validation.

## 🛡️ Security
- **Admin Bootstrap**: Configurable via `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`.
- **IP Filtering**: Managed via `IPFilter` model and system middleware in `main.py`.
- **Lockdown Mode**: Restricts access to local network only.
