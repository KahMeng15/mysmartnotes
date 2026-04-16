"""
Smart Pipeline Orchestrator

Supports three processing modes driven by User.note_processing_mode:
  "fast"             – local font-aware extraction only (original behaviour)
  "smart"            – Gemini Vision for ambiguous slides, no delay
  "smart_throttled"  – Gemini Vision with 1-second inter-call delay

Falls back gracefully to local extraction if Gemini is unavailable.
"""

import logging
from pathlib import Path
from typing import Dict, Optional

from app.processing.font_extractor import FontAwareExtractor
from app.processing.signal_merger import SignalMerger, blocks_to_markdown

logger = logging.getLogger(__name__)


class SmartPipeline:
    """
    Orchestrates the multi-method extraction pipeline.

    Args:
        use_layout_detection: Legacy flag, kept for backward-compat (unused)
        use_table_transformer: Legacy flag, kept for backward-compat (unused)
        use_vision: When True, use Gemini Vision for layout classification
        inter_call_delay_s: Seconds to wait between Gemini Vision calls (rate-limit)
        gemini_api_key: Gemini API key; if None, vision is silently disabled
        gemini_model: Gemini multimodal model to use
    """

    def __init__(
        self,
        use_layout_detection: bool = False,
        use_table_transformer: bool = False,
        use_vision: bool = False,
        inter_call_delay_s: float = 0.0,
        gemini_api_key: Optional[str] = None,
        gemini_model: str = "gemini-2.5-flash",
    ):
        self.use_vision = use_vision and bool(gemini_api_key)
        self.font_extractor = FontAwareExtractor()
        self.layout_detector = None  # Legacy: disabled
        self.table_detector = None   # Legacy: disabled
        self.merger = SignalMerger()

        # Build vision extractor if requested
        self._vision_extractor = None
        if self.use_vision:
            try:
                from app.processing.vision_pipeline import SlideVisionExtractor
                self._vision_extractor = SlideVisionExtractor(
                    use_vision=True,
                    inter_call_delay_s=inter_call_delay_s,
                    gemini_api_key=gemini_api_key,
                    gemini_model=gemini_model,
                )
                logger.info(
                    f"Vision pipeline enabled "
                    f"(delay={inter_call_delay_s}s, model={gemini_model})"
                )
            except Exception as e:
                logger.warning(f"Could not init vision pipeline: {e}. Falling back to local.")
                self.use_vision = False

    def process(self, file_path: str) -> str:
        """
        Process a PDF or PPTX file and return clean Markdown.

        Args:
            file_path: Path to the input file

        Returns:
            Clean Markdown string
        """
        file_path = str(file_path)
        ext = Path(file_path).suffix.lower()

        # Vision path — delegates entirely to SlideVisionExtractor
        if self.use_vision and self._vision_extractor:
            try:
                logger.info(f"Using vision pipeline for {file_path}")
                return self._vision_extractor.process(file_path)
            except Exception as e:
                logger.warning(f"Vision pipeline failed ({e}), falling back to local.")

        # Local fallback path
        if ext == ".pdf":
            return self._process_pdf(file_path)
        elif ext == ".pptx":
            return self._process_pptx(file_path)
        else:
            raise ValueError(f"Unsupported file format: {ext}. Supported: .pdf, .pptx")


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

        # Post-processing: normalize non-standard bullet chars (e.g. Ø, q used in lecture PDFs)
        markdown = self._normalize_pdf_bullets(markdown)

        # Post-processing: remove table content that was also captured as plain body text
        markdown = self._deduplicate_pdf_blocks(markdown)

        # Fix common PDF punctuation-spacing artefacts
        markdown = self._fix_punctuation_spacing(markdown)

        # Quality metrics
        stats = self._compute_stats(merged_blocks)
        logger.info(f"Output: {stats['total_blocks']} blocks, "
                     f"{stats['headings']} headings, "
                     f"{stats['lists']} list items, "
                     f"{stats['body']} body paragraphs, "
                     f"{stats.get('tables', 0)} tables")

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

                    if is_code:
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

            # Emit a slide separator before each slide (except the first)
            if slide_num > 1:
                md_parts.append("")
                md_parts.append("---")
                md_parts.append("")

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
