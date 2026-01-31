# Assistant Context (short summary)

Purpose
-------
This file is a compact, single-source summary intended for assistant sessions. Paste it at the start of a chat to give the assistant the repo context quickly.

What this project is
--------------------
- Lightweight FastAPI app: converts lecture slides (PDF/PPTX/images) into study materials and supports RAG-based chat, quizzes, flashcards.
- Single-container design, SQLite backend, embeddings for semantic search.

Key files and folders (quick reference)
-------------------------------------
- `README.md` — project overview and quick start
- `docs/` — detailed docs (ARCHITECTURE.md, DEVELOPMENT.md, FILE_STRUCTURE.md, etc.)
- `template/` — frontend templates: `index.html`, `master.css`
- `app/` — main application code. Notable subfolders:
  - `app/processing/` — `ai_client.py`, `embeddings.py`, `ocr.py`, `search.py`
  - `app/routers/` — API endpoints: `chat.py`, `documents.py`, `flashcards.py`, etc.
  - `app/models/` — `db.py` and data models
- `main.py` — application entrypoint
- `requirements.txt` — Python dependencies

Quick session checklist (what to paste at session start)
-----------------------------------------------------
1. Brief goal (one sentence): e.g., "Add endpoint X" or "Fix failing test Y".
2. Paste relevant file excerpts (function or error trace) — small snippets are best.
3. If you want me to modify files directly, say: "Apply patches".

Commands to produce a short summary locally (to paste into chat)
----------------------------------------------------------------
Run these locally and paste the output into the chat to give the assistant a compact snapshot:

```bash
mkdir -p /tmp/assistant
cat README.md docs/INDEX.md docs/ARCHITECTURE.md template/index.html > /tmp/assistant/session_summary.txt
head -n 500 /tmp/assistant/session_summary.txt
```

How to ask good questions (fastest results)
-----------------------------------------
- Be explicit: include file path(s) and desired change. Example: "Change `app/processing/ocr.py` so OCR returns plain text only."  
- Small tasks: prefer 1–3 closely related changes per request.  
- Include failing output: paste exact error trace or test output.  
- Mark permission to edit: say "apply patches" if you want automated edits.

Optional enhancements (next steps I can implement)
------------------------------------------------
- `scripts/generate_assistant_context.py` — script to assemble docs/templates into one paste-ready summary.  
- Semantic memory: index `docs/` + `template/` with embeddings (FAISS/SQLite) and a `scripts/query_memory.py` tool to fetch relevant chunks automatically.

Notes
-----
- Keep this file short. Update when key design decisions change.  
- Use this as the first message content when starting a new assistant session to simulate persistent memory.

Last updated: 2026-01-31
