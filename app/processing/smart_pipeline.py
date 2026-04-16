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

        md_parts = []

        for slide_num, slide in enumerate(prs.slides, 1):
            slide_blocks = []

            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue

                # Determine shape-level role
                shape_role = "body"
                shape_top_frac = shape.top / slide_height if slide_height else 0

                if hasattr(shape, "placeholder_format") and shape.placeholder_format:
                    ph_type = shape.placeholder_format.idx
                    # idx 0 = TITLE, idx 1 = BODY/CONTENT in standard layouts
                    if ph_type == 0:
                        shape_role = "title"
                    elif ph_type == 1:
                        shape_role = "body"
                    else:
                        shape_role = "body"
                else:
                    # Non-placeholder text box: use position heuristic
                    # Top 15% of slide and relatively short shape → likely a title
                    if shape_top_frac < 0.15 and shape.height / slide_height < 0.30:
                        shape_role = "title"

                for paragraph in shape.text_frame.paragraphs:
                    text = paragraph.text.strip()
                    if not text:
                        continue

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
                    if is_code:
                        block_type = "code"
                    elif shape_role == "title" and level == 0:
                        # Title placeholder always → h1, regardless of font size
                        block_type = "h1"
                    elif max_size >= 28:
                        block_type = "h1"
                    elif max_size >= 22:
                        block_type = "h2"
                    elif max_size >= 16 and is_bold:
                        block_type = "h3"
                    elif max_size >= 14 and is_bold and len(text) < 100:
                        block_type = "h4"
                    elif level > 0:
                        block_type = "list"
                    else:
                        # Check for common list text patterns used in slides
                        first_char = text[0] if text else ""
                        BULLET_CHARS = set("•‣◦⁃∙‐‑–—►▪▸➤➢")
                        if first_char in BULLET_CHARS or text.startswith("- "):
                            block_type = "list"
                        else:
                            block_type = "body"

                    slide_blocks.append({
                        "type": block_type,
                        "text": text,
                        "indent": level,
                    })

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
