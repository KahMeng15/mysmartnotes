"""
Smart Pipeline Orchestrator

Ties together all extraction methods (font-aware, layout detection, tables)
and produces a unified Markdown document from a PDF or PPTX file.
"""

import logging
from pathlib import Path
from typing import Dict

from app.processing.font_extractor import FontAwareExtractor
from app.processing.signal_merger import SignalMerger, blocks_to_markdown

logger = logging.getLogger(__name__)


class SmartPipeline:
    """
    Orchestrates the multi-method extraction pipeline.
    
    Methods used:
    1. Font-aware text extraction (pdfplumber chars)
    2. Table detection (pdfplumber only, no ML models)
    """

    def __init__(
        self,
        use_layout_detection: bool = False,  # Disabled - requires ultralytics
        use_table_transformer: bool = False,  # Disabled - requires transformers/torch
    ):
        self.font_extractor = FontAwareExtractor()
        self.layout_detector = None  # Disabled
        self.table_detector = None  # Disabled
        self.merger = SignalMerger()

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

        # Quality metrics
        stats = self._compute_stats(merged_blocks)
        logger.info(f"Output: {stats['total_blocks']} blocks, "
                     f"{stats['headings']} headings, "
                     f"{stats['lists']} list items, "
                     f"{stats['body']} body paragraphs, "
                     f"{stats.get('tables', 0)} tables")

        return markdown

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
        
        # Build header row
        header_row = table[0]
        markdown_lines = []
        
        # Header
        header_cells = [str(cell or "").strip() for cell in header_row]
        markdown_lines.append("| " + " | ".join(header_cells) + " |")
        
        # Separator
        separator_cells = ["-" * max(3, len(cell)) for cell in header_cells]
        markdown_lines.append("| " + " | ".join(separator_cells) + " |")
        
        # Data rows
        for row in table[1:]:
            cells = [str(cell or "").strip() for cell in row]
            markdown_lines.append("| " + " | ".join(cells) + " |")
        
        return "\n".join(markdown_lines)
        """Process a PPTX file with shape-level font extraction."""
        try:
            from pptx import Presentation
            from pptx.util import Pt
        except ImportError:
            raise ImportError("python-pptx is required for PPTX processing. Install: pip install python-pptx")

        logger.info(f"Processing PPTX: {pptx_path}")
        prs = Presentation(pptx_path)

        md_parts = []

        for slide_num, slide in enumerate(prs.slides, 1):
            slide_blocks = []

            for shape in slide.shapes:
                if not shape.has_text_frame:
                    continue

                for paragraph in shape.text_frame.paragraphs:
                    text = paragraph.text.strip()
                    if not text:
                        continue

                    # Determine type from paragraph level and font
                    block_type = "body"
                    is_title = hasattr(shape, "is_placeholder") and shape.is_placeholder
                    
                    if is_title and shape.placeholder_format:
                        ph_type = shape.placeholder_format.type
                        # Placeholder type 1 = TITLE, 15 = TITLE
                        if ph_type in (1, 15):
                            block_type = "h1"
                        elif ph_type in (2,):  # BODY placeholder
                            block_type = "body"

                    # Check font size for heading detection
                    max_size = 0
                    is_bold = False
                    for run in paragraph.runs:
                        if run.font.size:
                            size_pt = run.font.size.pt
                            max_size = max(max_size, size_pt)
                        if run.font.bold:
                            is_bold = True

                    if max_size >= 24 and block_type != "h1":
                        block_type = "h1"
                    elif max_size >= 18:
                        block_type = "h2" if block_type == "body" else block_type
                    elif max_size >= 14 and is_bold:
                        block_type = "h3" if block_type == "body" else block_type

                    # Check for bullet/list
                    level = paragraph.level
                    if level > 0 and block_type == "body":
                        block_type = "list"

                    # Check for numbered bullet
                    bullet = paragraph.paragraph_format
                    if hasattr(bullet, 'bullet') and bullet.bullet:
                        if block_type == "body":
                            block_type = "list"

                    slide_blocks.append({
                        "type": block_type,
                        "text": text,
                        "indent": level,
                    })

            # Format slide blocks as markdown
            for block in slide_blocks:
                if block["type"].startswith("h"):
                    level = int(block["type"][1])
                    md_parts.append(f"{'#' * level} {block['text']}")
                    md_parts.append("")
                elif block["type"] in ("list", "ordered_list"):
                    indent = "  " * block.get("indent", 0)
                    md_parts.append(f"{indent}- {block['text']}")
                else:
                    md_parts.append(block["text"])
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
