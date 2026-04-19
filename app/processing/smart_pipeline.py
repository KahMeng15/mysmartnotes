"""
Smart Pipeline Orchestrator

Processes PDF and PPTX files into clean Markdown using local font-aware
extraction, heuristic merging, and an optional AI polish pass.
"""

import os
import logging
from pathlib import Path
from typing import Dict, List, Optional

from app.processing.font_extractor import FontAwareExtractor
from app.processing.signal_merger import SignalMerger, blocks_to_markdown

logger = logging.getLogger(__name__)


class SmartPipeline:
    """
    Orchestrates the multi-method extraction pipeline.

    Args:
        use_layout_detection: Legacy flag, kept for backward-compat (unused)
        use_table_transformer: Legacy flag, kept for backward-compat (unused)
        gemini_api_key: Gemini API key for AI polish; if None, polish is disabled
        gemini_model: Model to use for the AI polish pass
        use_polish: When True, use Gemini to polish the final markdown
    """

    def __init__(
        self,
        use_layout_detection: bool = False,
        use_table_transformer: bool = False,
        gemini_api_key: Optional[str] = None,
        gemini_model: str = "gemini-2.5-flash",
        use_polish: bool = False,
        # Legacy kwargs accepted but ignored
        use_vision: bool = False,
        inter_call_delay_s: float = 0.0,
    ):
        self.use_polish = use_polish and bool(gemini_api_key)
        self.gemini_api_key = gemini_api_key
        self.gemini_model = gemini_model
        self.font_extractor = FontAwareExtractor()
        self.layout_detector = None  # Legacy: disabled
        self.table_detector = None   # Legacy: disabled
        self.merger = SignalMerger()

    def process(self, file_path: str) -> str:
        """
        Process a PDF or PPTX file and return clean Markdown.
        """
        file_path = str(file_path)
        ext = Path(file_path).suffix.lower()

        # Check for empty/missing file
        if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
            return f"Error: File is missing or empty: {file_path}"

        markdown = ""
        try:
            markdown = self._local_process(file_path, ext)

            # Final AI Polish Pass
            if self.use_polish and markdown:
                markdown = self._ai_polish(markdown)

            # Quality metrics (final)
            lines = [l for l in markdown.split("\n") if l.strip()]
            headings = len([l for l in lines if l.startswith("#")])
            list_items = len([l for l in lines if l.startswith("- ") or l.startswith("1. ")])
            logger.info(f"Final Output: {len(lines)} lines, {headings} headings, {list_items} list items")

            return markdown
        except Exception as e:
            logger.error(f"Failed to process {file_path}: {e}", exc_info=True)
            return f"Error: Could not process file due to extraction failure: {e}"

    def _local_process(self, file_path: str, ext: str) -> str:
        """Internal helper for local extraction."""
        if ext == ".pdf":
            return self._process_pdf(file_path)
        elif ext == ".pptx":
            return self._process_pptx(file_path)
        else:
            raise ValueError(f"Unsupported file format: {ext}")


    def _process_pdf(self, pdf_path: str) -> str:
        """Process a PDF file through the pipeline."""
        logger.info(f"Processing PDF: {pdf_path}")
        import pdfplumber

        # Extract tables first (for position tracking)
        logger.info("Extracting tables...")
        tables = self._extract_tables_from_pdf(pdf_path)
        logger.info(f"  Found tables on {len([t for t in tables if t])} pages")

        # Font-aware extraction (primary method)
        logger.info("Extracting text via font-aware method...")
        font_results = self.font_extractor.extract(pdf_path, table_bboxes_per_page={})
        logger.info(f"  Extracted {sum(len(p['blocks']) for p in font_results)} blocks from {len(font_results)} pages")

        # Merge signals
        logger.info("Merging signals...")
        merged_blocks = self.merger.merge(
            font_blocks=font_results,
            layout_detections=None,
            tables=tables,
        )

        # Convert to Markdown
        markdown = blocks_to_markdown(merged_blocks)

        # Post-processing steps
        markdown = self._normalize_pdf_bullets(markdown)
        markdown = self._deduplicate_pdf_blocks(markdown)
        markdown = self._fix_punctuation_spacing(markdown)

        return markdown

    def _fix_punctuation_spacing(self, text: str) -> str:
        """
        Fix missing spaces after punctuation that is a common PDF extraction artefact.
        Only inserts spaces when a punctuation character is immediately followed by a
        letter or digit (e.g. "masyarakat,namun" → "masyarakat, namun").
        Skips Markdown syntax patterns like headers (# ...) and URLs.
        """
        import re
        # Insert a space after . , ; : when followed by a letter/digit,
        # but not at start-of-line (Markdown heading # ...) or inside URLs.
        text = re.sub(r'([.,;:])([A-Za-zÀ-žÀ-ÖØ-öø-ÿ\u0100-\u024F])', r'\1 \2', text)
        return text

    def _normalize_pdf_bullets(self, text: str) -> str:
        """
        Normalize non-standard bullet characters used in lecture PDFs
        (e.g. Ø, q, n, v as line-start decorators) into proper Markdown list markers.
        """
        import re
        # These chars appear as bullet stand-ins at the start of lines
        PDF_BULLET_CHARS = r'^[ØqnvlhÂ§ø·]\s+'
        lines = text.split('\n')
        normalized = []
        for line in lines:
            stripped = line.strip()
            if re.match(PDF_BULLET_CHARS, stripped) and len(stripped) > 2:
                # Convert to a proper list item, preserving indent
                indent = len(line) - len(line.lstrip())
                content = re.sub(PDF_BULLET_CHARS, '', stripped).strip()
                normalized.append(' ' * indent + '- ' + content)
            else:
                normalized.append(line)
        return '\n'.join(normalized)

    def _deduplicate_pdf_blocks(self, markdown: str) -> str:
        """
        Remove plain-text blocks that are near-duplicates of table content.
        After pdfplumber extracts tables, the font extractor also reads those
        same characters as body text, causing each table to appear twice.
        Strategy: scan for lines directly after a table that share ≥75% of
        their words with the table rows above.
        """
        import re
        lines = markdown.split('\n')
        result = []
        # Collect table cell words for deduplication window
        table_words: set = set()
        in_table = False
        table_end_idx = -1

        for i, line in enumerate(lines):
            stripped = line.strip()

            # Track table regions
            if stripped.startswith('|'):
                in_table = True
                table_end_idx = i
                # Accumulate all words from table cells
                cells = re.split(r'\s*\|\s*', stripped)
                for cell in cells:
                    table_words.update(cell.lower().split())
                result.append(line)
                continue

            # Reset table word window after 3 non-table lines
            if in_table and i > table_end_idx + 3:
                in_table = False
                table_words = set()

            # Check candidate duplicate line (body text after a table)
            if in_table and stripped and not stripped.startswith('#') and not stripped.startswith('-'):
                line_words = set(stripped.lower().split())
                if len(line_words) >= 4 and table_words:
                    overlap = len(line_words & table_words) / len(line_words)
                    if overlap >= 0.75:
                        logger.debug(f"Dedup: skipping line with {overlap:.0%} table overlap: {stripped[:60]}")
                        continue  # Drop the duplicate

            result.append(line)

        return '\n'.join(result)

    def _extract_tables_from_pdf(self, pdf_path: str) -> list:
        """
        Extract tables from PDF and convert to markdown format.
        
        Returns a list of per-page table data:
        [
            [  # Page 1
                {"y_position": 100, "markdown": "| Header | ..."},
                ...
            ],
            [],  # Page 2 (no tables)
            ...
        ]
        """
        import pdfplumber
        
        all_tables = []
        
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page_num, page in enumerate(pdf.pages, 1):
                    page_tables = []
                    
                    # Extract tables with their bounding boxes
                    raw_tables = page.extract_tables()
                    table_settings = page.find_tables()
                    
                    if not raw_tables:
                        all_tables.append([])
                        continue
                    
                    for idx, table in enumerate(raw_tables):
                        if not table:
                            continue
                        
                        # Convert table to markdown format
                        markdown_table = self._table_to_markdown(table)
                        
                        # Get table Y position from table settings if available
                        y_position = 0
                        if idx < len(table_settings):
                            # Get the top of the table bounding box
                            table_rect = table_settings[idx].bbox  # (x0, top, x1, bottom)
                            if table_rect:
                                y_position = table_rect[1]  # top position
                        
                        page_tables.append({
                            "y_position": y_position,
                            "markdown": markdown_table,
                        })
                    
                    all_tables.append(page_tables)
        except Exception as e:
            logger.warning(f"Table extraction failed: {e}")
            # Return empty list on failure; document extraction continues
            return []
        
        return all_tables

    def _table_to_markdown(self, table: list) -> str:
        """
        Convert a pdfplumber table (list of rows) to markdown table format.

        Args:
            table: List of rows, where each row is a list of cell contents

        Returns:
            Markdown table string
        """
        if not table or not table[0]:
            return ""

        header_row = table[0]
        markdown_lines = []

        header_cells = [str(cell or "").strip() for cell in header_row]
        markdown_lines.append("| " + " | ".join(header_cells) + " |")

        separator_cells = ["-" * max(3, len(cell)) for cell in header_cells]
        markdown_lines.append("| " + " | ".join(separator_cells) + " |")

        for row in table[1:]:
            cells = [str(cell or "").strip() for cell in row]
            markdown_lines.append("| " + " | ".join(cells) + " |")

        return "\n".join(markdown_lines)

    # Monospace fonts indicate code blocks
    MONO_FONT_KEYWORDS = ("mono", "courier", "consolas", "lucida console",
                          "inconsolata", "source code", "fira code", "jetbrains")

    def _is_monospace(self, font_name: str) -> bool:
        """Return True if the font name indicates a monospace/code font."""
        name_lower = (font_name or "").lower()
        return any(kw in name_lower for kw in self.MONO_FONT_KEYWORDS)

    # Shapes whose full text content we should skip entirely
    _SKIP_SHAPE_PATTERNS = (
        "faculty of", "department of", "university", "room no",
        "universiti", "jabatan", "fakulti",  # Malaysian university metadata
    )
    # First-slide index (0-based) where metadata shapes are typically found
    _METADATA_SLIDE_IDX = 0

    def _is_metadata_shape(self, text: str, slide_num: int) -> bool:
        """Return True if this shape appears to be institutional metadata on the cover slide."""
        if slide_num != 1:
            return False
        low = text.lower()
        return any(kw in low for kw in self._SKIP_SHAPE_PATTERNS)

    def _process_pptx(self, pptx_path: str) -> str:
        """Process a PPTX file using shape-level font extraction."""
        try:
            from pptx import Presentation
        except ImportError:
            raise ImportError(
                "python-pptx is required for PPTX processing. "
                "Install: pip install python-pptx"
            )

        logger.info(f"Processing PPTX: {pptx_path}")
        prs = Presentation(pptx_path)
        slide_width = prs.slide_width or 1
        slide_height = prs.slide_height or 1

        # Compute the presentation's dominant body font size so we can
        # calibrate heading thresholds relative to it rather than absolutely.
        all_run_sizes = []
        for slide in prs.slides:
            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue
                for para in shape.text_frame.paragraphs:
                    for run in para.runs:
                        if run.font.size:
                            all_run_sizes.append(run.font.size.pt)

        if all_run_sizes:
            all_run_sizes.sort()
            median_size = all_run_sizes[len(all_run_sizes) // 2]
        else:
            median_size = 18.0

        # Heading thresholds are relative to median body size.
        # A true heading should be meaningfully larger than body text.
        h1_threshold = max(median_size * 1.6, 28.0)
        h2_threshold = max(median_size * 1.3, 22.0)
        h3_threshold = max(median_size * 1.1, 16.0)
        logger.debug(
            f"PPTX median body size: {median_size:.1f}pt → "
            f"h1≥{h1_threshold:.1f}, h2≥{h2_threshold:.1f}, h3≥{h3_threshold:.1f}"
        )

        md_parts = []
        BULLET_CHARS = set("•‣◦⁃∙‐‑–—►▪▸➤➢")

        for slide_num, slide in enumerate(prs.slides, 1):
            slide_blocks = []

            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue

                # Determine shape-level role
                shape_role = "body"
                # shape.top / shape.height can be None on some malformed slides
                _top = shape.top
                _height = shape.height
                shape_top_frac = (_top / slide_height) if (slide_height and _top is not None) else 1.0

                if shape.is_placeholder:
                    ph_type = shape.placeholder_format.idx
                    # idx 0 = TITLE, idx 1 = BODY/CONTENT in standard layouts
                    if ph_type == 0:
                        shape_role = "title"
                    else:
                        shape_role = "body"
                else:
                    # Non-placeholder text box: use position heuristic
                    # Top 15% of slide and relatively short shape → likely a title
                    _h_frac = (_height / slide_height) if (slide_height and _height is not None) else 1.0
                    if shape_top_frac < 0.15 and _h_frac < 0.30:
                        shape_role = "title"

                for para_idx, paragraph in enumerate(shape.text_frame.paragraphs):
                    # Fix PowerPoint in-shape line breaks (\x0b = vertical tab)
                    raw_text = paragraph.text.replace("\x0b", " ").strip()
                    if not raw_text:
                        continue

                    # 1.3 Skip bare slide-number lines (short pure-digit strings)
                    if raw_text.isdigit() and len(raw_text) <= 3:
                        logger.debug(f"Skip slide number literal: '{raw_text}'")
                        continue

                    # 1.6 Skip URLs
                    if raw_text.startswith(("http://", "https://")):
                        logger.debug(f"Skip URL: '{raw_text[:60]}'")
                        continue

                    # 1.6 Skip institutional metadata on cover slide
                    if self._is_metadata_shape(raw_text, slide_num):
                        logger.debug(f"Skip metadata shape on slide 1: '{raw_text[:60]}'")
                        continue

                    text = raw_text
                    level = paragraph.level  # indent level 0–8

                    # Collect run-level font info
                    max_size = 0.0
                    is_bold = False
                    is_code = False
                    for run in paragraph.runs:
                        if run.font.size:
                            size_pt = run.font.size.pt
                            max_size = max(max_size, size_pt)
                        if run.font.bold:
                            is_bold = True
                        if self._is_monospace(run.font.name or ""):
                            is_code = True

                    # Determine block type
                    # Long text (>120 chars) is always body regardless of size.
                    is_long_text = len(text) > 120

                    # Title placeholder: ONLY the first paragraph gets h1.
                    # Subsequent paragraphs in the same shape are sub-content (body/list).
                    is_title_first_para = (shape_role == "title" and level == 0 and para_idx == 0)

                    if is_code or self._looks_like_code(text):
                        block_type = "code"
                    elif is_title_first_para:
                        block_type = "h1"
                    elif not is_long_text and max_size >= h1_threshold:
                        block_type = "h1"
                    elif not is_long_text and max_size >= h2_threshold:
                        block_type = "h2"
                    elif not is_long_text and max_size >= h3_threshold and is_bold:
                        block_type = "h3"
                    elif level > 0:
                        block_type = "list"
                    else:
                        # Check for common list text patterns used in slides
                        first_char = text[0] if text else ""
                        if first_char in BULLET_CHARS or text.startswith("- "):
                            # Strip the bullet char so the list marker isn't duplicated
                            if first_char in BULLET_CHARS:
                                text = text[1:].strip()
                            block_type = "list"
                        else:
                            block_type = "body"

                    slide_blocks.append({
                        "type": block_type,
                        "text": text,
                        "indent": level,
                    })

            if not slide_blocks:
                continue

            # --- Heading de-inflation ---
            # Count h1s beyond the first one — multiple h1s per slide means the
            # threshold still fired wrongly. Demote the excess to body/list.
            h1_blocks = [b for b in slide_blocks if b["type"] == "h1"]
            if len(h1_blocks) > 1:
                seen_h1 = False
                for b in slide_blocks:
                    if b["type"] == "h1":
                        if seen_h1:
                            # Keep as heading only if it is short (≤8 words) — genuine sub-headings
                            # A long h1 or a code-like token is clearly body text.
                            word_count = len(b["text"].split())
                            b["type"] = "h2" if word_count <= 8 else "body"
                        else:
                            seen_h1 = True

            # Demote h2/h3 blocks if they dominate (>35% of total blocks)
            h23_count = sum(1 for b in slide_blocks if b["type"] in ("h2", "h3"))
            total = len(slide_blocks)
            if total > 0 and h23_count / total > 0.35:
                logger.debug(f"Slide {slide_num}: h2/h3 inflation ({h23_count}/{total}), demoting to body")
                for b in slide_blocks:
                    if b["type"] in ("h2", "h3"):
                        b["type"] = "body"

            # Emit markdown for this slide's blocks
            in_code_block = False
            for i, block in enumerate(slide_blocks):
                btype = block["type"]
                text = block["text"]
                indent = block.get("indent", 0)

                if btype == "code":
                    if not in_code_block:
                        md_parts.append("```")
                        in_code_block = True
                    md_parts.append(text)
                else:
                    if in_code_block:
                        md_parts.append("```")
                        md_parts.append("")
                        in_code_block = False

                    if btype.startswith("h"):
                        hnum = int(btype[1])
                        md_parts.append(f"{'#' * hnum} {text}")
                        md_parts.append("")
                    elif btype == "list":
                        prefix = "  " * indent
                        md_parts.append(f"{prefix}- {text}")
                    elif btype == "ordered_list":
                        prefix = "  " * indent
                        md_parts.append(f"{prefix}1. {text}")
                    else:
                        md_parts.append(text)
                        md_parts.append("")

            if in_code_block:
                md_parts.append("```")
                md_parts.append("")

        return "\n".join(md_parts).strip() + "\n"

    def _looks_like_code(self, text: str) -> bool:
        """Return True if text appears to be code even without monospace metadata."""
        if not text or len(text) < 10 or len(text) > 500:
            return False
            
        # Ignore lines that look like markdown headers
        if text.startswith("#"):
            return False
        
        # 1. Check for strong structural code characters (must have multiple types)
        # We look for combinations like (); or {} or []
        has_brackets = "(" in text and ")" in text
        has_braces = "{" in text and "}" in text
        has_terminate = ";" in text
        has_assignment = "=" in text and not text.startswith("=")
        
        # Require serious syntax indicators
        if (has_braces and has_terminate) or (has_brackets and has_terminate and has_assignment):
            return True

        # 2. Check for common programming keywords with strict boundary enforcement
        import re
        # Specialized keywords that are rarely used in plain lecture text without code
        keywords = ("public", "private", "class", "void", "static", "System.out", "println", "import", "def", "return", "function", "const", "let")
        kw_pattern = r'\b(' + '|'.join(keywords) + r')\b'
        matches = re.findall(kw_pattern, text)
        
        # If we see keywords like 'class' or 'public' + syntax characters, it's code
        if len(matches) >= 2 and (has_brackets or has_braces or has_terminate):
            return True

        return False

    # ── chunk size for AI polish (characters) ──
    _POLISH_CHUNK_SIZE = 6000

    def _ai_polish(self, markdown: str) -> str:
        """Perform a final formatting-only cleanup pass using Gemini/Gemma.
        
        Splits the input into manageable chunks to prevent quality degradation
        from long contexts, then reassembles the polished chunks.
        """
        if not self.gemini_api_key or not markdown:
            return markdown

        try:
            import google.generativeai as genai
            genai.configure(api_key=self.gemini_api_key)
            model = genai.GenerativeModel(self.gemini_model)

            chunks = self._split_into_chunks(markdown)
            num_chunks = len(chunks)
            logger.info(f"Refining output with {self.gemini_model} ({num_chunks} chunk(s), parallel)...")

            # ── Parallel chunk processing ──
            from concurrent.futures import ThreadPoolExecutor, as_completed

            def _process_chunk(args):
                idx, chunk = args
                return idx, self._polish_chunk(model, chunk, is_first_chunk=(idx == 0))

            polished_chunks = [None] * num_chunks

            with ThreadPoolExecutor(max_workers=min(num_chunks, 4)) as executor:
                futures = {
                    executor.submit(_process_chunk, (i, chunk)): i
                    for i, chunk in enumerate(chunks)
                }
                for future in as_completed(futures):
                    idx, result = future.result()
                    if result:
                        polished_chunks[idx] = result
                        logger.info(f"  ✓ Chunk {idx + 1}/{num_chunks} done")
                    else:
                        polished_chunks[idx] = chunks[idx]  # fallback to raw
                        logger.warning(f"  ⚠ Chunk {idx + 1}/{num_chunks} returned empty, using raw")

            result = "\n\n".join(polished_chunks).strip()

            # ── Post-processing: enforce structural rules programmatically ──
            import re
            lines = result.split("\n")
            cleaned = []
            seen_h1 = False
            for line in lines:
                # Enforce only ONE H1
                if re.match(r'^#\s+', line) and not re.match(r'^##', line):
                    if seen_h1:
                        # Demote to H2
                        line = "#" + line
                    else:
                        seen_h1 = True
                # Remove "End of Topic/Chapter" lines
                if re.match(r'^#{1,3}\s+(End of|end of)\s+(Topic|Chapter|Lecture)', line, re.IGNORECASE):
                    continue
                cleaned.append(line)

            return "\n".join(cleaned).strip()

        except Exception as e:
            logger.warning(f"AI Polish pass failed: {e}. Returning raw markdown.")

        return markdown

    def _split_into_chunks(self, markdown: str) -> List[str]:
        """Split markdown into chunks at heading boundaries to avoid mid-paragraph splits."""
        import re
        lines = markdown.split("\n")
        
        chunks: List[str] = []
        current_chunk: List[str] = []
        current_size = 0

        for line in lines:
            current_chunk.append(line)
            current_size += len(line) + 1  # +1 for newline

            # Split at heading boundaries when chunk is large enough
            if current_size >= self._POLISH_CHUNK_SIZE and re.match(r'^#{1,3}\s', line):
                # The heading line starts a new chunk
                heading_line = current_chunk.pop()
                if current_chunk:
                    chunks.append("\n".join(current_chunk))
                current_chunk = [heading_line]
                current_size = len(heading_line) + 1

        if current_chunk:
            chunks.append("\n".join(current_chunk))

        return chunks if chunks else [markdown]

    def _polish_chunk(self, model, chunk: str, is_first_chunk: bool = False) -> str:
        """Polish a single chunk of markdown using the AI model."""
        title_instruction = ""
        if is_first_chunk:
            title_instruction = """TITLE: The first heading should be a single H1 that uses the EXACT topic title
from the slides (e.g., "# Topic 3: Inheritance"). Drop institutional names, course codes, and lecturer names.
"""
        else:
            title_instruction = """IMPORTANT: Do NOT use H1 (# ) headings in this section. Use only H2 (## ) and H3 (### ).
"""

        prompt = f"""You are a formatting assistant. Restructure the following raw lecture notes into clean Markdown.

CRITICAL RULES — TEXT INTEGRITY:
- USE THE EXACT SAME WORDS AND SENTENCES from the input. Do NOT rephrase, paraphrase, reword, or add new words.
- ONLY fix: heading levels, bullet formatting, code block fences/indentation, and join lines that were clearly broken mid-sentence.
- Remove: slide numbers, repeated institutional headers/footers, and "End of Topic/Chapter" slides.
{title_instruction}
HEADING RULES:
- There should be ONLY ONE H1 in the entire document (the title). If you see multiple H1s, demote the extras to H2.
- H2 for major section headings (e.g., "Learning Objectives", "Class Inheritance").
- H3 for sub-section headings.
- Do NOT classify normal sentences as headings. A heading should be a short title, not a full sentence or paragraph.
- If two consecutive headings appear with nothing between them (e.g., "## Syntax:" followed by "## super.method(parameters);"), merge them or demote the second.

CODE BLOCK RULES:
- Merge scattered code fences that are clearly part of the SAME code block into ONE code block.
- For example, if you see separate ``` blocks for "public static void main" then "System.out.println" on consecutive lines, merge them into a single ```java block.
- Add proper Java indentation to code: class body indented 4 spaces, method body indented 8 spaces, etc.
- If the EXACT SAME code block appears multiple times (repeated from slide animations), keep it ONLY ONCE and remove the duplicates.

FORMATTING RULES:
- Wrap code in ```java fences.
- Use bullet lists (- ) where the original used bullets.

You MUST begin your output with the exact marker: ===START===
Output ONLY the cleaned markdown after the marker. No explanations, no meta-talk.

### INPUT:
{chunk}
"""
        try:
            response = model.generate_content(prompt)

            if response and hasattr(response, "candidates") and response.candidates:
                candidate = response.candidates[0]
                if candidate.content and candidate.content.parts:
                    text = "".join(
                        part.text for part in candidate.content.parts
                        if hasattr(part, "text")
                    ).strip()

                    # Extract content after the marker
                    marker = "===START==="
                    if marker in text:
                        text = text.split(marker)[-1].strip()
                    else:
                        # Fallback: find first heading
                        import re
                        match = re.search(r'^#\s', text, re.MULTILINE)
                        if match:
                            text = text[match.start():].strip()

                    # Strip outer markdown fences if AI wrapped everything
                    lines = text.split("\n")
                    if len(lines) > 2 and lines[0].strip().startswith("```") and lines[-1].strip() == "```":
                        text = "\n".join(lines[1:-1]).strip()

                    return text
        except Exception as e:
            logger.warning(f"AI Polish chunk failed: {e}")

        return None

    def _compute_stats(self, blocks) -> Dict[str, int]:

        """Compute quality metrics for the output."""
        stats = {
            "total_blocks": len(blocks),
            "headings": 0,
            "lists": 0,
            "tables": 0,
            "body": 0,
        }
        for block in blocks:
            if block.block_type.startswith("h"):
                stats["headings"] += 1
            elif block.block_type in ("list", "ordered_list"):
                stats["lists"] += 1
            elif block.block_type == "table":
                stats["tables"] += 1
            elif block.block_type == "body":
                stats["body"] += 1
        return stats


def process_file(file_path: str, use_ai: bool = True) -> str:
    """
    Convenience function to process a file through the smart pipeline.
    
    Args:
        file_path: Path to PDF or PPTX file
        use_ai: Whether to use AI models (layout detection, table transformer)
        
    Returns:
        Clean Markdown string
    """
    pipeline = SmartPipeline(
        use_layout_detection=use_ai,
        use_table_transformer=use_ai,
    )
    return pipeline.process(file_path)
