# MySmartNotes Technical Documentation

## 1. Introduction
MySmartNotes is an AI-powered study companion designed to convert lecture materials (PDF, PPTX, images) into structured, searchable, and interactive study notes. It provides students and small study groups with tools for semantic Q&A, quiz generation, and progress tracking.

The project is built with a focus on **simplicity, privacy, and cost-effectiveness**, using a single-container architecture without the need for complex external services like Redis or dedicated vector databases.

---

## 2. Architecture & Tech Stack

MySmartNotes follows a monolithic architecture built with **FastAPI**. It is designed to be lightweight and easy to deploy.

### Backend
- **Framework**: FastAPI (Python 3.9+)
- **Database**: SQLite with SQLAlchemy ORM.
- **Vector Search**: SQLite-based storage of local embeddings generated via `sentence-transformers` (specifically the `all-MiniLM-L6-v2` model).
- **Background Tasks**: Managed via `ThreadPoolExecutor` and `asyncio`, eliminating the need for Celery/Redis.
- **AI Integration**: Custom `AIClient` supporting Google Gemini, Hugging Face Inference API, and local Ollama.

### Frontend
- **Framework**: Vanilla JavaScript, HTML5, and CSS3.
- **Build System**: Zero-build (no npm/webpack required).
- **Markdown Rendering**: `marked.js` on the client-side.
- **Real-time Updates**: WebSockets for live processing progress.

### Deployment
- **Containerization**: Docker (Single container).
- **Environment**: Managed via `.env` file.

---

## 3. Data Models & Database Schema

The database consists of several key entities managed via SQLAlchemy:

- **User**: Authentication, personal AI configurations, and Pomodoro preferences.
- **SubjectGroup**: Organizes subjects into higher-level categories (e.g., "Semester 1").
- **Subject**: Individual courses or topics.
- **Lecture**: The core document entity. Stores file metadata, extracted text, and structured content.
- **LectureEmbedding**: Stores vector embeddings and text chunks for semantic search.
- **ChatMessage**: Stores conversation history, including AI responses and source citations.
- **Quiz / QuizQuestion / QuizProgress**: Handles AI-generated quizzes and Spaced Repetition System (SRS) tracking.
- **StudySession**: Tracks time spent studying and performance metrics.
- **Summary**: Stores AI-generated summaries, cheat sheets, and versioned notes.
- **NoteSnapshot**: Version history for lecture notes.
- **SystemSettings**: Global configuration for admin bootstrap, AI limits, and lockdown mode.
- **Task**: Tracking background processing jobs (OCR, Embeddings, AI generation).

---

## 4. Core Workflows

### 4.1 Document Processing Pipeline (`SmartPipeline`)
The extraction pipeline is the heart of MySmartNotes, designed to preserve the semantic structure of lecture slides.

1. **Extraction**:
   - **PDF**: Uses `pdfplumber` for table extraction and a custom `FontAwareExtractor` to detect headings based on font size and weight.
   - **PPTX**: Uses `python-pptx` to extract text from shapes, with heuristics to identify titles, body text, and code blocks.
2. **Heuristic Merging**: Combines text signals with layout information to produce clean Markdown. It filters institutional metadata (headers/footers) and slide numbers.
3. **Table Detection**: Automatically converts detected tables into Markdown format.
4. **AI Polish (Optional)**: A pass through Gemini/Gemma to clean up formatting, merge broken sentences, and ensure logical consistency without altering content.

### 4.2 Semantic Search & RAG
MySmartNotes implements a "Zero-Config RAG" system:

1. **Chunking**: Extracted text is split into ~500-character chunks.
2. **Embedding**: Chunks are converted into 384-dimensional vectors using `sentence-transformers` locally on the CPU.
3. **Storage**: Vectors are stored as JSON blobs in the `lecture_embeddings` table.
4. **Retrieval**: At query time, the user's question is embedded, and cosine similarity is calculated directly in Python (or via SQLite extensions if available) to find the most relevant chunks.
5. **Augmentation**: Top-K chunks are injected into the LLM prompt as context.

### 4.3 AI Integration (`AIClient`)
The system abstracts AI providers to allow flexibility:

- **Gemini**: Primary provider, supporting Flash models for high-speed processing.
- **Hugging Face**: Support for open-source models via the Inference API.
- **Ollama**: Allows users to run MySmartNotes completely offline with local models like Llama 3 or Mistral.

---

## 5. Security & Authentication

- **JWT Auth**: Stateless authentication using JSON Web Tokens.
- **Encryption**: Sensitive data like API keys are encrypted at rest in the database using Fernet (AES-128).
- **IP Filtering**: Built-in middleware to whitelist/blacklist IP addresses or countries.
- **Lockdown Mode**: Restricts access to the local network only, useful for private deployments.
- **Admin Tier**: Separate routes and permissions for system management.

---

## 6. Directory Structure

```text
/
├── app/
│   ├── models/             # SQLAlchemy DB models
│   ├── processing/         # Core extraction & AI logic
│   │   ├── ai_client.py    # Multi-provider AI abstraction
│   │   ├── embeddings.py   # Vector search logic
│   │   ├── smart_pipeline.py # Document extraction orchestrator
│   │   └── document_generator.py # PDF/Word export logic
│   ├── routers/            # FastAPI API endpoints
│   ├── schemas/            # Pydantic validation models
│   ├── static/             # Frontend assets (HTML, JS, CSS)
│   └── utils/              # Utilities (Auth, Tasks, DB)
├── data/                   # SQLite database location
├── generated/              # Output for generated study materials
├── output/                 # Temporary processing files
└── main.py                 # Application entry point
```

---

## 7. Performance & Scaling

- **Threading**: Long-running IO-bound tasks (AI calls, file writes) are offloaded to a `ThreadPoolExecutor`.
- **Asyncio**: The web server remains responsive by using non-blocking calls for most operations.
- **Resource Usage**: Designed to run on modest hardware (2 vCPUs, 2GB RAM). Memory usage is primarily driven by the `sentence-transformers` model during the initial loading phase.

---

## 8. Development Guidelines

- **Database Migrations**: Currently managed manually via SQLAlchemy's `create_all()`. For schema changes, follow the patterns in `app/models/db.py`.
- **Frontend**: Avoid adding build steps. Keep JS modules self-contained in `app/static/js/`.
- **API**: Always use Pydantic schemas in `app/schemas/` for request and response validation to ensure consistent API documentation (Swagger/OpenAPI).
