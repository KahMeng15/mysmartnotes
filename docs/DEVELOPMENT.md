# Development Guide

This guide is for developers who want to contribute to MySmartNotes or run it locally for development purposes. The application has been refactored into a **Multi-Container Architecture** to improve scalability and maintainability.

---

## 🏗️ Architecture Overview

The system consists of 4 primary services:
1.  **Frontend (Nginx):** Serves static files (HTML/JS/CSS) and acts as a reverse proxy for the API.
2.  **API (FastAPI):** Handles HTTP requests, authentication, and database operations.
3.  **Worker (Python):** Processes background tasks like OCR, AI processing, and embedding generation.
4.  **Database (PostgreSQL):** Persistent storage for application data and the task queue.

---

## 🛠️ Quick Start (Docker - Recommended)

The easiest way to get started is using the pre-configured development Docker stack. This provides **hot-reloading** for both the API and the Worker.

### 1. Prerequisites
- **Docker** and **Docker Compose** installed.

### 2. Setup
```bash
# Clone the repository
git clone <repo-url> mysmartnotes
cd mysmartnotes

# Create a .env file from the example
cp .env.example .env
```
*Note: Ensure `DATABASE_URL` in `.env` points to the `db` service as defined in the compose file.*

### 3. Start Development Environment
```bash
docker-compose -f docker-compose.dev.yml up --build
```
- **Application:** [http://localhost:8000](http://localhost:8000)
- **API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Postgres:** Exposed on port `5432` for local inspection.

---

## 💻 Local Terminal Development

If you prefer to run the Python code directly on your host machine for faster debugging:

### 1. Start the Database Only
The application requires a PostgreSQL database. Keep the DB container running:
```bash
docker-compose up -d db
```

### 2. Install Local Dependencies
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Run the App & Worker
Use the provided development script to start both processes in a single terminal:
```bash
./scripts/dev.sh
```
This will start the **API** with hot-reload and the **Worker** as a background process.

---

## 📜 Logging System

The application uses a granular 15-file logging system. All logs are stored in the `./logs` directory in the project root.

| File | Description |
| :--- | :--- |
| `1-Frontend.log` | Nginx access and proxy logs. |
| `2-All-API.log` | Aggregated logs from all API routers. |
| `3-Auth-API.log` | Authentication and user management logs. |
| `4-Notes-API.log` | Document upload and lecture management logs. |
| ... | ... |
| `10-Chat-Worker.log` | Background processing for AI chat. |
| `11-Upload-Worker.log` | Background processing for OCR and file parsing. |

---

## 🧪 Testing

The project uses `pytest` for testing.

```bash
# Run all tests
pytest

# Run tests with coverage
pytest --cov=app tests/
```

---

## 🔄 Common Development Tasks

### Modifying Background Tasks
Background tasks are managed in `app/utils/tasks.py`. 
1.  **Submission:** The API calls `TaskManager.submit_task()`, which serializes the request into the `tasks` table.
2.  **Processing:** The Worker (`app/worker_main.py`) polls for `pending` tasks and executes the corresponding handler.

### Modifying the Extraction Pipeline
The core logic resides in `app/processing/smart_pipeline.py`.
- Use `scripts/ProcessingAlgorithmTest/run_smart.py` to test extraction on specific files without booting the whole app.

### Database Migrations
We currently use SQLAlchemy's `Base.metadata.create_all()` for automatic schema initialization on startup. For complex migrations, ensure the API container starts first as it handles the `init_db()` call.

---

## 🛡️ Security Note
Never commit your `.env` file. It contains sensitive API keys and database credentials. A `.dockerignore` and `.gitignore` are pre-configured to prevent accidental exposure of logs and environment files.
