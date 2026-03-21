# 🚀 MySmartNotes – Smart AI-Powered Study Companion

A lightweight, single-container web application that intelligently converts lecture slides (PDF/PPTX) into structured study materials using advanced AI. Extract clean markdown with properly formatted tables, ask questions via RAG-based chat, generate quizzes, and organize your learning journey. Perfect for personal use or small study groups (0-10 people).

## ✨ Key Features

* **Advanced Document Processing**: Font-aware text extraction + table detection from PDF/PPTX
  - Preserves document structure with proper headings and formatting
  - Automatically detects and converts tables to markdown format
  - OCR support for scanned documents
* **Semantic Q&A Chat**: Ask questions about your notes with RAG (Retrieval Augmented Generation)
  - Pre-computed embeddings for fast semantic search
  - Vector DB integrated into SQLite (no external services needed)
  - Context-aware LLM responses from multiple AI providers
* **Study Tools**: Quiz generation and cheat sheets
  - Auto-generate practice quizzes from lecture notes
  - Export notes as PDF or Word documents
* **Smart Organization**: Subjects grouped by semester/topic with snapshots
  - Save different versions of lecture notes as snapshots
  - Track changes and revert to previous versions
  - Organized by subject groups for semester management
* **Learning Analytics**: Monitor your study progress
  - Track study sessions and time spent
  - View learning patterns and quiz performance
  - Dashboard with personalized insights
* **Flexible AI**: Support for multiple AI providers
  - Gemini API (Google)
  - Hugging Face Inference API
  - Self-hosted Ollama (local LLM option)
  - Per-user or global AI configuration
* **Real-Time Updates**: WebSocket support for live extraction progress
* **Private & Simple**: No complex infrastructure - just one command to run

## 🎯 Design Philosophy

* **Simplicity First**: Single container, zero microservices complexity
* **Cost Effective**: $0 for self-hosted or pay-as-you-go with external APIs (Gemini free tier available)
* **Minimal Setup**: `python main.py` - that's it! No complex setup required
* **Small Scale**: Designed for 0-10 users (friends, study groups, small classes)
* **Privacy-Focused**: All data stored locally in SQLite; embeddings computed locally with sentence-transformers
* **Zero Server Bloat**: No Redis, Celery, or external services needed; background tasks use ThreadPoolExecutor

## 🏗️ Architecture

**Simple monolithic FastAPI app** - no microservices, no complex orchestration.

**Stack:**
- **Backend**: FastAPI + Python 3.9+ (single monolithic app)
- **Frontend**: HTML5/CSS3/JavaScript (no build step, vanilla JS)
- **Database**: SQLite with pre-computed vector embeddings (no external vector DB)
- **Document Processing**: 
  - pdfplumber (PDF table extraction)
  - Font-aware text extraction (preserve document structure)
  - python-pptx (PowerPoint support)
  - Tesseract OCR (optional, for scanned documents)
- **AI/LLM Providers**: 
  - Google Gemini API (default)
  - Hugging Face Inference API
  - Self-hosted Ollama
- **Embeddings**: sentence-transformers (local, CPU-based, no API calls)
- **Background Tasks**: ThreadPoolExecutor + asyncio (no Redis/Celery)
- **Deployment**: Docker (single container) or bare metal Python


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

## 🛠️ Tech Stack Details

| Component | Technology | Purpose |
|-----------|-----------|----------|
| **Backend** | FastAPI, Python 3.9+ | Web server & API |
| **Frontend** | HTML5, CSS3, Vanilla JS | Zero-build UI |
| **Database** | SQLite | Local persistent storage |
| **Vector Storage** | SQLite + sentence-transformers | Semantic search (no external vector DB) |
| **Document Extraction** | pdfplumber, python-pptx | PDF/PPTX parsing & table detection |
| **Font Analysis** | FontAwareExtractor | Preserve document structure from PDFs |
| **OCR** | Tesseract + pytesseract | Scanned document support (optional) |
| **Markdown Rendering** | marked.js (client-side) | Table + GFM support |
| **AI/LLM** | Gemini / HF Inference / Ollama | Multiple provider support |
| **Embeddings** | sentence-transformers | Local CPU embeddings (no API calls) |
| **Async Tasks** | ThreadPoolExecutor + asyncio | Background processing (no Redis/Celery) |
| **WebSocket** | Python-websockets | Real-time progress updates |
| **Deployment** | Docker or bare metal | Single container deployment |

## � Workflow Overview

1. **Upload Lecture**: PDF, PPTX, or images
2. **Auto Extract**: Font-aware extraction + table detection → clean markdown
3. **Organize**: Assign to subject + group (e.g., "Semester 1 → Math")
4. **Review & Edit**: Built-in markdown editor with live preview
5. **Search & Chat**: Semantic search + RAG-powered Q&A
6. **Generate Materials**: Quizzes, study guides
7. **Track Progress**: Monitor study sessions via analytics dashboard

## 💡 Use Cases

- **Students**: Convert lecture PDFs → study materials automatically
- **Study Groups**: Collaborative note-taking with shared AI resources
- **Instructors**: Convert course materials to student-friendly formats
- **Self-Learners**: Build searchable knowledge base from online courses
- **Research**: Extract structured data from academic papers
