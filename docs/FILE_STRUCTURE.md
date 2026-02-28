# 📁 Project File Structure

Simplified single-application directory structure for MySmartNotes.

## Project Structure

```
/mysmartnotes
├── README.md                           # Quick start & overview
├── requirements.txt                    # Python dependencies
├── main.py                             # Entry point - run this!
├── config.py                           # Configuration & environment
├── .env.example                        # Environment template
├── .gitignore                          # Git ignore rules
├── Dockerfile                          # Docker image definition
├── docker-compose.yml                  # Single-service compose file
│
├── /docs                               # Documentation
│   ├── INDEX.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── DEVELOPMENT.md
│   ├── DEPLOYMENT.md
│   ├── FILE_STRUCTURE.md
│   ├── RESOURCE_REQUIREMENTS.md
│   ├── TROUBLESHOOTING.md
│   ├── ACTION_FLOWS.md
│   ├── ADVANCED_FEATURES.md
│   ├── SECURITY.md
│   ├── MONITORING.md
│   └── DATA_STRUCTURES.md
│
├── /app                                # Application code
│   ├── __init__.py
│   ├── main.py                        # FastAPI app
│   ├── config.py                      # Settings
│   │
│   ├── /routers                       # API endpoints
│   │   ├── __init__.py
│   │   ├── auth.py                    # Login/register
│   │   ├── subjects.py                # Subject CRUD
│   │   ├── lectures.py                # Lecture upload
│   │   ├── documents.py               # Document generation
│   │   ├── chat.py                    # Chat interface
│   │   └── tasks.py                   # Task status
│   │
│   ├── /models                        # Database models (SQLAlchemy)
│   │   ├── __init__.py
│   │   └── db.py                      # All ORM models
│   │
│   ├── /schemas                       # Request/response schemas (Pydantic)
│   │   ├── __init__.py
│   │   └── schemas.py                 # All data models
│   │
│   ├── /processing                    # Core logic
│   │   ├── __init__.py
│   │   ├── ocr.py                     # PDF/PPTX processing, OCR
│   │   ├── ai_client.py               # Gemini/HF API calls
│   │   ├── embeddings.py              # Vector embeddings (sentence-transformers)
│   │   ├── generators.py              # Document generation (docx, pdf)
│   │   └── search.py                  # Web search (DuckDuckGo)
│   │
│   ├── /utils                         # Utility functions
│   │   ├── __init__.py
│   │   ├── db.py                      # Database session management
│   │   ├── auth.py                    # JWT token utilities
│   │   ├── tasks.py                   # Background task queue
│   │   ├── websocket.py               # WebSocket connection manager
│   │   └── file_handler.py            # File upload/download utilities
│   │
│   └── /static                        # Frontend assets
│       ├── index.html                 # Main page
│       ├── style.css                  # Styling
│       ├── app.js                     # Frontend logic
│       └── /assets                    # Images, icons, fonts
│           ├── logo.png
│           ├── favicon.ico
│           └── ...
│
├── /data (Docker volume)              # Runtime data (created automatically)
│   ├── app.db                         # SQLite database
│   ├── /uploads                       # User uploaded files
│   │   └── lecture_<id>/
│   │       ├── original.pdf
│   │       └── /pages                 # Extracted page images
│   ├── /generated                     # Generated documents
│   │   └── cheat_sheet_<timestamp>.docx
│   ├── /embeddings                    # Vector embedding backups
│   │   └── lecture_<id>.json
│   └── /backups                       # Database backups
│       └── app_<date>.db
│
├── /scripts                           # Utility scripts
│   ├── init_db.py                     # Initialize database
│   ├── backup_db.py                   # Backup database
│   ├── seed_data.py                   # Add test data
│   └── health_check.py                # Verify service is running
│
├── /tests                             # Test suite
│   ├── __init__.py
│   ├── conftest.py                    # Pytest configuration
│   ├── /unit                          # Unit tests
│   │   ├── test_models.py
│   │   ├── test_schemas.py
│   │   ├── test_processing.py
│   │   └── test_api.py
│   ├── /integration                   # Integration tests
│   │   ├── test_upload_workflow.py
│   │   ├── test_chat.py
│   │   └── test_document_generation.py
│   └── /fixtures                      # Test data
│       ├── sample.pdf
│       ├── sample.pptx
│       └── test_data.json
│
└── /logs                              # Application logs (gitignored)
    └── app.log
```

## Quick Start

```bash
# Local development
python main.py

# Docker
docker-compose up

# Docker (production)
docker run -p 8000:8000 -v $(pwd)/data:/app/data -e GEMINI_API_KEY=$KEY mysmartnotes
```

## Important Paths

| Path | Purpose | Example |
|------|---------|---------|
| `/app` | Main application code | All Python code here |
| `/app/static` | Frontend (HTML/CSS/JS) | Served at `/static/` |
| `/data/app.db` | SQLite database | Single file database |
| `/data/uploads` | User uploaded files | PDF, PPTX files |
| `/data/generated` | Generated documents | DOCX, PDF, JSON files |
| `/data/embeddings` | Embedding cache | JSON backups |
| `/data/backups` | Database backups | SQLite backups |

## File Naming Conventions

### Database File
```
app.db                          # Single SQLite database
```

### Uploaded Files
```
/data/uploads/lecture_<id>/original.pdf
/data/uploads/lecture_<id>/pages/page_001.png
```

### Generated Documents
```
/data/generated/cheat_sheet_<lecture_id>_<timestamp>.docx
/data/generated/quiz_<lecture_id>_<timestamp>.pdf
/data/generated/flashcards_<lecture_id>_<timestamp>.json
```

### Embedding Cache
```
/data/embeddings/lecture_<id>.json
```

### Logs
```
/logs/app.log                   # Main application log
```

## Environment Variables (.env)

```bash
# Server
DATABASE_URL=sqlite:///./data/app.db
JWT_SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256

# External APIs
GEMINI_API_KEY=your-gemini-key
HUGGINGFACE_API_KEY=your-hf-key  # Optional alternative

# File paths
UPLOAD_PATH=/data/uploads
GENERATED_PATH=/data/generated
EMBEDDINGS_PATH=/data/embeddings

# Server settings
HOST=0.0.0.0
PORT=8000
DEBUG=False
WORKERS=4
```

## .gitignore

```
# Environment
.env
.env.local
!.env.example

# Data
/data/
!data/.gitkeep

# Logs
/logs/
*.log

# Python
__pycache__/
*.py[cod]
.venv/
venv/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
```

## Single File Execution

The entire application runs from a single command:

```bash
python main.py
```

This:
1. Initializes the SQLite database (if needed)
2. Starts FastAPI server on port 8000
3. Loads LLM API credentials
4. Prepares background task executor
5. Serves static frontend files
6. Opens WebSocket for real-time updates

**No need to start separate services!**

---

For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).  
For development setup, see [DEVELOPMENT.md](DEVELOPMENT.md).
