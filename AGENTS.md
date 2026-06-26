# velonote — Agent Instructions

## Architecture

**Monolithic FastAPI app + dedicated background worker + React frontend (Vite + Mantine).** No Celery/Redis Queue — tasks are DB-backed (`Task` table polled by `worker_main.py`). Backend is API-only (no HTML/static served).

- `app/main.py` — API entrypoint, registers routers, lifespan (init DB, Redis, bootstrap admin/templates), CORS/CSRF/rate-limit/security-headers middleware
- `app/worker_main.py` — polls `Task` table; handlers in `TASK_REGISTRY` dict (`app/worker_main.py:21`)
- `app/models/db.py` — all SQLAlchemy ORM models (~580 lines)
- `app/schemas/` — Pydantic models (`schemas.py`, `admin.py`, `analytics.py`, `exercise.py`)
- `app/processing/` — document extraction (`smart_pipeline.py`), AI client, embeddings
- `app/utils/` — auth (JWT), db session, tasks (DB-backed queue), websocket, caching
- `frontend/` — React app (Vite). Dev server proxies `/api` → `localhost:8000` (`frontend/vite.config.js`)

## Key commands

```bash
brew install tesseract poppler                              # System deps (macOS)
pip install -r requirements.txt
./scripts/dev.sh                                             # API + Worker + Frontend (parallel)
python -m uvicorn app.main:app --reload                      # API only
python -m app.worker_main                                    # Worker only
cd frontend && npm run dev                                   # Frontend only
docker compose up -d --build                                 # Full stack
docker compose -f docker-compose.dev.yml up -d db redis      # Infra only for local dev
cd frontend && npm run lint                                  # Frontend lint
python scripts/ProcessingAlgorithmTest/run_smart.py          # Offline extraction test (no server)
```

No Python tests exist — no `test_*.py` files in the repo.

## Database

PostgreSQL. `DATABASE_URL` auto-constructed from `DB_USER/PASSWORD/HOST/PORT/NAME` env vars (`app/config.py:164`). **Do not set `DATABASE_URL` directly.** No migration tool — tables auto-created via `Base.metadata.create_all()` in `init_db()`. Add schema changes as programmatic one-off migrations in `app/utils/db.py` (see `apply_postgresql_migrations()`, etc.).

## Background tasks

Submit tasks via `TaskManager.submit_task(task_id, task_type, user_id, **kwargs)`. Worker polls for `status="pending"` tasks with per-user concurrency limits (`RateLimitConfig`). WebSocket pushes progress to `ConnectionManager` keyed by user_id.

## AI client (`app/processing/ai_client.py`)

3-tier fallback (Gemini → Gemini → Ollama). Resolution: user personal settings > global settings (`GLOBAL_AI_TIER*` env vars) > legacy fallbacks (`GEMINI_API_KEY`, etc.). Gemini model dynamically selected at init; falls back to `gemini-1.5-flash`.

## Router conventions

Every endpoint takes `current_user: User = Depends(get_current_user)` and `db: Session = Depends(get_db)`. Always filter queries by `user_id`. Use `response_model=` with schemas from `app/schemas/`.

## Settings & Auth

- `get_settings()` via `app/config.py` (lru_cache) — never instantiate `Settings()` directly.
- JWT: `Authorization: Bearer <token>` header or `access_token` cookie.
- CSRF enforced for cookie-authenticated sessions. Exempt paths listed in `app/main.py:254-261`.
- Sliding session re-issues tokens on activity (`X-New-Token` response header).
- Rate limiting: per-endpoint burst limits defined in `_RATE_LIMIT_POLICY` dict (`app/main.py:150-156`).

## Production safety

Startup blocks if: `SECRET_KEY < 32 chars`, `DATABASE_URL` not PostgreSQL, or CORS has wildcard origin. Set `ENVIRONMENT=production`, `COOKIE_SECURE=true`, `APP_ENCRYPTION_KEY`.

## Key patterns

- **File storage:** `uploads/{user_id}/{lecture_id}/`, `generated/{lecture_id}/`, `output/images/{lecture_id}/`
- **ID generation:** prefixed hex IDs (`gp_`, `sj_`, `rs_`, `nt_`, `ex_`, `mg_`, `cv_`) via `generate_random_id()` in `app/utils/db.py`
- **Pipeline singleton:** `app/routers/processing.py → _pipeline` (module-level, reused across requests)
- **Startup bootstrap:** Admin user from `ADMIN_EMAIL` env var, `SystemSettings` row, export template seeding — all in `main.py` lifespan
- **Migrations:** Add to `app/utils/db.py` as new `apply_*_migration()` functions called from `init_db()` — never hand-write SQL migration scripts
