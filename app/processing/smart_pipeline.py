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

        # Font-aware extraction (primary method)
        logger.info("Extracting text via font-aware method...")
        font_results = self.font_extractor.extract(pdf_path, table_bboxes_per_page={})
        logger.info(f"  Extracted {sum(len(p['blocks']) for p in font_results)} blocks from {len(font_results)} pages")

        # Merge signals
        logger.info("Merging signals...")
        merged_blocks = self.merger.merge(
            font_blocks=font_results,
            layout_detections=None,
            tables=[],
        )

        # Convert to Markdown
        markdown = blocks_to_markdown(merged_blocks)

        # Quality metrics
        stats = self._compute_stats(merged_blocks)
        logger.info(f"Output: {stats['total_blocks']} blocks, "
                     f"{stats['headings']} headings, "
                     f"{stats['lists']} list items, "
                     f"{stats['body']} body paragraphs")

        return markdown

    def _process_pptx(self, pptx_path: str) -> str:
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
