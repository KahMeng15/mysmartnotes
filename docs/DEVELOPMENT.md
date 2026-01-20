# 💻 Development Guide

Simple development setup for MySmartNotes - run everything from a single file!

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Development Workflow](#development-workflow)
4. [API Documentation](#api-documentation)
5. [Testing](#testing)
6. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| **Python** | 3.11+ | Application runtime |
| **pip** | Latest | Package manager |
| **Git** | Latest | Version control |
| **Docker** (optional) | 24+ | For production deployment |

### System Requirements

**Minimum:**
- CPU: 2 cores
- RAM: 4GB
- Storage: 10GB free

**Recommended:**
- CPU: 4 cores
- RAM: 8GB  
- Storage: 20GB SSD

---

## Quick Start

### 1. Clone Repository

```bash
git clone <repo-url> mysmartnotes
cd mysmartnotes
```

### 2. Create Virtual Environment

```bash
# macOS/Linux
python -m venv venv
source venv/bin/activate

# Windows
python -m venv venv
venv\Scripts\activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
```

### 4. Install System Dependencies

```bash
# macOS (Homebrew)
brew install tesseract poppler

# Ubuntu/Debian
sudo apt install tesseract-ocr poppler-utils

# Windows (Chocolatey)
choco install tesseract poppler
```

### 5. Configure Environment

```bash
# Copy template
cp .env.example .env

# Edit .env with your settings
nano .env
```

**.env file:**
```bash
# Server
DATABASE_URL=sqlite:///./data/app.db
HOST=0.0.0.0
PORT=8000
DEBUG=True

# Security
JWT_SECRET_KEY=your-secret-key-here-change-this
JWT_ALGORITHM=HS256

# External APIs (get free API keys from these services)
GEMINI_API_KEY=your-gemini-key-here

# File paths
UPLOAD_PATH=./data/uploads
GENERATED_PATH=./data/generated
EMBEDDINGS_PATH=./data/embeddings

# Optional: Hugging Face API (alternative to Gemini)
# HUGGINGFACE_API_KEY=your-hf-key-here
```

### 6. Start Application

```bash
python main.py
```

**That's it! Everything starts with one command.**

Your app is now running at:
- **Frontend:** http://localhost:8000
- **API Docs:** http://localhost:8000/docs
- **Database:** `./data/app.db`

---

## Development Workflow

### First Run

```bash
# Activate virtual environment
source venv/bin/activate

# Start the app
python main.py

# In another terminal, create test data:
python scripts/seed_data.py
```

### Daily Development

```bash
# Activate venv
source venv/bin/activate

# Start app (auto-reloads on file changes)
python main.py

# App runs at http://localhost:8000
# API docs at http://localhost:8000/docs
```

### Making Changes

The app has hot-reload enabled. When you edit Python files, the server automatically restarts:

```bash
# Edit a file, save it
nano app/routers/chat.py

# Server automatically reloads - no need to restart!
```

**Note:** If changes don't appear, restart manually:
```bash
# Ctrl+C to stop
# python main.py to restart
```

---

## API Documentation

### Auto-Generated Docs

FastAPI automatically generates interactive API docs:

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

### Main Endpoints

**Authentication:**
```bash
POST /auth/register       # Register new account
POST /auth/login          # Login and get JWT token
POST /auth/refresh        # Refresh access token
```

**Subjects:**
```bash
GET /api/subjects         # List all subjects
POST /api/subjects        # Create new subject
GET /api/subjects/{id}    # Get subject details
PUT /api/subjects/{id}    # Update subject
DELETE /api/subjects/{id} # Delete subject
```

**Lectures:**
```bash
POST /api/lectures/upload       # Upload PDF/PPTX file
GET /api/lectures/{id}          # Get lecture details
GET /api/lectures/{id}/documents# List generated documents
```

**Chat:**
```bash
WebSocket /ws              # Real-time chat connection
```

**Task Status:**
```bash
GET /api/tasks/{task_id}   # Check background task status
```

### Example: Register & Login

```bash
# Register
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'

# Login (get token)
TOKEN=$(curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}' \
  | jq -r '.access_token')

# Use token in API calls
curl -X GET http://localhost:8000/api/subjects \
  -H "Authorization: Bearer $TOKEN"
```

---

## Testing

### Run Tests

```bash
# Install test dependencies
pip install pytest pytest-cov

# Run all tests
pytest

# Run with verbose output
pytest -v

# Run specific test file
pytest tests/unit/test_models.py

# Run with coverage
pytest --cov=app --cov-report=html
```

### Write a Test

```python
# tests/unit/test_api.py
import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_register():
    response = client.post("/auth/register", json={
        "username": "newuser",
        "email": "new@example.com",
        "password": "pass123"
    })
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_create_subject(auth_token):
    response = client.post(
        "/api/subjects",
        json={"name": "Biology 101"},
        headers={"Authorization": f"Bearer {auth_token}"}
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Biology 101"
```

---

## Troubleshooting

### App Won't Start

```bash
# Check Python version
python --version  # Should be 3.11+

# Check dependencies installed
pip list | grep fastapi

# Check database path exists
mkdir -p ./data

# Try starting with debug output
python -u main.py
```

### Port 8000 Already in Use

```bash
# Find process using port 8000
lsof -i :8000

# Kill process
kill -9 <PID>

# Or use different port
export PORT=8001
python main.py
```

### API Errors

```bash
# Check logs (printed to console)
# Error messages appear in real-time

# Check database
sqlite3 ./data/app.db ".tables"

# Test database connection
python -c "from app.utils.db import get_db; print('DB OK')"
```

### Missing Dependencies

```bash
# Reinstall all dependencies
pip install -r requirements.txt --force-reinstall

# Check missing packages
pip list | grep -E "fastapi|sqlalchemy|pydantic"
```

### Embedding/OCR Issues

```bash
# Check Tesseract installed
tesseract --version

# Check Poppler installed
pdftoimage -h  # macOS
pdftoppm -h    # Linux

# On macOS
brew install tesseract poppler

# On Linux
sudo apt install tesseract-ocr poppler-utils
```

---

## Development Tips

### 1. Use API Docs for Testing

Visit http://localhost:8000/docs and test endpoints interactively.

### 2. Enable Debug Logging

```python
# In config.py or main.py
import logging
logging.basicConfig(level=logging.DEBUG)
```

### 3. Watch Database Changes

```bash
# Monitor database in real-time
sqlite3 ./data/app.db

sqlite> SELECT * FROM users;
sqlite> SELECT * FROM lectures;
sqlite> .tables  # List all tables
```

### 4. Test File Uploads

```bash
# Create test file
echo "test content" > test.txt

# Upload via API
curl -F "file=@test.txt" \
  -F "subject_id=1" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:8000/api/lectures/upload
```

### 5. WebSocket Testing

```javascript
// In browser console
const ws = new WebSocket('ws://localhost:8000/ws');
ws.onmessage = (event) => console.log(event.data);
ws.send(JSON.stringify({message: "hello"}));
```

---

## Production Deployment

For production deployment (Docker), see [DEPLOYMENT.md](DEPLOYMENT.md).

---

For API schemas, see [DATA_STRUCTURES.md](DATA_STRUCTURES.md).  
For troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

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

## 🚀 Quick Commands Reference

### Basic Operations

```bash
# Start all services
bash scripts/start.sh

# Stop all services  
bash scripts/stop.sh

# View service logs
docker-compose -f docker/docker-compose.yml logs -f api_gateway
docker-compose -f docker/docker-compose.yml logs -f worker_ocr
docker-compose -f docker/docker-compose.yml logs -f postgres
```

### Service URLs & Credentials

| Service | URL | Credentials |
|---------|-----|-------------|
| Frontend | http://localhost:3000 | testuser / password123 |
| API | http://localhost:8000 | - |
| API Docs | http://localhost:8000/docs | - |
| PostgreSQL | localhost:5432 | user / password |
| Redis | localhost:6379 | - |

### Common API Calls

**Login:**
```bash
TOKEN=$(curl -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}' \
  | jq -r '.access_token')
```

**Upload Lecture:**
```bash
curl -X POST http://localhost:8000/api/v1/lectures/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "subject_id=1" \
  -F "name=Lecture 3" \
  -F "file=@/path/to/lecture.pdf"
```

### Docker Compose Commands

```bash
# View containers
docker-compose -f docker/docker-compose.yml ps

# View logs (real-time)
docker-compose -f docker/docker-compose.yml logs -f

# Restart specific service
docker-compose -f docker/docker-compose.yml restart api_gateway

# Enter shell
docker-compose -f docker/docker-compose.yml exec api_gateway bash

# Cleanup
docker-compose -f docker/docker-compose.yml down -v
```

### Database Operations

```bash
# Connect to PostgreSQL
docker-compose -f docker/docker-compose.yml exec postgres \
  psql -U mysmarnotes_user -d mysmarnotes_db

# List all lectures
SELECT l.id, l.name, s.name as subject, l.status, l.page_count 
FROM lectures l 
JOIN subjects s ON l.subject_id = s.id;

# Check processing status
SELECT id, name, status, error_message FROM lectures;
```

### Redis Operations

```bash
# Connect to Redis CLI
docker-compose -f docker/docker-compose.yml exec redis redis-cli

# View all keys
KEYS *

# Monitor pub/sub channels
SUBSCRIBE progress:lecture:*

# Clear all cache
FLUSHALL
```

### Celery Monitoring

```bash
# View active tasks
celery -A workers.celery_app inspect active

# Monitor tasks in real-time
celery -A workers.celery_app events

# Revoke a task
celery -A workers.celery_app revoke <task_id>
```

### Quick Troubleshooting

```bash
# Check service status
docker-compose -f docker/docker-compose.yml ps

# View error logs
docker-compose -f docker/docker-compose.yml logs | grep ERROR

# Reset everything
docker-compose -f docker/docker-compose.yml down -v
bash scripts/start.sh
```

---

For deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md).  
For troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).
