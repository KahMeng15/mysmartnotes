# Processing Algorithm Test Suite

Standalone test harness for the **SmartPipeline** lecture-extraction engine.  
Drop a PDF or PPTX into `input/`, run the script, and inspect the generated Markdown in `output/`.

---

## Quick Start

```bash
# From the project root
cd scripts/ProcessingAlgorithmTest

# Basic run (local heuristic extraction only)
../../.venv/bin/python run_smart.py

# With AI polish pass (recommended)
../../.venv/bin/python run_smart.py --polish

# Process a specific file
../../.venv/bin/python run_smart.py --polish --input "input/Topic03-Inheritance.pptx"
```

---

## Flags

| Flag | Description |
|------|-------------|
| `--polish` | Enables the AI polish pass after local extraction. Requires a valid Gemini API key. |
| `--input "path"` | Process a specific file instead of all files in `input/`. Path is relative to the script directory. |
| `--api-key=KEY` | Provide a Gemini API key directly via CLI (overrides `.env`). |

### Environment Variables

The script loads `.env` from the project root automatically. The following variables are used:

| Variable | Purpose |
|----------|---------|
| `GEMINI_API_KEY` or `GLOBAL_GEMINI_API_KEY` | API key for the Gemini/Gemma model used in the polish pass. |
| `GLOBAL_AI_MODEL` | Model identifier for the polish pass (default: `gemini-2.5-flash`). |

---

## Directory Structure

```
ProcessingAlgorithmTest/
├── README.md          # This file
├── run_smart.py       # Main test script
├── input/             # Place source PDF/PPTX files here
├── output/            # Generated Markdown + debug logs
│   ├── OUTPUT_<filename>_smart.md
│   └── debug_log.txt
└── temp_input/        # Temporary staging area
```

> **Note:** `input/`, `output/`, and `temp_input/` are gitignored. Their contents are not committed.

---

## Pipeline Architecture

The `SmartPipeline` (`app/processing/smart_pipeline.py`) processes documents through a series of sequential phases:

### Phase 1 — Local Extraction

Runs entirely locally with no API calls.

#### PDF Path
1. **Table Extraction** — Uses `pdfplumber` to identify and extract tabular data with bounding-box coordinates.
2. **Font-Aware Text Extraction** — `FontAwareExtractor` (`app/processing/font_extractor.py`) reads every character span, tracking font name, size, weight, and position. This enables accurate heading detection and code identification (monospace fonts).
3. **Signal Merging** — `SignalMerger` (`app/processing/signal_merger.py`) combines font signals, table data, and layout cues into typed `MergedBlock` objects (heading, body, list, code, table).
4. **Markdown Generation** — `blocks_to_markdown()` converts merged blocks into a Markdown string.
5. **Post-Processing** — PDF-specific cleanup:
   - Bullet normalization (non-standard chars → `- `)
   - Table deduplication (removes text echoes of already-extracted tables)
   - Punctuation spacing fixes

#### PPTX Path
1. **Shape-Level Analysis** — Iterates over every slide and shape using `python-pptx`, extracting text with per-paragraph font metadata.
2. **Font-Size Heading Detection** — Compares paragraph font sizes against a slide-specific median to determine heading rank.
3. **Code Detection** — Identifies code blocks via monospace font detection (`_looks_like_code` heuristic) with balanced checks for structural syntax (brackets, semicolons) and programming keywords.
4. **Markdown Generation** — Per-slide blocks are assembled into a single Markdown document with heading de-inflation guards.

### Phase 2 — Signal Merger Processing (12+ Passes)

The `SignalMerger` applies the following sequential transformations:

| Pass | Name | Purpose |
|------|------|---------|
| 1 | `_strip_institutional_noise` | Removes repeated university/department headers and footers |
| 2 | `_normalize_heading_hierarchy` | Maps font sizes to heading ranks (H1–H6) and enforces **only one H1** |
| 3 | `_split_inline_bullets` | Splits blocks with multiple bullet characters into separate list items |
| 4 | `_clean_list_formatting` | Fixes double-dashes, stuck dashes, and list marker normalization |
| 5 | `_merge_continuations` | Joins fragmented sentences across blocks using punctuation and connector-word heuristics |
| 6 | `_promote_orphan_body_in_lists` | Promotes body blocks sandwiched between list items to list type |
| 7 | `_fix_list_wrapping` | Merges list items that were split mid-sentence |
| 8 | `_deduplicate_consecutive` | Removes exact-duplicate consecutive blocks |

### Phase 3 — AI Polish Pass (Optional, `--polish`)

Requires a Gemini API key. Uses the model specified by `GLOBAL_AI_MODEL`.

1. **Chunking** — The raw Markdown is split into ~6000-character chunks at heading boundaries to prevent context-window quality degradation.
2. **Per-Chunk Transformation** — Each chunk is sent to the AI model with a strict prompt that enforces:
   - **Verbatim text preservation** — No paraphrasing, rewording, or adding new content
   - **Heading hierarchy** — Only one H1 (title), H2 for sections, H3 for sub-sections
   - **Code block rules** — Merge scattered fences, add proper Java indentation, deduplicate repeated blocks from slide animations
   - **Noise removal** — Strip "End of Topic/Chapter" slides and repeated headers
3. **Reassembly** — Polished chunks are joined.
4. **Post-Processing** — Programmatic enforcement of structural rules:
   - Demote any stray H1 headings (beyond the first) to H2
   - Remove "End of Topic/Chapter" lines

### Output Metrics

After processing, the script prints quality metrics:

```
📊 Quality Metrics:
   Headings:   37
   List items: 26
   Table rows: 0
   Body text:  145
   Total lines: 310
```

---

## Key Source Files

| File | Role |
|------|------|
| `app/processing/smart_pipeline.py` | Pipeline orchestrator — coordinates extraction, merging, and polishing |
| `app/processing/font_extractor.py` | Character-level PDF extraction with font metadata |
| `app/processing/signal_merger.py` | Core merging engine — 12+ heuristic passes for block classification |

---

## Supported Formats

| Format | Engine | Notes |
|--------|--------|-------|
| `.pdf` | `pdfplumber` + `FontAwareExtractor` | Best results with text-based PDFs. Scanned PDFs fall back to OCR if Tesseract is available. |
| `.pptx` | `python-pptx` | Shape-by-shape analysis with font-size-based heading detection. |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `No GEMINI_API_KEY found` | Set `GEMINI_API_KEY` or `GLOBAL_GEMINI_API_KEY` in the project root `.env` file, or pass `--api-key=YOUR_KEY`. |
| `FutureWarning: Python 3.9` | Upgrade to Python 3.10+. The pipeline works on 3.9 but some dependencies emit warnings. |
| All headings are H1 | The local heuristic should enforce one H1. If this persists, enable `--polish` for AI-based correction. |
| AI is paraphrasing text | This should not happen with the current prompt. Check that `smart_pipeline.py` has the "EXACT SAME WORDS" instruction. |
