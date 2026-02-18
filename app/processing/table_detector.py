"""
Hybrid Table Detection & Extraction

Combines pdfplumber's built-in table extraction (for bordered tables)
with Microsoft's Table Transformer models (for borderless tables).
Outputs structured table data in Markdown format.
"""

import pdfplumber
import logging
import re
from typing import List, Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)


class TableDetector:
    """
    Hybrid table detector:
    1. pdfplumber find_tables() for bordered tables
    2. Microsoft Table Transformer for borderless tables (optional)
    """

    def __init__(self, use_transformer: bool = True):
        self.use_transformer = use_transformer
        self.transformer_model = None
        self.structure_model = None
        self._load_attempted = False

    def _ensure_transformer(self):
        """Lazy-load the table transformer model."""
        if self._load_attempted or not self.use_transformer:
            return

        self._load_attempted = True
        try:
            from transformers import AutoImageProcessor, TableTransformerForObjectDetection
            import torch

            # Table detection model
            self.det_processor = AutoImageProcessor.from_pretrained(
                "microsoft/table-transformer-detection"
            )
            self.transformer_model = TableTransformerForObjectDetection.from_pretrained(
                "microsoft/table-transformer-detection"
            )

            # Table structure recognition model
            self.struct_processor = AutoImageProcessor.from_pretrained(
                "microsoft/table-transformer-structure-recognition"
            )
            self.structure_model = TableTransformerForObjectDetection.from_pretrained(
                "microsoft/table-transformer-structure-recognition"
            )

            logger.info("Table Transformer models loaded successfully")

        except ImportError as e:
            logger.warning(f"Table Transformer not available: {e}")
        except Exception as e:
            logger.warning(f"Table Transformer load failed: {e}")

    def extract_tables_from_page(
        self,
        page,
        page_image=None,
    ) -> List[Dict[str, Any]]:
        """
        Extract tables from a pdfplumber page.

        Args:
            page: pdfplumber Page object
            page_image: Optional PIL Image for transformer detection

        Returns:
            List of table dicts with bbox, data, and markdown
        """
        tables = []

        # Method 1: pdfplumber built-in table detection
        plumber_tables = self._extract_pdfplumber_tables(page)
        tables.extend(plumber_tables)

        # Method 2: Transformer-based detection for borderless tables
        if page_image and self.use_transformer:
            self._ensure_transformer()
            if self.transformer_model:
                transformer_tables = self._extract_transformer_tables(
                    page, page_image, existing_bboxes=[t["bbox"] for t in tables]
                )
                tables.extend(transformer_tables)

        return tables

    def _extract_pdfplumber_tables(self, page) -> List[Dict[str, Any]]:
        """Extract tables using pdfplumber's built-in detection."""
        tables = []

        # Cut header/footer
        height = page.height
        width = page.width
        crop_box = (0, height * 0.05, width, height * 0.90)

        try:
            cropped = page.crop(crop_box)
        except ValueError:
            cropped = page

        found = cropped.find_tables(
            table_settings={
                "vertical_strategy": "lines",
                "horizontal_strategy": "lines",
                "intersection_y_tolerance": 5,
            }
        )

        for table in found:
            data = table.extract()
            if data and len(data) > 1:  # Need at least header + 1 row
                bbox = table.bbox
                md = self._table_data_to_markdown(data)
                tables.append({
                    "bbox": bbox,
                    "data": data,
                    "markdown": md,
                    "method": "pdfplumber",
                    "y_position": bbox[1],
                })

        return tables

    def _extract_transformer_tables(
        self, page, page_image, existing_bboxes: List
    ) -> List[Dict[str, Any]]:
        """Extract borderless tables using Table Transformer."""
        try:
            import torch

            # Detect tables in image
            inputs = self.det_processor(images=page_image, return_tensors="pt")
            with torch.no_grad():
                outputs = self.transformer_model(**inputs)

            # Post-process detections
            target_sizes = torch.tensor([page_image.size[::-1]])
            results = self.det_processor.post_process_object_detection(
                outputs, threshold=0.7, target_sizes=target_sizes
            )[0]

            tables = []
            img_w, img_h = page_image.size
            pdf_w, pdf_h = page.width, page.height

            for score, label, box in zip(
                results["scores"], results["labels"], results["boxes"]
            ):
                # Convert image coordinates to PDF coordinates
                x1, y1, x2, y2 = box.tolist()
                pdf_bbox = (
                    x1 * pdf_w / img_w,
                    y1 * pdf_h / img_h,
                    x2 * pdf_w / img_w,
                    y2 * pdf_h / img_h,
                )

                # Skip if overlaps with already-detected table
                if self._overlaps_existing(pdf_bbox, existing_bboxes):
                    continue

                # Try to extract text from this region
                try:
                    cropped_page = page.crop(pdf_bbox)
                    text = cropped_page.extract_text() or ""
                    if text.strip():
                        # Simple heuristic: try to parse as table
                        data = self._text_to_table_data(text)
                        if data and len(data) > 1:
                            md = self._table_data_to_markdown(data)
                            tables.append({
                                "bbox": pdf_bbox,
                                "data": data,
                                "markdown": md,
                                "method": "transformer",
                                "confidence": float(score),
                                "y_position": pdf_bbox[1],
                            })
                except Exception as e:
                    logger.debug(f"Failed to extract transformer table region: {e}")

            return tables

        except Exception as e:
            logger.error(f"Transformer table extraction failed: {e}")
            return []

    def _overlaps_existing(self, bbox: Tuple, existing: List[Tuple], threshold: float = 0.5) -> bool:
        """Check if bbox overlaps significantly with existing bboxes."""
        x1, y1, x2, y2 = bbox
        area = (x2 - x1) * (y2 - y1)
        if area <= 0:
            return False

        for ex in existing:
            ex1, ey1, ex2, ey2 = ex
            # Intersection
            ix1 = max(x1, ex1)
            iy1 = max(y1, ey1)
            ix2 = min(x2, ex2)
            iy2 = min(y2, ey2)

            if ix1 < ix2 and iy1 < iy2:
                intersection = (ix2 - ix1) * (iy2 - iy1)
                if intersection / area > threshold:
                    return True

        return False

    def _text_to_table_data(self, text: str) -> Optional[List[List[str]]]:
        """Try to parse raw text into table rows/columns."""
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        if len(lines) < 2:
            return None

        # Try splitting by multiple spaces or tabs
        rows = []
        for line in lines:
            cols = re.split(r"\s{2,}|\t", line)
            cols = [c.strip() for c in cols if c.strip()]
            if cols:
                rows.append(cols)

        # Validate: all rows should have similar column count
        if not rows:
            return None

        col_counts = [len(r) for r in rows]
        mode_count = max(set(col_counts), key=col_counts.count)

        if mode_count < 2:
            return None  # Not a table

        # Pad/trim rows to mode count
        normalized = []
        for row in rows:
            if len(row) >= mode_count - 1:  # Allow one missing column
                while len(row) < mode_count:
                    row.append("")
                normalized.append(row[:mode_count])

        return normalized if len(normalized) >= 2 else None

    @staticmethod
    def _table_data_to_markdown(data: List[List[str]]) -> str:
        """Convert table data (list of lists) to Markdown table format."""
        if not data:
            return ""

        # Clean data
        clean = []
        for row in data:
            clean_row = []
            for cell in row:
                cell_text = str(cell if cell is not None else "")
                cell_text = cell_text.replace("\n", " ").replace("|", "\\|").strip()
                clean_row.append(cell_text)
            clean.append(clean_row)

        # Ensure all rows have same number of columns
        max_cols = max(len(r) for r in clean)
        for row in clean:
            while len(row) < max_cols:
                row.append("")

        # Build Markdown
        lines = []

        # Header
        header = "| " + " | ".join(clean[0]) + " |"
        lines.append(header)

        # Separator
        separator = "| " + " | ".join(["---"] * max_cols) + " |"
        lines.append(separator)

        # Body rows
        for row in clean[1:]:
            line = "| " + " | ".join(row) + " |"
            lines.append(line)

        return "\n".join(lines)

    def get_table_bboxes(self, page) -> List[Tuple]:
        """Get bounding boxes of all tables on a page (for text exclusion)."""
        tables = self.extract_tables_from_page(page)
        return [t["bbox"] for t in tables]
