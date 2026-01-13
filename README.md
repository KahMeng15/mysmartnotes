# 🚀 MySmartNotes – AI Study Companion

A scalable web application that converts lecture slides (PDF/PPTX) into high-density "Exam Cheat Sheets" using AI. Features include Smart Crop for diagrams, RAG-based Chatbot, Quiz Generator, and collaborative sharing.

## ✨ Key Features

* **Smart Document Processing**: Automatically extracts text and diagrams from lecture slides
* **AI-Powered Chat**: Ask questions about your notes with RAG (Retrieval-Augmented Generation)
* **Cheat Sheet Generation**: Creates condensed, 2-column study guides in Word format
* **Quiz Generator**: Automatically generates MCQ quizzes from your notes
* **Subject Organization**: Organize notes by subjects and lectures
* **Shareable Links**: Share notes with optional password protection
* **Spaced Repetition**: Built-in flashcard system with intelligent review scheduling
* **Offline-First**: All processing happens locally, ensuring privacy

## 🎯 Key Constraints

* **Cost:** $0 (Free/Open Source only)
* **Hardware:** CPU-optimized (No GPU required)
* **Privacy:** All processing happens locally (Ollama + Local DB)
* **Scalability:** Microservices architecture with message queuing

## 🏗️ Architecture

**Microservices-based design** supporting both bare metal development and containerized production deployment.

**Services:**
- **Frontend**: Streamlit UI
- **API Gateway**: FastAPI with WebSocket support
- **Workers**: Celery-based async processing (OCR, AI, Generation)
- **Databases**: PostgreSQL (metadata), ChromaDB (vectors), Redis (cache/queue)
- **AI Engine**: Ollama (Llama 3 - locally hosted)

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed architecture documentation.

## 📚 Documentation Structure

* **[README.md](README.md)** - This file - Project overview and quick start
* **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture and tech stack
* **[FILE_STRUCTURE.md](FILE_STRUCTURE.md)** - Complete project directory structure
* **[DATABASE.md](DATABASE.md)** - Database schemas and relationships
* **[DATA_STRUCTURES.md](DATA_STRUCTURES.md)** - Data models and API schemas
* **[ACTION_FLOWS.md](ACTION_FLOWS.md)** - User flows and system processes
* **[DEVELOPMENT.md](DEVELOPMENT.md)** - Development setup and workflow
* **[DEPLOYMENT.md](DEPLOYMENT.md)** - Docker deployment and scaling
* **[SECURITY.md](SECURITY.md)** - Security considerations
* **[MONITORING.md](MONITORING.md)** - Monitoring and observability
* **[ADVANCED_FEATURES.md](ADVANCED_FEATURES.md)** - Future features roadmap
* **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues and solutions

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone repository
git clone <repo-url> mysmartnotes
cd mysmartnotes

# Copy environment template
cp .env.example .env

# Start all services
docker-compose up -d

# Initialize database (first run only)
docker-compose exec api_gateway python /app/scripts/init_db.py
docker-compose exec ollama ollama pull llama3:8b-instruct-q4_0

# Access application
open http://localhost
```

### Option 2: Bare Metal Development

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements-dev.txt

# Start infrastructure
docker-compose -f docker-compose.infra.yml up -d  # Redis, PostgreSQL only

# Initialize database
python scripts/init_db.py

# Pull AI model
ollama pull llama3:8b-instruct-q4_0

# Start services (in separate terminals)
./scripts/start_dev.sh
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed setup instructions.

## 📊 Scaling Capability

| Users | Setup | Resources |
|-------|-------|-----------|
| 1-10 | Single machine, minimal containers | 2GB RAM, 2 CPU cores |
| 10-100 | Scaled worker containers | 4-8GB RAM, 4 CPU cores |
| 100-1000 | Multiple machines, load balancer | 16GB+ RAM, 8+ CPU cores |
| 1000+ | Kubernetes, managed services | Horizontal scaling |

See [DEPLOYMENT.md](DEPLOYMENT.md) for scaling strategies.

## 🛠️ Tech Stack

**Frontend:** Streamlit, FastAPI, nginx  
**Backend:** Python, Celery, Redis  
**Databases:** PostgreSQL, ChromaDB  
**AI:** Ollama (Llama 3), LayoutParser, Tesseract  
**Document Processing:** python-docx, pdf2image, fpdf  
**Deployment:** Docker, Docker Compose

## 📝 License

-

## 🤝 Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📧 Contact

-
