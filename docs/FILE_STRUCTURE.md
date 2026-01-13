# 📁 Project File Structure

Complete directory structure for MySmartNotes project.

## Development Structure (Bare Metal)

```text
/mysmartnotes
 ├── README.md                      # Project overview and quick start
 ├── .env.example                   # Environment variables template
 ├── .env                           # Local environment (gitignored)
 ├── .gitignore                     # Git ignore rules
 ├── requirements-dev.txt           # Development dependencies
 │
 ├── /docs                          # Documentation
 │    ├── ARCHITECTURE.md
 │    ├── FILE_STRUCTURE.md
 │    ├── DATABASE.md
 │    ├── DATA_STRUCTURES.md
 │    ├── ACTION_FLOWS.md
 │    ├── DEVELOPMENT.md
 │    ├── DEPLOYMENT.md
 │    ├── SECURITY.md
 │    ├── MONITORING.md
 │    ├── ADVANCED_FEATURES.md
 │    └── TROUBLESHOOTING.md
 │
 ├── /services                      # Microservices
 │    │
 │    ├── /frontend                 # Streamlit UI Service
 │    │    ├── app.py              # Main Streamlit application
 │    │    ├── requirements.txt    # Frontend dependencies
 │    │    ├── config.py           # Frontend configuration
 │    │    ├── /pages              # Streamlit pages
 │    │    │    ├── 01_dashboard.py
 │    │    │    ├── 02_revision.py
 │    │    │    ├── 03_tutor_chat.py
 │    │    │    ├── 04_quiz_zone.py
 │    │    │    └── 05_past_papers.py
 │    │    ├── /components         # Reusable UI components
 │    │    │    ├── sidebar.py
 │    │    │    ├── subject_panel.py
 │    │    │    ├── lecture_panel.py
 │    │    │    └── chat_interface.py
 │    │    └── /utils              # Frontend utilities
 │    │         ├── api_client.py  # API Gateway client
 │    │         ├── websocket_client.py
 │    │         └── session_manager.py
 │    │
 │    ├── /api_gateway              # FastAPI Gateway Service
 │    │    ├── main.py             # FastAPI application entry point
 │    │    ├── requirements.txt    # API dependencies
 │    │    ├── config.py           # API configuration
 │    │    ├── /routers            # API route handlers
 │    │    │    ├── __init__.py
 │    │    │    ├── auth.py        # Authentication endpoints
 │    │    │    ├── subjects.py    # Subject CRUD
 │    │    │    ├── lectures.py    # Lecture CRUD & upload
 │    │    │    ├── documents.py   # Generated documents
 │    │    │    ├── chat.py        # Chat endpoints
 │    │    │    ├── tasks.py       # Task status tracking
 │    │    │    └── share.py       # Share link management
 │    │    ├── /middleware         # Custom middleware
 │    │    │    ├── __init__.py
 │    │    │    ├── auth.py        # JWT authentication
 │    │    │    ├── cors.py        # CORS configuration
 │    │    │    ├── logging.py     # Request logging
 │    │    │    └── rate_limit.py  # Rate limiting
 │    │    ├── /websockets         # WebSocket handlers
 │    │    │    ├── __init__.py
 │    │    │    ├── connection_manager.py
 │    │    │    ├── chat_handler.py
 │    │    │    └── progress_handler.py
 │    │    └── /utils              # API utilities
 │    │         ├── validators.py
 │    │         ├── responses.py
 │    │         └── file_handler.py
 │    │
 │    ├── /workers                  # Celery Worker Service
 │    │    ├── celery_app.py       # Celery configuration
 │    │    ├── requirements.txt    # Worker dependencies
 │    │    ├── config.py           # Worker configuration
 │    │    ├── /tasks              # Celery tasks
 │    │    │    ├── __init__.py
 │    │    │    ├── ocr_tasks.py   # OCR and vision processing
 │    │    │    ├── ai_tasks.py    # LLM and embedding tasks
 │    │    │    ├── generation_tasks.py  # Document generation
 │    │    │    ├── search_tasks.py      # Web search tasks
 │    │    │    ├── quiz_tasks.py        # Quiz generation
 │    │    │    └── flashcard_tasks.py   # Flashcard generation
 │    │    ├── /processors         # Processing logic
 │    │    │    ├── __init__.py
 │    │    │    ├── pdf_processor.py
 │    │    │    ├── image_processor.py
 │    │    │    ├── layout_detector.py
 │    │    │    ├── ocr_engine.py
 │    │    │    └── text_cleaner.py
 │    │    └── /generators         # Document generators
 │    │         ├── __init__.py
 │    │         ├── cheat_sheet_generator.py
 │    │         ├── quiz_generator.py
 │    │         └── flashcard_generator.py
 │    │
 │    └── /shared                   # Shared code across services
 │         ├── __init__.py
 │         ├── models.py           # SQLAlchemy models
 │         ├── schemas.py          # Pydantic schemas
 │         ├── database.py         # Database connections
 │         ├── chroma_client.py    # ChromaDB client
 │         ├── redis_client.py     # Redis client
 │         ├── ollama_client.py    # Ollama client
 │         ├── utils.py            # Shared utilities
 │         ├── constants.py        # Application constants
 │         └── config.py           # Shared configuration
 │
 ├── /data                          # Persistent data (mounted as volumes)
 │    ├── /uploads                 # User uploads organized by subject
 │    │    └── <subject_id>/
 │    │         └── <lecture_id>/
 │    │              ├── original.pdf
 │    │              ├── /pages    # Extracted page images
 │    │              └── /figures  # Cropped diagrams
 │    ├── /generated               # Output documents
 │    │    └── <subject_id>/
 │    │         └── <lecture_id>/
 │    │              ├── cheat_sheet.docx
 │    │              ├── quiz.pdf
 │    │              └── flashcards.json
 │    ├── /chroma_db               # ChromaDB persistence
 │    │    └── <collection_id>/
 │    ├── /postgres_data           # PostgreSQL data (if running locally)
 │    ├── /redis_data              # Redis persistence
 │    └── /backups                 # Database backups
 │
 ├── /docker                        # Docker configuration
 │    ├── docker-compose.yml       # Full stack orchestration
 │    ├── docker-compose.dev.yml   # Development overrides
 │    ├── docker-compose.prod.yml  # Production overrides
 │    ├── docker-compose.infra.yml # Infrastructure only (Redis, PostgreSQL)
 │    ├── Dockerfile.frontend      # Frontend service image
 │    ├── Dockerfile.gateway       # API Gateway image
 │    ├── Dockerfile.worker        # Worker service image
 │    ├── nginx.conf               # Nginx configuration
 │    └── /ssl                     # SSL certificates (production)
 │
 ├── /scripts                       # Utility scripts
 │    ├── init_db.py               # Database initialization
 │    ├── migrate_db.py            # Database migrations
 │    ├── start_dev.sh             # Start all services locally
 │    ├── stop_dev.sh              # Stop all services
 │    ├── health_check.py          # Service health checks
 │    ├── backup_db.sh             # Backup databases
 │    ├── restore_db.sh            # Restore from backup
 │    └── seed_data.py             # Seed test data
 │
 ├── /tests                         # Test suite
 │    ├── __init__.py
 │    ├── conftest.py              # Pytest configuration
 │    ├── /unit                    # Unit tests
 │    │    ├── test_models.py
 │    │    ├── test_schemas.py
 │    │    ├── test_processors.py
 │    │    └── test_generators.py
 │    ├── /integration             # Integration tests
 │    │    ├── test_api_endpoints.py
 │    │    ├── test_workflows.py
 │    │    └── test_websockets.py
 │    └── /fixtures                # Test fixtures
 │         ├── sample.pdf
 │         ├── sample.pptx
 │         └── test_data.json
 │
 └── /logs                          # Application logs (gitignored)
      ├── frontend.log
      ├── api_gateway.log
      ├── celery_worker.log
      └── /archived                # Archived logs
```

## Docker Container Structure

When running in Docker, the file structure is mapped as follows:

```
Container Volumes:
  nginx:
    - ./docker/nginx.conf → /etc/nginx/nginx.conf
    - ./data/generated → /usr/share/nginx/html/downloads

  frontend:
    - ./services/frontend → /app (code)
    - ./services/shared → /app/shared

  api_gateway:
    - ./services/api_gateway → /app (code)
    - ./services/shared → /app/shared
    - ./data/uploads → /data/uploads

  celery_worker:
    - ./services/workers → /app (code)
    - ./services/shared → /app/shared
    - ./data → /data (full access for processing)

  postgres:
    - postgres_data → /var/lib/postgresql/data (named volume)

  redis:
    - redis_data → /data (named volume)

  chroma:
    - ./data/chroma_db → /chroma/chroma

  ollama:
    - ollama_models → /root/.ollama (named volume)
```

## File Naming Conventions

### Upload Files
```
Format: <subject_id>/<lecture_id>/<filename>
Example: 123/456/original.pdf
```

### Generated Documents
```
Format: <subject_id>/<lecture_id>/<document_type>_<timestamp>.<ext>
Example: 123/456/cheat_sheet_20260113_143022.docx
```

### Cropped Figures
```
Format: slide_<page_number>_fig_<figure_number>.png
Example: slide_05_fig_02.png
```

### Log Files
```
Format: <service_name>_<date>.log
Example: celery_worker_20260113.log
```

## Important Paths

| Path | Purpose | Access |
|------|---------|--------|
| `/data/uploads` | User uploaded files | API Gateway, Workers |
| `/data/generated` | Generated documents | Workers, nginx |
| `/data/chroma_db` | Vector embeddings | Workers, API Gateway |
| `/services/shared` | Shared code | All services |
| `/logs` | Application logs | All services |
| `/scripts` | Utility scripts | Host machine |

## Environment-Specific Paths

### Development (Bare Metal)
```bash
# Services run from their respective directories
cd services/frontend && streamlit run app.py
cd services/api_gateway && uvicorn main:app
cd services/workers && celery -A celery_app worker

# Data stored in project root
./data/uploads
./data/generated
```

### Production (Docker)
```bash
# Services run in containers
# Data stored in Docker volumes
docker volume ls  # View all volumes
docker-compose exec api_gateway ls /data/uploads  # Access from container
```

## .gitignore Recommendations

```gitignore
# Environment
.env
*.env
!.env.example

# Data
/data/*
!/data/.gitkeep

# Logs
/logs/*
!/logs/.gitkeep

# Python
__pycache__/
*.py[cod]
*$py.class
*.so
.Python
venv/
env/

# IDE
.vscode/
.idea/
*.swp
*.swo

# Docker
.dockerignore

# OS
.DS_Store
Thumbs.db

# Backups
*.bak
*.backup
```
