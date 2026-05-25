# MySmartNotes - AI-Powered Study Companion

## 📖 Project Overview
MySmartNotes is a multi-container web application designed to convert lecture materials (PDF, PPTX, images) into structured, AI-enhanced study notes. It utilizes a sophisticated processing pipeline to extract clean markdown, which then enables features like RAG-based chat, quiz generation, and progress tracking.

### Architecture & Tech Stack
- **Backend**: FastAPI (Python 3.11+)
- **Worker**: Dedicated Python process for background tasks (OCR, AI, Embeddings).
- **Frontend**: Vanilla JavaScript/HTML/CSS, served via **Nginx** (which also acts as a reverse proxy).
- **Database**: **PostgreSQL 15** (managed via SQLAlchemy ORM).
- **AI/LLM**: Supports Google Gemini (default), Hugging Face, and Ollama.
- **Vector Search**: Local embeddings (`sentence-transformers/all-MiniLM-L6-v2`) stored in PostgreSQL.
- **Deployment**: Orchestrated via **Docker Compose**.

## 🚀 Building and Running

### Development Environment (Local)
To run the project locally for development with hot-reloading:
```bash
# 1. Start Infrastructure (Database + Redis)
docker-compose up -d db redis

# 2. Setup virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 3. Configure environment
cp .env.example .env
# Edit .env to add your API keys and set DATABASE_URL=postgresql://mysmartnotes:mysmartnotespassword@localhost:5432/mysmartnotes

# 4. Run API and Worker
./scripts/dev.sh
```

### Docker Deployment
The recommended way to deploy the full stack:
```bash
docker-compose up -d --build
```
- **Web UI**: `http://localhost:8000`
- **API Docs**: `http://localhost:8000/docs`

### Testing
```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=app tests/
```

## 🛠️ Development Conventions

### Project Structure
- `app/main.py`: API entry point and middleware configuration.
- `app/worker_main.py`: Background task consumer.
- `app/processing/smart_pipeline.py`: Core extraction logic (Font-aware + AI Polish).
- `app/routers/`: Modular API endpoints.
- `app/models/db.py`: SQLAlchemy models for PostgreSQL.
- `app/schemas/schemas.py`: Pydantic models for request/response validation.

### Background Tasks
Tasks (OCR, AI generation, Embeddings) are managed via a database-backed queue. The API submits a `Task` record, which is then picked up and processed by the dedicated `Worker` service.

### Security & Authentication
- **JWT Auth**: Uses stateless JSON Web Tokens with a "sliding session" (re-issued on activity).
- **CSRF Protection**: Enforced for cookie-authenticated sessions.
- **IP Filtering & Lockdown Mode**: Configurable via the admin dashboard and `IPFilter` model.

### Logging
The system uses a granular logging configuration (`app/logging_config.py`) that outputs to 15 different log files in the `./logs` directory, separating concerns by API module and worker type.

### UI Development
The frontend is built with vanilla JavaScript and CSS to avoid build-step complexity. Static assets are served from `app/static/` and proxy-passed through Nginx in production.
