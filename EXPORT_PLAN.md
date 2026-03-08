# Export Feature — Implementation Plan

## Summary

Add PDF and DOCX export to the note view with a full template management system. The existing `DocumentGenerator` (ReportLab) handles PDF; a new `docx_generator.py` (`python-docx`) handles DOCX. A dedicated template page lets users build reusable export templates with per-element styling and live preview. Work is split into four phases.

---

## Phase 1 — PDF Export MVP

> **Goal:** A working Export button in `note.html` that generates and downloads a styled PDF.

### 1.1 Fix the existing `generate-pdf` endpoint

The current `POST /lectures/{id}/generate-pdf` in `app/routers/lectures.py` (line 404) parses segments and images but **never calls `DocumentGenerator.generate_pdf()`**. It just returns a success dict.

**Changes (`app/routers/lectures.py`):**
- After building `segments` and `images`, instantiate `DocumentGenerator` and call `generate_pdf(segments, images)`.
- Save the returned path to `lecture.output_pdf_path` and commit.
- Return `{ "success": true, "download_url": "/lectures/{id}/download-pdf" }`.

### 1.2 Add Export button + modal to `note.html`

**Changes (`app/static/note.html`):**
- Add an **Export** button in the note toolbar (next to Edit / Chat).
- On click, open a lightweight modal with:
  - Format selector: **PDF** (only option in Phase 1).
  - Toggles: Include TOC ✓, Include cover page ✓.
  - **Export** button → `POST /lectures/{id}/generate-pdf` with options.
  - Show a spinner while generating, then auto-download via the `download_url`.

### 1.3 Extend `DocumentGenerator` to accept options

**Changes (`app/processing/document_generator.py`):**
- `generate_pdf()` accepts optional kwargs: `include_toc=True`, `include_cover=True`.
- Skip `_create_title_page()` / `_create_table_of_contents()` based on flags.

### 1.4 Handle markdown-only lectures

The current code assumes `extracted_content_structured` (JSON segments) exists. But users can edit raw markdown via the WYSIWYG editor, so `extracted_text` may be the only source.

**Changes (`app/routers/lectures.py`):**
- If `extracted_content_structured` is empty/null but `extracted_text` exists, convert markdown → segments using the existing `_markdown_to_segments()` helper from `app/routers/processing.py`.

---

## Phase 2 — DOCX Export

> **Goal:** Add DOCX as a second export format.

### 2.1 Create `app/processing/docx_generator.py`

- Map `ContentSegment` types → `python-docx` paragraph styles (Heading 1–4, Normal, List Bullet, etc.).
- Embed images from `output/` paths using `docx.shared.Inches`.
- Optionally add a cover page (title + date) and TOC placeholder.
- Output to `generated/{lecture_id}/OUTPUT.docx`.

> [!IMPORTANT]
> **Font limitation:** `python-docx` sets the font *name* in styles, but the font must be installed on the viewer's machine to render. We will set "Instrument Sans" as the preferred font with "Calibri" as fallback. This is standard DOCX behavior — no TTF embedding needed.

### 2.2 Add unified export endpoint

**Changes (`app/routers/lectures.py`):**
- Add `POST /lectures/{id}/export` accepting `{ "format": "pdf"|"docx", "include_toc": bool, "include_cover": bool }`.
- Route to `DocumentGenerator` or `DocxGenerator` based on format.
- Save path to a new `GeneratedDocument` record (model already exists in `db.py`).
- Return `{ "success": true, "download_url": "/lectures/{id}/download-export?format=docx" }`.

### 2.3 Add download endpoint

**Changes (`app/routers/lectures.py`):**
- Add `GET /lectures/{id}/download-export?format=pdf|docx`.
- Look up the most recent `GeneratedDocument` for the lecture + format.
- Return `FileResponse` with correct MIME type.

### 2.4 Update the export modal

**Changes (`app/static/note.html`):**
- Add DOCX to the format selector.
- POST to the new `/export` endpoint instead of `/generate-pdf`.

### 2.5 Dependencies

- Add `python-docx` to `requirements.txt`.

---

## Phase 3 — Template Management Page & Custom Templates

> **Goal:** A dedicated page where users create, edit, and preview export templates — plus integration into the export modal.

### 3.1 Data model

**Changes (`app/models/db.py`):**
- Add `ExportTemplate` model:
  - `id`, `user_id` (nullable for built-in presets), `name`, `config` (JSON), `created_at`, `updated_at`.

- `config` JSON schema:
  ```json
  {
    "page": {
      "size": "letter",
      "orientation": "portrait",
      "margins": { "top": 72, "bottom": 72, "left": 72, "right": 72 },
      "columns": 1
    },
    "font_family": "Instrument Sans",
    "font_fallback": "Arial, sans-serif",
    "elements": {
      "h1": { "font_size": 28, "font_weight": "bold", "alignment": "left", "text_color": "#1a1a2e", "bg_color": null },
      "h2": { "font_size": 24, "font_weight": "bold", "alignment": "left", "text_color": "#1a1a2e", "bg_color": null },
      "h3": { "font_size": 20, "font_weight": "bold", "alignment": "left", "text_color": "#1a1a2e", "bg_color": null },
      "h4": { "font_size": 16, "font_weight": "bold", "alignment": "left", "text_color": "#333333", "bg_color": null },
      "h5": { "font_size": 14, "font_weight": "bold", "alignment": "left", "text_color": "#333333", "bg_color": null },
      "paragraph": { "font_size": 11, "font_weight": "normal", "alignment": "justify", "text_color": "#000000", "bg_color": null },
      "list_bullet": { "font_size": 11, "font_weight": "normal", "alignment": "left", "text_color": "#000000", "bg_color": null },
      "list_number": { "font_size": 11, "font_weight": "normal", "alignment": "left", "text_color": "#000000", "bg_color": null, "number_format": "1." }
    },
    "spacing": {
      "line_spacing": 1.15,
      "paragraph_after": 8
    },
    "cover_page": {
      "enabled": true,
      "title_font_size": 36,
      "title_color": "#1a1a2e",
      "show_date": true,
      "show_author": true
    },
    "header": {
      "enabled": false,
      "text": "",
      "show_note_title": true
    },
    "footer": {
      "enabled": true,
      "show_page_number": true,
      "text": "Generated by mysmartnotes.vercel.app | Create notes and study smart!"
    },
    "images": {
      "default_alignment": "center",
      "max_width_percent": 90
    }
  }
  ```

> [!WARNING]
> Adding the `ExportTemplate` table requires a DB migration. Use `alembic revision --autogenerate` or the project's migration script. Include a rollback step.

### 3.2 Template CRUD router

- New file: `app/routers/templates.py` — standard CRUD (list/create/update/delete) following existing router patterns.
- Register in `main.py`.
- Seed 3 built-in presets on first startup (`user_id = NULL`):
  - **Standard Academic** — clean, serif-like headings, justified paragraphs, cover page on.
  - **Modern Minimal** — generous margins, left-aligned, muted heading colors.
  - **Bold & Dark** — dark heading backgrounds, white text on headings, compact spacing.

### 3.3 Pydantic schemas

**Changes (`app/schemas/schemas.py`):**
- Add `ExportTemplateCreate`, `ExportTemplateUpdate`, `ExportTemplateResponse`.
- Add `ExportRequest`: `format`, `template_id` (optional), `include_toc`, `include_cover`.

### 3.4 Template management page (`app/static/templates.html`)

**New page** with the following sections:

#### Template List Panel (left)
- Lists all templates (built-in + user-created).
- Built-in presets have a 🔒 badge (read-only, but can be duplicated).
- "Create New Template" button.
- Edit / Duplicate / Delete actions per template.

#### Template Editor Panel (right)
- **Page Setup** section: page size dropdown (Letter, A4, Legal), orientation toggle (Portrait / Landscape), columns (1 / 2), margin inputs (top, bottom, left, right in pt).
- **Element Styles** section — accordion or tabs for each element type:
  - H1, H2, H3, H4, H5, Paragraph, Bulleted List, Numbered List
  - Each element shows:
    - Alignment: left | center | justify | right (icon buttons)
    - Text colour (color picker)
    - Background colour (color picker, with "None" option)
    - Font weight: normal | bold (toggle)
    - Font size (number input in pt)
    - *(Numbered list only)* Number format: `1.` / `a.` / `i.` / `A.` / `I.`
- **Spacing** section: line spacing (1.0 / 1.15 / 1.5 / 2.0), paragraph spacing after (pt).
- **Cover Page** section: toggle on/off, title font size, title colour, show date toggle, show author toggle.
- **Header & Footer** section:
  - Header: toggle on/off, custom text, show note title toggle.
  - Footer: toggle on/off, show page number toggle, custom text (pre-filled with the branding text).
- **Image Defaults** section: default alignment (left / center / right), max width % slider.

#### Live Preview Panel
- A mock A4/Letter page that re-renders in real-time as the user changes settings.
- Shows placeholder headings, a paragraph, a bulleted list, a numbered list, and an image placeholder — all styled according to the current template config.
- Shows header/footer area with page number.

> [!IMPORTANT]
> The live preview is purely CSS/HTML-based (client-side only). It does not generate an actual PDF/DOCX — it visually approximates the output using matching CSS styles so the user gets instant feedback.

### 3.5 Update export modal in `note.html`

**Changes (`app/static/note.html`):**
- Add a template dropdown (populated via `GET /templates`), showing template names.
- "Manage Templates" link → opens `templates.html` in a new tab.
- Pass `template_id` in the export request.

### 3.6 Apply template config to generators

**Changes (`app/processing/document_generator.py` and `docx_generator.py`):**
- Accept a `template_config: dict` parameter.
- Apply page size, orientation, margins, columns from `config.page`.
- Apply per-element styles (font size, weight, alignment, colors) from `config.elements`.
- Apply line/paragraph spacing from `config.spacing`.
- Render cover page using `config.cover_page` settings.
- Render header/footer using `config.header` and `config.footer` settings.
- Handle image alignment and sizing from `config.images`.

### 3.7 Fonts

- Bundle Instrument Sans TTF in `app/static/fonts/`.
- Register via `pdfmetrics.registerFont(TTFont(...))` in `DocumentGenerator`.
- Fallback to Helvetica if font file is missing.

### 3.8 Branded footer

All exports include a footer line (enabled by default):

```
Generated by mysmartnotes.vercel.app | Create notes and study smart! | {Date and time generated}
```

The date/time is injected at export time, not stored in the template config.

---

## Phase 4 — Background Tasks & Progress

> **Goal:** Run export generation as a background task with real-time WebSocket progress.

### 4.1 Background execution

**Changes (`app/routers/lectures.py`):**
- Wrap the export generation in `TaskManager.submit_task()`.
- Return `{ "task_id": "...", "status": "pending" }` immediately.
- Client polls `TaskManager.get_task_status()` or listens on WebSocket.

> [!IMPORTANT]
> **Async bridge required:** `TaskManager` uses `ThreadPoolExecutor` (sync), but `ConnectionManager.broadcast_to_user()` is async. Use `asyncio.run_coroutine_threadsafe(coro, loop)` to push progress updates from the sync worker thread to the async WebSocket manager.

### 4.2 Progress updates

**Changes (`app/processing/document_generator.py` and `docx_generator.py`):**
- Accept an optional `progress_callback: Callable[[int, str], None]`.
- Call it at key milestones: cover page (10%), TOC (20%), content (20–90%), finalising (95%), done (100%).

### 4.3 Frontend progress UI

**Changes (`app/static/note.html`):**
- After triggering export, show a progress bar in the modal.
- Listen for WebSocket messages of type `export_progress` with `{ "task_id", "progress", "step" }`.
- On completion, auto-trigger download.

---

## Verification

### Phase 1
- Open a note → click Export → choose PDF → verify download.
- Test with a note that has only `extracted_text` (no structured segments).
- Verify TOC/cover toggles work.

### Phase 2
- Export as DOCX → open in Word/Google Docs → verify headings, lists, images render.
- Verify `GeneratedDocument` records are created in DB.

### Phase 3
- Open template management page → create a custom template with custom styles.
- Verify live preview updates in real-time as settings change.
- Duplicate a built-in preset → edit it → save as new template.
- Export a note using the custom template → verify all styles (fonts, colors, alignment, spacing) are applied in PDF and DOCX.
- Verify built-in presets are seeded on first startup.
- Verify per-element styling: change H2 to centered red text → confirm it renders correctly.

### Phase 4
- Export a large note → verify progress updates appear in real-time.
- Verify download auto-triggers on completion.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| PDF engine | ReportLab (existing `DocumentGenerator`) | Already built and working |
| DOCX engine | `python-docx` (new `docx_generator.py`) | Standard Python lib, no system deps |
| Execution (Phase 1–3) | Synchronous | Fast enough for most notes; defer complexity |
| Execution (Phase 4) | Background task + WebSocket | Needed only for large documents |
| Templates (Phase 1–2) | Built-in defaults only | Ship fast, add customization later |
| Templates (Phase 3) | Per-user + seeded presets + dedicated page | Full flexibility with live preview |
| Fonts | Instrument Sans (bundled TTF) | Consistent branding; fallback to Helvetica/Arial |
| Live preview | Client-side CSS/HTML only | Instant feedback, no server round-trips |
| Footer branding | Default-on, user-editable | Promotes the app, but user can customize |
| Math rendering | **Deferred** | Requires Node.js (MathJax) or complex setup; not worth the cost for v1 |
