# Development Guide

This guide is for developers who want to contribute to MySmartNotes or run it locally for development purposes.

## 🛠️ Local Environment Setup

### 1. Prerequisites
- **Python 3.9+**
- **Tesseract OCR** (Optional, for scanned document support)
  - Ubuntu: `sudo apt install tesseract-ocr`
  - macOS: `brew install tesseract`
  - Windows: Download installer from [UB Mannheim](https://github.com/UB-Mannheim/tesseract/wiki)

### 2. Installation
```bash
# Clone the repository
git clone <repo-url> mysmartnotes
cd mysmartnotes

# Create a virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configuration
Copy the `.env.example` to `.env` and fill in the required keys.
```bash
cp .env.example .env
```
Key variables:
- `GEMINI_API_KEY`: Required for the AI polish pass and chat (unless using Ollama/HF).
- `SECRET_KEY`: Random string for JWT signing.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: Initial admin credentials.

### 4. Running the Application
```bash
python main.py
```
The app will be available at `http://localhost:8000`. API documentation is available at `http://localhost:8000/docs`.

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

## 📁 Code Style & Linting

We follow standard Python PEP 8 guidelines.

```bash
# Format code
black app/

# Check types
mypy app/
```

---

## 🔄 Common Development Tasks

### Database Migrations
Currently, MySmartNotes uses `Base.metadata.create_all()` in `app/utils/db.py` to initialize the database. For major schema changes, you may need to delete the `data/app.db` file (development only!) or manually apply SQL migrations.

### Adding new API Endpoints
1. Define the Pydantic schema in `app/schemas/`.
2. Create the router in `app/routers/`.
3. Include the router in `main.py`.

### Modifying the Extraction Pipeline
The core logic resides in `app/processing/smart_pipeline.py`. When testing changes to the pipeline:
1. Use `scripts/ProcessingAlgorithmTest/run_smart.py` to test extraction on specific files.
2. Verify the output Markdown in the `output/` directory.

---

## 🐳 Docker Development

To test the Docker build locally:
```bash
docker build -t mysmartnotes .
docker run -p 8000:8000 --env-file .env mysmartnotes
```

---

## ❓ Troubleshooting

- **Embeddings Model fails to load**: Ensure you have enough RAM (at least 2GB free). The first load will download ~100MB of model weights.
- **Tesseract not found**: Ensure `tesseract` is in your system PATH.
- **SQLite Database Locked**: This can happen during concurrent writes. The app uses a connection pool with timeouts to mitigate this, but avoid manually opening the DB with external tools while the app is running.
