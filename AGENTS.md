# MySmartNotes — Agent Instructions

## Architecture

**Monolithic FastAPI app + dedicated background worker + React frontend.**

- `app/main.py` — API entry point (uvicorn), registers all routers in `app/routers/`
- `app/worker_main.py` — polls DB for pending `Task` records; task handlers registered in `TASK_REGISTRY` dict
- `app/models/db.py` — all SQLAlchemy ORM models (single file, ~580 lines)
- `app/schemas/` — Pydantic models (`schemas.py` + `admin.py`, `analytics.py`, `exercise.py`)
- `app/processing/` — document extraction (`smart_pipeline.py`), AI client, embeddings
- `app/utils/` — auth (JWT), db session, tasks (DB-backed queue), websocket, caching

**Database**: PostgreSQL. `DATABASE_URL` is auto-constructed from `DB_USER/PASSWORD/HOST/PORT/NAME` env vars (`app/config.py:164`). No migration tool — tables auto-created via `Base.metadata.create_all()` in `init_db()`, plus programmatic one-off migrations in `app/utils/db.py`.

**Frontend**: React + Vite + Mantine UI in `frontend/`. Dev server proxies `/api` → localhost:8000 and `/ws` for WebSocket.

The backend is **API-only** — no HTML/static UI served from the backend.

## Key developer commands

```bash
# System deps (macOS)
brew install tesseract poppler

# Python env
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Run everything (API + Worker + React frontend)
./scripts/dev.sh

# Run API only (with hot reload)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Run worker only
python -m app.worker_main

# React frontend only
cd frontend && npm run dev

# Full Docker stack
docker-compose up -d --build

# Infra only (for local dev)
docker-compose up -d db redis

# Lint frontend
cd frontend && npm run lint

# No Python tests exist in this repo.
# Manual extraction test (no server needed):
python scripts/ProcessingAlgorithmTest/run_smart.py
```

## Background tasks

API submits `Task` records to DB; `worker_main.py` polls for pending tasks. Uses `TASK_REGISTRY` (`app/worker_main.py:21`) mapping task types to handlers. Per-user concurrency limit configurable via `RateLimitConfig`.

Submit a task:
```python
TaskManager.submit_task(task_id, task_type, user_id, **kwargs)
```

## AI client (`app/processing/ai_client.py`)

3-tier fallback: Tier 1/2 = Gemini with configurable reasoning levels, Tier 3 = Ollama. Resolution order: user personal settings > global settings (`GLOBAL_AI_TIER*` env vars) > legacy env vars (`GEMINI_API_KEY`, etc.).

Gemini model is dynamically selected at init; falls back to `gemini-1.5-flash`.

## Router conventions

Every endpoint takes `current_user: User = Depends(get_current_user)` and `db: Session = Depends(get_db)`. Always filter queries by `user_id` for ownership. Use `response_model=` with Pydantic models from `app/schemas/`.

## Settings

Access via `app/config.py → get_settings()` (lru_cache). Never instantiate `Settings()` directly. Config comes from `.env` via `pydantic_settings`.

## Auth

JWT as `Authorization: Bearer <token>` header or `access_token` cookie. CSRF enforced for cookie-authenticated sessions (exempt: auth routes). Sliding session re-issues tokens on activity.

## Production safety

Startup blocks if: SECRET_KEY < 32 chars, DATABASE_URL is not PostgreSQL, or CORS has wildcard origin. Set `ENVIRONMENT=production`, `COOKIE_SECURE=true`.

## Key patterns

- File storage: `uploads/{user_id}/{lecture_id}/`, `generated/{lecture_id}/`, `output/images/{lecture_id}/`
- Embeddings: pre-computed, stored in `LectureEmbedding` table. Run `python scripts/migrate_embeddings.py` to backfill.
- WebSocket: `ConnectionManager` keyed by `user_id` (`app/utils/websocket.py`)
- Pipeline singleton: `app/routers/processing.py → _pipeline` (reused across requests, module-level)
- ID generation: prefixed hex IDs (`gp_`, `sj_`, `rs_`, `nt_`, `ex_`, `mg_`, `cv_`) via `generate_random_id()` in `app/utils/db.py`
