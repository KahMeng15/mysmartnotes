# 💻 Development Guide

Complete development setup and workflow guide for MySmartNotes.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Development Setup](#development-setup)
3. [Development Workflow](#development-workflow)
4. [Code Organization](#code-organization)
5. [Testing](#testing)
6. [Debugging](#debugging)
7. [Migration Path](#migration-path)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Python** | 3.11+ | Application runtime |
| **Node.js** | 18+ (optional) | Frontend tooling |
| **Docker** | 24+ | Containerization |
| **Docker Compose** | 2.20+ | Multi-container orchestration |
| **Git** | 2.40+ | Version control |

### System Requirements

**Minimum (Development):**
- CPU: 4 cores
- RAM: 8GB
- Storage: 20GB free

**Recommended (Development):**
- CPU: 8 cores
- RAM: 16GB
- Storage: 50GB SSD

---

## Development Setup

### Option 1: Bare Metal (Full Local Development)

**Step 1: Clone and Setup Environment**

```bash
# Clone repository
git clone <repo-url> mysmartnotes
cd mysmartnotes

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements-dev.txt
```

**Step 2: Install System Dependencies**

**macOS:**
```bash
# Homebrew
brew install redis postgresql tesseract poppler

# Ollama
brew install ollama
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y redis-server postgresql tesseract-ocr poppler-utils

# Ollama
curl https://ollama.ai/install.sh | sh
```

**Windows:**
```powershell
# Using Chocolatey
choco install redis-64 postgresql tesseract

# Ollama - Download from https://ollama.ai
```

**Step 3: Configure Environment**

```bash
# Copy environment template
cp .env.example .env

# Edit .env file
nano .env
```

**.env file:**
```bash
# Environment
ENVIRONMENT=development
DEBUG=true

# Database
DATABASE_URL=postgresql://user:devpass@localhost:5432/mysmartnotes_dev

# Redis
REDIS_URL=redis://localhost:6379/0

# Ollama
OLLAMA_URL=http://localhost:11434

# JWT Secret (generate new for production)
JWT_SECRET_KEY=dev-secret-key-change-in-production

# File Storage
UPLOAD_PATH=/Users/yourusername/mysmartnotes/data/uploads
GENERATED_PATH=/Users/yourusername/mysmartnotes/data/generated

# OCR Settings
OCR_DPI=200  # Lower DPI for faster development
TESSERACT_PATH=/usr/local/bin/tesseract

# Worker Settings
CELERY_WORKERS=2
CELERY_CONCURRENCY=2

# API Settings
API_HOST=0.0.0.0
API_PORT=8000
FRONTEND_PORT=8501
```

**Step 4: Initialize Database**

```bash
# Start PostgreSQL
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql

# Create database and user
psql postgres -c "CREATE DATABASE mysmartnotes_dev;"
psql postgres -c "CREATE USER user WITH PASSWORD 'devpass';"
psql postgres -c "GRANT ALL PRIVILEGES ON DATABASE mysmartnotes_dev TO user;"

# Run migrations
python scripts/init_db.py
```

**Step 5: Start Infrastructure Services**

```bash
# Terminal 1: Redis
redis-server

# Terminal 2: Ollama
ollama serve

# Terminal 3: Pull AI model (one time)
ollama pull llama3:8b-instruct-q4_0
```

**Step 6: Start Application Services**

```bash
# Terminal 4: FastAPI Gateway
cd services/api_gateway
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 5: Celery Workers
cd services/workers
celery -A celery_app worker --loglevel=info -Q ocr,ai,generation --concurrency=2

# Terminal 6: Celery Beat (scheduled tasks)
cd services/workers
celery -A celery_app beat --loglevel=info

# Terminal 7: Flower (Celery monitoring)
cd services/workers
celery -A celery_app flower --port=5555

# Terminal 8: Streamlit Frontend
cd services/frontend
streamlit run app.py --server.port 8501
```

**Quick Start Script:**

Create `scripts/start_dev.sh`:
```bash
#!/bin/bash

# Start infrastructure in background
redis-server --daemonize yes
ollama serve &

# Wait for services to start
sleep 5

# Start application services
cd services/api_gateway && uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
cd services/workers && celery -A celery_app worker --loglevel=info -Q ocr,ai,generation &
cd services/workers && celery -A celery_app beat --loglevel=info &
cd services/workers && celery -A celery_app flower --port=5555 &
cd services/frontend && streamlit run app.py --server.port 8501 &

echo "All services started!"
echo "Frontend: http://localhost:8501"
echo "API Docs: http://localhost:8000/docs"
echo "Flower: http://localhost:5555"
```

Make executable:
```bash
chmod +x scripts/start_dev.sh
./scripts/start_dev.sh
```

---

### Option 2: Hybrid (Docker Infrastructure + Local Code)

Best for: Avoiding local installation of databases while keeping code editable

**Step 1: Start Infrastructure Only**

Create `docker-compose.infra.yml`:
```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  postgres:
    image: postgres:15-alpine
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=devpass
      - POSTGRES_DB=mysmartnotes_dev
    volumes:
      - postgres_data:/var/lib/postgresql/data

  ollama:
    image: ollama/ollama:latest
    ports:
      - "11434:11434"
    volumes:
      - ollama_models:/root/.ollama

volumes:
  redis_data:
  postgres_data:
  ollama_models:
```

**Start infrastructure:**
```bash
docker-compose -f docker-compose.infra.yml up -d

# Pull AI model
docker-compose -f docker-compose.infra.yml exec ollama ollama pull llama3:8b-instruct-q4_0
```

**Step 2: Run Application Services Locally**

Follow steps 1, 3-6 from Option 1, but skip step 2 (services run in Docker).

---

### Option 3: Full Docker (Production-like)

Best for: Testing production deployment locally

```bash
# Start everything
docker-compose up -d

# Initialize database (first time only)
docker-compose exec api_gateway python /app/scripts/init_db.py

# Pull AI model (first time only)
docker-compose exec ollama ollama pull llama3:8b-instruct-q4_0

# Access application
open http://localhost
open http://localhost:5555  # Flower
```

---

## Development Workflow

### Daily Development Cycle

**1. Start Development Session**
```bash
# Pull latest changes
git pull origin main

# Activate virtual environment
source venv/bin/activate

# Start services
./scripts/start_dev.sh

# Or start infrastructure only
docker-compose -f docker-compose.infra.yml up -d
```

**2. Make Code Changes**

Services with auto-reload:
- ✅ FastAPI (changes reload automatically)
- ✅ Streamlit (changes reload automatically)
- ❌ Celery workers (require manual restart)

**Restart Celery workers after changes:**
```bash
# Find Celery process
ps aux | grep celery

# Kill and restart
pkill -f celery
cd services/workers && celery -A celery_app worker --loglevel=info
```

**3. Test Changes**

```bash
# Run unit tests
pytest tests/unit/

# Run specific test file
pytest tests/unit/test_models.py

# Run integration tests
pytest tests/integration/

# Run with coverage
pytest --cov=services --cov-report=html
```

**4. Check Code Quality**

```bash
# Linting
flake8 services/
pylint services/

# Type checking
mypy services/

# Format code
black services/
isort services/
```

**5. Commit Changes**

```bash
git add .
git commit -m "feat: add feature description"
git push origin feature-branch
```

---

## Code Organization

### Project Structure Principles

**1. Separation of Concerns**
- Each service has a single, well-defined responsibility
- Shared code goes in `/services/shared/`
- No circular dependencies

**2. Service Independence**
- Services communicate via APIs only
- No direct database access across services
- Each service can be deployed independently

**3. Configuration Management**
- All configuration in environment variables
- No hardcoded values
- Use `.env` for local, secrets manager for production

### Adding a New Feature

**Example: Add a new document type "Summary"**

**Step 1: Update Database Schema**
```python
# services/shared/models.py
# Add to GeneratedDocument.doc_type enum
doc_type = Column(String(50))  # Add 'summary' as valid value
```

**Step 2: Create Pydantic Schema**
```python
# services/shared/schemas.py
class SummaryGenerateRequest(BaseModel):
    lecture_id: int
    length: str = Field(..., regex=r'^(short|medium|long)$')
    include_key_points: bool = True
```

**Step 3: Add API Endpoint**
```python
# services/api_gateway/routers/documents.py
@router.post("/documents/generate/summary")
async def generate_summary(request: SummaryGenerateRequest):
    task = generate_summary_task.delay(
        lecture_id=request.lecture_id,
        options=request.dict()
    )
    return {"task_id": task.id}
```

**Step 4: Implement Worker Task**
```python
# services/workers/tasks/generation_tasks.py
@celery_task
def generate_summary_task(lecture_id, options):
    # 1. Query ChromaDB for content
    # 2. Use Ollama to generate summary
    # 3. Format as document
    # 4. Save file
    # 5. Update database
    pass
```

**Step 5: Add Frontend UI**
```python
# services/frontend/pages/02_revision.py
if st.button("Generate Summary"):
    response = api_client.post(
        "/documents/generate/summary",
        json={"lecture_id": lecture_id, "length": "medium"}
    )
    st.success(f"Task started: {response['task_id']}")
```

**Step 6: Write Tests**
```python
# tests/unit/test_summary_generation.py
def test_generate_summary():
    result = generate_summary_task(lecture_id=1, options={})
    assert result.status == "success"
```

---

## Testing

### Test Structure

```
/tests
├── conftest.py           # Pytest configuration and fixtures
├── /unit                 # Unit tests
│   ├── test_models.py
│   ├── test_schemas.py
│   ├── test_processors.py
│   └── test_generators.py
├── /integration          # Integration tests
│   ├── test_api_endpoints.py
│   ├── test_workflows.py
│   └── test_websockets.py
└── /fixtures             # Test data
    ├── sample.pdf
    └── test_data.json
```

### Writing Tests

**Unit Test Example:**
```python
# tests/unit/test_processors.py
import pytest
from services.workers.processors.pdf_processor import PDFProcessor

@pytest.fixture
def pdf_processor():
    return PDFProcessor()

def test_pdf_to_images(pdf_processor, tmp_path):
    # Arrange
    pdf_path = "tests/fixtures/sample.pdf"
    
    # Act
    images = pdf_processor.convert_to_images(pdf_path, tmp_path)
    
    # Assert
    assert len(images) > 0
    assert all(img.exists() for img in images)
```

**Integration Test Example:**
```python
# tests/integration/test_api_endpoints.py
import pytest
from fastapi.testclient import TestClient
from services.api_gateway.main import app

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def auth_headers(client):
    # Login and get token
    response = client.post("/auth/login", json={
        "username": "testuser",
        "password": "testpass"
    })
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

def test_create_subject(client, auth_headers):
    # Act
    response = client.post(
        "/subjects",
        json={"name": "Test Subject"},
        headers=auth_headers
    )
    
    # Assert
    assert response.status_code == 201
    assert response.json()["name"] == "Test Subject"
```

### Running Tests

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/unit/test_models.py

# Run specific test
pytest tests/unit/test_models.py::test_user_creation

# Run with coverage
pytest --cov=services --cov-report=html

# Run in parallel (faster)
pytest -n auto

# Run only failed tests
pytest --lf

# Run with print output
pytest -s
```

### Test Database

Use a separate test database:

```python
# conftest.py
import pytest
from sqlalchemy import create_engine
from services.shared.database import Base

@pytest.fixture(scope="session")
def test_engine():
    engine = create_engine("postgresql://user:pass@localhost/mysmartnotes_test")
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
```

---

## Debugging

### Debugging FastAPI

**Using VS Code:**

Create `.vscode/launch.json`:
```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "FastAPI",
            "type": "python",
            "request": "launch",
            "module": "uvicorn",
            "args": [
                "services.api_gateway.main:app",
                "--reload",
                "--host", "0.0.0.0",
                "--port", "8000"
            ],
            "jinja": true,
            "justMyCode": false
        }
    ]
}
```

**Using pdb:**
```python
# Add breakpoint in code
import pdb; pdb.set_trace()

# Or use Python 3.7+ breakpoint()
breakpoint()
```

### Debugging Celery Tasks

**Enable eager mode for synchronous execution:**
```python
# celery_app.py
if DEBUG:
    celery.conf.task_always_eager = True
    celery.conf.task_eager_propagates = True
```

**View task logs:**
```bash
# Increase log level
celery -A celery_app worker --loglevel=debug

# Or in code
import logging
logger = logging.getLogger(__name__)
logger.debug("Debug message")
```

### Monitoring Tools

**API Requests:**
```bash
# View all requests
tail -f services/api_gateway/logs/app.log

# Filter by endpoint
grep "/subjects" services/api_gateway/logs/app.log
```

**Database Queries:**
```python
# Enable SQLAlchemy query logging
import logging
logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)
```

**Redis Commands:**
```bash
# Monitor Redis commands
redis-cli MONITOR

# Check queue length
redis-cli -n 0 LLEN celery

# View all keys
redis-cli KEYS '*'
```

**Celery Tasks:**
```bash
# Open Flower dashboard
open http://localhost:5555

# CLI monitoring
celery -A celery_app inspect active
celery -A celery_app inspect stats
```

---

## Migration Path

### From Monolith to Microservices

If you have an existing monolithic Streamlit app, here's how to migrate:

**Phase 1: Extract Business Logic (Week 1)**

```python
# Before: Everything in app.py
def process_pdf(file):
    # OCR logic here
    # AI logic here
    # Generation logic here
    pass

# After: Separate modules
from services.workers.processors import pdf_processor
from services.workers.tasks import ai_tasks
from services.workers.generators import cheat_sheet_generator

def process_pdf(file):
    images = pdf_processor.convert_to_images(file)
    text = pdf_processor.extract_text(images)
    summary = ai_tasks.summarize(text)
    return cheat_sheet_generator.generate(summary)
```

**Phase 2: Add Database Layer (Week 2)**

```python
# Replace SQLite with PostgreSQL
# Before: SQLite
conn = sqlite3.connect('app.db')

# After: SQLAlchemy + PostgreSQL
from services.shared.database import SessionLocal
from services.shared.models import User, Subject

db = SessionLocal()
user = db.query(User).filter(User.username == username).first()
```

**Phase 3: Add Message Queue (Week 3)**

```python
# Add Redis and Celery
# Before: Synchronous
result = process_pdf(file)

# After: Asynchronous
task = process_pdf_task.delay(file_path)
task_id = task.id
```

**Phase 4: Create API Gateway (Week 4)**

```python
# Create FastAPI service
# services/api_gateway/main.py
from fastapi import FastAPI

app = FastAPI()

@app.post("/lectures/upload")
async def upload_lecture(file: UploadFile):
    # Save file
    # Queue task
    return {"task_id": task_id}
```

**Phase 5: Separate Frontend (Week 5)**

```python
# Update Streamlit to call API
# Before: Direct function call
result = process_pdf(file)

# After: API call
import requests
response = requests.post(
    "http://localhost:8000/lectures/upload",
    files={"file": file}
)
task_id = response.json()["task_id"]
```

**Phase 6: Containerize (Week 6)**

```bash
# Create Dockerfiles and docker-compose.yml
docker-compose up -d
```

---

For deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).  
For troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
