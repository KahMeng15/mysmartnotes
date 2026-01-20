# 🚀 MySmartNotes – Simple AI Study Companion

A lightweight, single-container web application that converts lecture slides (PDF/PPTX) into study materials using AI. Features include text extraction, RAG-based Q&A chatbot, quiz generation, and note organization. Perfect for personal use or small study groups (0-10 people).

## ✨ Key Features

* **Smart Document Processing**: Extracts text and diagrams from lecture slides (PDF/PPTX/images)
* **AI-Powered Chat**: Ask questions about your notes with semantic search and LLM responses
* **Cheat Sheet Generation**: Creates condensed study guides in Word/PDF format
* **Quiz Generator**: Auto-generates practice quizzes from your notes
* **Subject Organization**: Organize notes by subjects and lectures
* **Flashcard System**: Spaced repetition flashcards for self-testing
* **Real-Time Updates**: WebSocket support for live progress updates
* **Private & Simple**: No complex infrastructure - just one command to run

## 🎯 Design Philosophy

* **Simplicity First**: Single container, zero microservices complexity
* **Cost Effective**: $0 for self-hosted or pay-as-you-go with external APIs
* **Minimal Setup**: `python main.py` - that's it!
* **Small Scale**: Designed for 0-10 users (friends, study groups)
* **Privacy-Focused**: All data stored locally in SQLite

## 🏗️ Architecture

**Simple monolithic FastAPI app** - no microservices, no complex orchestration.

**Stack:**
- **Backend**: FastAPI (single Python app)
- **Frontend**: HTML/CSS/JavaScript (simple, no build step)
- **Database**: SQLite (single file, zero setup)
- **AI**: External APIs (Gemini or Hugging Face - free tier available)
- **Embeddings**: sentence-transformers (local, CPU-based)
- **Background Tasks**: ThreadPoolExecutor (no Redis/Celery needed)
- **Deployment**: Single Docker container or bare metal

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed technical documentation.

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

### Option 1: Python (Simplest)

```bash
# Clone repository
git clone <repo-url> mysmartnotes
cd mysmartnotes

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment template and configure
cp .env.example .env
# Edit .env: Add your Gemini API key or Hugging Face token

# Run the app
python main.py

# Access at http://localhost:8000
```

### Option 2: Docker (One Command)

```bash
# Copy environment template
cp .env.example .env
# Edit .env: Add your API keys

# Run single container
docker run -d \
  -p 8000:8000 \
  -v $(pwd)/data:/app/data \
  -e GEMINI_API_KEY="your-key" \
  mysmartnotes:latest

# Access at http://localhost:8000
```

### Option 3: Docker Compose

```bash
# Clone repository
git clone <repo-url> mysmartnotes
cd mysmartnotes

# Copy environment template
cp .env.example .env
# Edit .env: Add your API keys

# Start single container
docker-compose up -d

# Access at http://localhost:8000
```

See [DEVELOPMENT.md](DEVELOPMENT.md) for detailed setup and troubleshooting.

## 💾 System Requirements

| Scenario | CPU | RAM | Storage | Use Case |
|----------|-----|-----|---------|----------|
| **Personal** | 2 cores | 2GB | 10GB | Single user |
| **Friend Group** | 4 cores | 4GB | 50GB | 2-10 people |
| **Growing Team** | 8 cores | 8GB | 100GB | 10-50 people |

See [RESOURCE_REQUIREMENTS.md](RESOURCE_REQUIREMENTS.md) for deployment sizing details.

## 🛠️ Tech Stack

**Backend:** FastAPI, Python 3.11+, SQLAlchemy  
**Frontend:** HTML5, CSS3, JavaScript  
**Database:** SQLite  
**AI/LLM:** Gemini API or Hugging Face (external)  
**Embeddings:** sentence-transformers  
**OCR:** Tesseract (optional, for scanned PDFs)  
**Background Tasks:** ThreadPoolExecutor + asyncio  
**Document Processing:** PyPDF, pillow, python-docx  
**Deployment:** Docker (single container)

## 📝 License

-

## 🤝 Contributing

Contributions welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📧 Contact

-
