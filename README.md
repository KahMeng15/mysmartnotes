# 🚀 MySmartNotes – Smart AI-Powered Study Companion

A scalable, AI-powered study companion that intelligently converts lecture slides (PDF/PPTX) into structured study materials. Featuring a **Multi-Container Architecture**, it extracts clean markdown with properly formatted tables, provides RAG-based chat, generates quizzes, and organizes your learning journey. Perfect for personal use or small study groups.

## ✨ Key Features

* **Advanced Document Processing**: Font-aware text extraction + table detection from PDF/PPTX
  - Preserves document structure with proper headings and formatting
  - Automatically detects and converts tables to markdown format
  - OCR support for scanned documents via dedicated background workers
* **Semantic Q&A Chat**: Ask questions about your notes with RAG (Retrieval Augmented Generation)
  - Pre-computed embeddings for fast semantic search
  - Vector storage integrated into the database
  - Context-aware LLM responses from multiple AI providers
* **Study Tools**: Quiz generation and cheat sheets
  - Auto-generate practice quizzes from lecture notes
  - Export notes as PDF or Word documents
* **Smart Organization**: Subjects grouped by semester/topic with snapshots
* **Learning Analytics**: Monitor your study progress via a dedicated dashboard
* **Flexible AI**: Support for Gemini API, Hugging Face, and Ollama
* **Scalable Infrastructure**: Multi-container stack with dedicated API, Worker, and DB services
* **Real-Time Updates**: WebSocket support for live extraction progress

## 🏗️ Architecture

MySmartNotes uses a **Multi-Container Architecture** to ensure reliable background processing and high availability.

**Stack:**
- **Frontend**: Nginx (Static assets + Reverse Proxy)
- **API**: FastAPI (Request handling & Auth)
- **Worker**: Python (Background processing: OCR, AI, Embeddings)
- **Database**: PostgreSQL 15 (Persistent storage & Task Queue)
- **Cache**: Redis (In-memory caching)
- **Embeddings**: sentence-transformers (Local, CPU-based)
- **Deployment**: Docker Compose

## 🚀 Quick Start (Docker Compose)

The recommended way to run MySmartNotes is using Docker Compose.

### 1. Setup
```bash
# Clone repository
git clone <repo-url> mysmartnotes
cd mysmartnotes

# Copy environment template and configure
cp .env.example .env
```

#### Configuration (`.env`)
Configure the following core options in your `.env` file:
* **Database Configuration**:
  The application automatically constructs the connection string from individual variables. **Do not use a raw `DATABASE_URL` variable**, as the settings validator ignores it in favor of:
  ```env
  DB_USER=mysmartnotes
  DB_PASSWORD=mysmartnotespassword
  DB_HOST=localhost # Use 'db' if running inside Docker Compose
  DB_PORT=5432
  DB_NAME=mysmartnotes
  ```
* **Global 3-Tier AI Fallback**:
  Configure the three tiers of AI models to ensure uninterrupted processing in case of rate limits or provider failures. Gemma-4 reasoning models are supported and configured by default:
  ```env
  # Tier 1 (Primary - Gemini Gemma-4 31B Reasoning Model)
  GLOBAL_AI_TIER1_PROVIDER=gemini
  GLOBAL_AI_TIER1_MODEL=models/gemma-4-31b-it
  GLOBAL_AI_TIER1_API_KEY=your_gemini_api_key
  GLOBAL_AI_TIER1_REASONING_LEVEL=high

  # Tier 2 (Secondary - Gemini Gemma-4 26B MoE Reasoning Model)
  GLOBAL_AI_TIER2_PROVIDER=gemini
  GLOBAL_AI_TIER2_MODEL=models/gemma-4-26b-a4b-it
  GLOBAL_AI_TIER2_API_KEY=your_gemini_api_key
  GLOBAL_AI_TIER2_REASONING_LEVEL=high

  # Tier 3 (Local Fallback - Ollama Llama 3)
  GLOBAL_AI_TIER3_PROVIDER=ollama
  GLOBAL_AI_TIER3_MODEL=llama3
  GLOBAL_AI_TIER3_BASE_URL=http://localhost:11434
  GLOBAL_AI_TIER3_REASONING_LEVEL=low
  ```

### 2. Launch
```bash
# Start the full stack
docker-compose up -d
```

**Services:**
- **Web UI**: [http://localhost:8000](http://localhost:8000) (routed via Nginx reverse proxy)
- **API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Redis Cache**: In-memory cache for sessions, tokens, and database requests.
- **Logs**: View via `docker-compose logs -f` or in the `./logs` directory.

---

### Option 2: Python (Local Development)

For faster iteration during development, you can run the services manually:

```bash
# 1. Start Infrastructure (Database + Redis)
docker-compose up -d db redis

# 2. Setup Venv
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Run Dev Script (Starts API + Worker)
./scripts/dev.sh
```

## 📚 Documentation

- **[Technical Documentation](docs/TECHNICAL_DOCUMENTATION.md)**: Deep dive into the multi-container architecture, data models, and processing pipelines.
- **[Development Guide](docs/DEVELOPMENT.md)**: Detailed instructions for local setup, testing, and contribution.
- **[Resource Requirements](docs/RESOURCE_REQUIREMENTS.md)**: Hardware recommendations for the new architecture.

## 🛠️ Tech Stack Details

| Component | Technology | Purpose |
|-----------|-----------|----------|
| **Reverse Proxy** | Nginx | Serves UI & routes API traffic |
| **Backend API** | FastAPI, Python 3.11+ | Web server & API logic |
| **Worker** | Python (dedicated process) | Background processing (OCR, AI) |
| **Database** | PostgreSQL 15 | Persistent storage & Task Queue |
| **Cache** | Redis | In-memory caching (Notes, DB, API) |
| **Vector Storage** | PostgreSQL + sentence-transformers | Semantic search |
| **Document Extraction** | pdfplumber, python-pptx | PDF/PPTX parsing |
| **OCR** | Tesseract + pytesseract | Scanned document support |
| **AI/LLM** | Gemini / HF Inference / Ollama | Multiple provider support |
| **Async Tasks** | DB-backed Task Queue | Managed background processing |
| **Deployment** | Docker Compose | Multi-container orchestration |

## Production Safety Notes

- Set `ENVIRONMENT=production` in deployment environments.
- Set a strong `SECRET_KEY` (32+ characters).
- Configure `CORS_ALLOWED_ORIGINS` to trusted domains only.
- Use the included PostgreSQL database for production reliability.
- Set `COOKIE_SECURE=true` behind HTTPS.
- Set `APP_ENCRYPTION_KEY` to enable encryption for stored API keys.
- Runtime diagnostics are available at `GET /admin/runtime-metrics` (admin-only).

## 💾 System Requirements

| Scenario | CPU | RAM | Storage | Use Case |
|----------|-----|-----|---------|----------|
| **Personal** | 2 cores | 2GB | 10GB | Single user |
| **Friend Group** | 4 cores | 4GB | 50GB | 2-10 people |
| **Growing Team** | 8 cores | 8GB | 100GB | 10-50 people |

See [RESOURCE_REQUIREMENTS.md](docs/RESOURCE_REQUIREMENTS.md) for deployment sizing details.

##  Workflow Overview


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
