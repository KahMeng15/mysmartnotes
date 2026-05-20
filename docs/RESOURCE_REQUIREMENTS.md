# Resource Requirements & Sizing Guide

MySmartNotes is designed to be lightweight, but its AI and document processing components have specific resource needs. This guide helps you size your deployment based on expected usage.

## 💻 Hardware Requirements

| Component | Minimum | Recommended | Notes |
|-----------|---------|-------------|-------|
| **CPU** | 2 Cores | 4+ Cores | Primarily used for PDF extraction and local embeddings. |
| **RAM** | 2 GB | 4 GB | `sentence-transformers` requires ~500MB-1GB RAM when loaded. |
| **Storage** | 10 GB | 50+ GB | Depends on the number of uploaded documents and generated PDFs. |

---

## 📊 Usage Scenarios

### Personal Use (1 User)
- **CPU**: 1-2 Cores
- **RAM**: 2 GB
- **Storage**: 10 GB
- **Experience**: Fast extraction, responsive chat. Best for single-person study.

### Friend Group (2-10 Users)
- **CPU**: 4 Cores
- **RAM**: 4 GB
- **Storage**: 50 GB
- **Experience**: Handles concurrent uploads and multiple chat sessions smoothly.

### Small Class / Team (10-50 Users)
- **CPU**: 8 Cores
- **RAM**: 8 GB
- **Storage**: 100 GB
- **Experience**: Recommended for professional settings where high volume processing is expected.

---

## 🧠 AI Resource Impact

### 1. Local Embeddings (`sentence-transformers`)
The `all-MiniLM-L6-v2` model is used for semantic search.
- **Initialization**: Takes 5-10 seconds on first use.
- **Memory**: Consumes ~400-600MB resident memory.
- **CPU**: Low during idle, spikes during the "Embedding" phase of document processing.

### 2. LLM Providers
- **Gemini / Hugging Face**: Minimal local resource impact (API-based).
- **Ollama (Local LLM)**: **Significant impact.**
  - If running Ollama on the same machine, you need an additional **8GB+ RAM** and ideally a GPU for acceptable performance.

### 3. OCR (Tesseract)
- **CPU**: High impact during OCR of large PDFs or high-resolution images.
- **Processing Time**: ~2-5 seconds per page depending on complexity.

---

## 💾 Storage Management

MySmartNotes stores data in three main locations:
1. **`data/app.db`**: SQLite database. Grows linearly with notes and chat history. A few thousand notes will typically take <100MB.
2. **`uploads/`**: Original files. This is the primary driver of storage usage.
3. **`generated/`**: AI-generated study materials and version snapshots. These are typically smaller than original PDFs but can accumulate.

**Recommendation**: Use a volume mount for the `/app/data`, `/app/uploads`, and `/app/generated` directories when using Docker to ensure data persistence and easy expansion.
