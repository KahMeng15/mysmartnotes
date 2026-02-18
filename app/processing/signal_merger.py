"""
Signal Merger

Merges signals from multiple extraction methods (font-aware, AI layout, tables)
into a unified, clean Markdown document.
"""

import re
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class MergedBlock:
    """A unified content block with merged signals."""
    text: str
    block_type: str  # h1, h2, h3, h4, h5, body, list, ordered_list, table
    y_position: float
    page: int
    confidence: float = 1.0
    indent_level: int = 0
    has_bold_spans: bool = False
    has_italic_spans: bool = False
    markdown_overrides: Optional[str] = None  # Pre-formatted markdown (for tables)
    inline_formats: List[Dict] = field(default_factory=list)  # [{start, end, style}]


class SignalMerger:
    """
    Merges signals from font-aware extraction, AI layout detection,
    and table detection into a single unified document.
    """

    # Mapping from layout detector labels to block types
    LAYOUT_TO_TYPE = {
        "Title": "h1",
        "Section-header": "h2",
        "Text": "body",
        "List-item": "list",
        "Table": "table",
        "Caption": "caption",
        "Footnote": "footnote",
        "Page-footer": "skip",
        "Page-header": "skip",
        "Formula": "body",
        "Picture": "skip",
    }

    def merge(
        self,
        font_blocks: List[Dict[str, Any]],
        layout_detections: Optional[List[Dict[str, Any]]] = None,
        tables: Optional[List[Dict[str, Any]]] = None,
    ) -> List[MergedBlock]:
        """
        Merge all extraction signals into a unified list of blocks.

        Args:
            font_blocks: Results from FontAwareExtractor (list of page dicts)
            layout_detections: Results from LayoutDetector (list of detection lists per page)
            tables: Table extraction results per page

        Returns:
            Unified list of MergedBlocks ready for markdown formatting
        """
        all_blocks = []

        for page_data in font_blocks:
            page_num = page_data["page"]
            page_width = page_data["width"]
            page_height = page_data["height"]
            blocks = page_data["blocks"]

            # Get layout detections for this page
            page_layouts = None
            if layout_detections and page_num - 1 < len(layout_detections):
                page_layouts = layout_detections[page_num - 1]

            # Get tables for this page
            page_tables = None
            if tables and page_num - 1 < len(tables):
                page_tables = tables[page_num - 1]

            # Process font blocks
            for block in blocks:
                text = block.text.strip()
                if not text:
                    continue

                merged = MergedBlock(
                    text=text,
                    block_type=block.block_type,
                    y_position=block.top,
                    page=page_num,
                    indent_level=block.indent_level,
                    has_bold_spans=block.has_bold,
                    has_italic_spans=block.has_italic,
                )

                # Enhance with layout detection signal
                if page_layouts:
                    layout_type = self._match_layout(
                        block, page_layouts, page_width, page_height
                    )
                    if layout_type:
                        merged = self._resolve_conflict(merged, layout_type)

                all_blocks.append(merged)

            # Insert tables at their Y-positions
            if page_tables:
                for table in page_tables:
                    table_block = MergedBlock(
                        text="",
                        block_type="table",
                        y_position=table["y_position"],
                        page=page_num,
                        markdown_overrides=table["markdown"],
                    )
                    all_blocks.append(table_block)

        # Sort by page, then Y position
        all_blocks.sort(key=lambda b: (b.page, b.y_position))

        # Post-processing
        all_blocks = self._remove_duplicates(all_blocks)
        all_blocks = self._fix_heading_hierarchy(all_blocks)
        # Split inline bullets FIRST so multi-bullet blocks become individual list items,
        # then merge continuations so wrapped lines attach to their parent list item
        all_blocks = self._split_inline_bullets(all_blocks)
        all_blocks = self._merge_continuations(all_blocks)
        all_blocks = self._promote_orphan_body_in_lists(all_blocks)

        return all_blocks

    def _match_layout(
        self,
        block,
        detections: List[Dict],
        page_width: float,
        page_height: float,
    ) -> Optional[str]:
        """Match a font block to a layout detection by position overlap."""
        if not detections:
            return None

        block_center_y = (block.top + block.bottom) / 2
        block_center_x = (block.x0 + (block.x1 if hasattr(block, 'x1') else block.x0 + 100)) / 2

        best_match = None
        best_overlap = 0

        for det in detections:
            bbox = det["bbox"]
            # Layout bbox is in image coords, need to scale to PDF coords
            img_w = det.get("image_width", page_width)
            img_h = det.get("image_height", page_height)

            scale_x = page_width / img_w
            scale_y = page_height / img_h

            lx1 = bbox[0] * scale_x
            ly1 = bbox[1] * scale_y
            lx2 = bbox[2] * scale_x
            ly2 = bbox[3] * scale_y

            # Check if block center falls within detection bbox
            if lx1 <= block_center_x <= lx2 and ly1 <= block_center_y <= ly2:
                area = (lx2 - lx1) * (ly2 - ly1)
                conf = det.get("confidence", 0.5)
                score = conf / max(area, 1)  # Prefer smaller, more confident matches

                if score > best_overlap:
                    best_overlap = score
                    best_match = det

        if best_match:
            label = best_match["label"]
            return self.LAYOUT_TO_TYPE.get(label)

        return None

    def _resolve_conflict(self, merged: MergedBlock, layout_type: str) -> MergedBlock:
        """
        Resolve conflicts between font-based and layout-based classification.

        Font data is primary (most reliable), layout is confirmation/tiebreaker.
        """
        font_type = merged.block_type
        
        if layout_type == "skip":
            # Layout says this is a header/footer — trust it if font doesn't strongly disagree
            if font_type in ("body",):
                merged.block_type = "skip"
            return merged

        # If font says heading and layout agrees → high confidence
        if font_type.startswith("h") and layout_type.startswith("h"):
            merged.confidence = 0.95
            return merged

        # If font says body but layout says heading → check text length
        if font_type == "body" and layout_type.startswith("h"):
            if len(merged.text) < 100:
                # Short text detected as header by AI → promote
                merged.block_type = layout_type
                merged.confidence = 0.7
            return merged

        # If font says heading but layout says body → trust font for short text
        if font_type.startswith("h") and layout_type == "body":
            if len(merged.text) > 150:
                # Long text unlikely to be a heading
                merged.block_type = "body"
                merged.confidence = 0.8
            return merged

        # Layout says list → adopt if font is ambiguous
        if layout_type == "list" and font_type == "body":
            merged.block_type = "list"
            merged.confidence = 0.75
            return merged

        return merged

    def _remove_duplicates(self, blocks: List[MergedBlock]) -> List[MergedBlock]:
        """Remove duplicate content blocks (e.g., repeated slide titles)."""
        cleaned = []
        seen_headers = set()

        for block in blocks:
            if block.block_type == "skip":
                continue

            if block.block_type.startswith("h"):
                # Normalize for comparison
                norm = re.sub(r"\s*\(cont\.?(?:inued)?\).*$", "", block.text, flags=re.IGNORECASE)
                norm = norm.strip().lower()

                if norm in seen_headers:
                    logger.debug(f"Removing duplicate header: {block.text}")
                    continue
                seen_headers.add(norm)

            cleaned.append(block)

        return cleaned

    def _fix_heading_hierarchy(self, blocks: List[MergedBlock]) -> List[MergedBlock]:
        """
        Ensure heading levels are sequential (no jumping from h1 to h4).
        """
        last_level = 0

        for block in blocks:
            if block.block_type.startswith("h"):
                level = int(block.block_type[1])
                # Don't allow jumping more than 1 level
                if level > last_level + 1 and last_level > 0:
                    corrected = last_level + 1
                    block.block_type = f"h{corrected}"
                    level = corrected
                last_level = level

        return blocks

    def _split_inline_bullets(self, blocks: List[MergedBlock]) -> List[MergedBlock]:
        """
        Split blocks that contain multiple inline bullet characters (•) into
        separate list items. This handles cases where two-column PDF layouts
        merge terms like "internet• bit• web server•" into a single block.
        """
        BULLET_CHARS = "•‣◦⁃∙►▪▸➤➢"
        BULLET_PATTERN = re.compile(r'[' + re.escape(BULLET_CHARS) + r']')

        result = []

        for block in blocks:
            text = block.text.strip()

            # Count bullet characters in this block
            bullet_count = sum(1 for c in text if c in BULLET_CHARS)

            # If fewer than 2 bullets, keep as-is (with cleanup)
            if bullet_count < 2:
                if bullet_count == 1 and text:
                    if text[0] in BULLET_CHARS:
                        # Single bullet at start → mark as list
                        block.block_type = "list"
                    else:
                        # Single bullet NOT at start → trailing noise, strip it
                        block.text = BULLET_PATTERN.sub('', block.text).strip()
                result.append(block)
                continue

            # Multiple bullets found — split into items
            # Strategy: split on bullet characters, clean up, create list items
            # Handle both "• item1 • item2" and "item1• item2• item3•" patterns
            
            # Normalize: replace all bullet chars with a common delimiter
            normalized = text
            for bc in BULLET_CHARS:
                normalized = normalized.replace(bc, '\x00')  # Use null as delimiter

            parts = normalized.split('\x00')
            items = []
            for part in parts:
                cleaned = part.strip()
                # Skip empty or very short fragments (likely noise)
                if cleaned and len(cleaned) > 1:
                    items.append(cleaned)

            if not items:
                result.append(block)
                continue

            # Create a list item block for each extracted term
            for item_text in items:
                new_block = MergedBlock(
                    text=item_text,
                    block_type="list",
                    y_position=block.y_position,
                    page=block.page,
                    confidence=block.confidence,
                    indent_level=block.indent_level,
                )
                result.append(new_block)

        return result

    def _merge_continuations(self, blocks: List[MergedBlock]) -> List[MergedBlock]:
        """
        Merge sentence fragments that were split across lines/blocks.
        """
        if not blocks:
            return blocks

        # Bullet characters that indicate list content — don't merge these
        BULLET_CHARS = set("•‣◦⁃∙►▪▸➤➢")

        merged = [blocks[0]]

        for block in blocks[1:]:
            prev = merged[-1]

            # Skip merging tables or headings
            if block.block_type in ("table",) or prev.block_type in ("table",):
                merged.append(block)
                continue

            if block.block_type.startswith("h") or prev.block_type.startswith("h"):
                merged.append(block)
                continue

            # Never merge blocks that contain bullet characters — they should
            # remain separate so _split_inline_bullets can process them
            block_has_bullets = any(c in BULLET_CHARS for c in block.text)
            prev_has_bullets = any(c in BULLET_CHARS for c in prev.text)
            if block_has_bullets or prev_has_bullets:
                merged.append(block)
                continue

            # Body continuation: current starts with lowercase
            should_merge = False

            if (prev.block_type == "body" and block.block_type == "body"
                    and block.page == prev.page):
                text = block.text.strip()
                if text and text[0].islower():
                    should_merge = True
                # Previous ends with connector word
                prev_words = prev.text.strip().split()
                if prev_words:
                    last_word = prev_words[-1].lower().rstrip(".,;:")
                    if last_word in ("and", "or", "the", "of", "with", "to", "in", "a", "an", "for"):
                        should_merge = True

            # List item continuation
            if (prev.block_type in ("list", "ordered_list") and
                    block.block_type == "body" and block.page == prev.page):
                text = block.text.strip()
                if text and text[0].islower():
                    should_merge = True
                # Parenthetical continuation: "(SOHO) network" after "small office and home office"
                elif text and text[0] == '(':
                    should_merge = True
                # Previous list item ends with connector word — likely wrapped mid-phrase
                elif text:
                    prev_words = prev.text.strip().split()
                    if prev_words:
                        last_word = prev_words[-1].lower().rstrip(",")
                        if last_word in ("and", "or", "the", "of", "with", "to",
                                         "in", "a", "an", "for", "from"):
                            should_merge = True

            if should_merge:
                sep = " "
                if prev.text.endswith("-"):
                    sep = ""
                    prev.text = prev.text[:-1]
                prev.text += sep + block.text
            else:
                merged.append(block)

        return merged

    def _promote_orphan_body_in_lists(self, blocks: List[MergedBlock]) -> List[MergedBlock]:
        """
        Promote body blocks to list items when sandwiched between list items.
        This handles cases where a bullet was stripped but the content is
        clearly part of a surrounding list (e.g. multi-line terms).
        """
        if len(blocks) < 3:
            return blocks

        for i in range(1, len(blocks) - 1):
            block = blocks[i]
            prev = blocks[i - 1]
            nxt = blocks[i + 1]
            if (block.block_type == "body"
                    and prev.block_type in ("list", "ordered_list")
                    and nxt.block_type in ("list", "ordered_list")
                    and block.page == prev.page
                    and len(block.text) < 100):
                block.block_type = prev.block_type

        return blocks


def blocks_to_markdown(blocks: List[MergedBlock]) -> str:
    """
    Convert merged blocks to clean Markdown text.
    """
    lines = []
    prev_type = None
    in_list = False
    list_type = None

    for block in blocks:
        if block.block_type == "skip":
            continue

        text = block.text.strip()
        if not text and not block.markdown_overrides:
            continue

        # Close list if switching to non-list
        if in_list and block.block_type not in ("list", "ordered_list"):
            in_list = False
            list_type = None
            lines.append("")  # Blank line after list

        # Headings
        if block.block_type.startswith("h"):
            level = int(block.block_type[1])
            prefix = "#" * level

            # Add blank line before heading (if not first)
            if lines:
                if lines[-1] != "":
                    lines.append("")

            # Clean heading text
            heading_text = _clean_heading(text)
            lines.append(f"{prefix} {heading_text}")
            lines.append("")
            prev_type = block.block_type
            continue

        # Tables
        if block.block_type == "table":
            if block.markdown_overrides:
                if lines and lines[-1] != "":
                    lines.append("")
                lines.append(block.markdown_overrides)
                lines.append("")
            prev_type = "table"
            continue

        # List items
        if block.block_type in ("list", "ordered_list"):
            # Clean bullet characters from text
            clean_text = _clean_list_item(text)

            if block.block_type == "list":
                prefix = "- "
            else:
                prefix = "1. "  # Markdown auto-numbers

            if not in_list:
                in_list = True
                list_type = block.block_type

            indent = "  " * block.indent_level
            lines.append(f"{indent}{prefix}{clean_text}")
            prev_type = block.block_type
            continue

        # Body text
        if block.block_type == "body":
            if lines and prev_type and prev_type.startswith("h"):
                pass  # Already have blank line after heading
            elif lines and lines[-1] != "":
                lines.append("")

            # Apply inline formatting
            formatted = _apply_inline_formatting(text, block)
            lines.append(formatted)
            prev_type = "body"
            continue

        # Caption
        if block.block_type == "caption":
            lines.append(f"*{text}*")
            lines.append("")
            prev_type = "caption"
            continue

    # Clean up: remove trailing blank lines and fix double blanks
    result = "\n".join(lines)
    result = re.sub(r"\n{3,}", "\n\n", result)
    result = result.strip() + "\n"

    return result


def _clean_heading(text: str) -> str:
    """Clean heading text."""
    # Remove trailing (Cont.) etc.
    text = re.sub(r"\s*\(cont\.?(?:inued)?\).*$", "", text, flags=re.IGNORECASE)
    # Remove leading/trailing whitespace
    text = text.strip()
    return text


def _clean_list_item(text: str) -> str:
    """Clean list item text — remove bullet characters and numbering."""
    # Remove leading bullet characters
    text = re.sub(r"^[•‣◦⁃∙‐‑–—\-*►▪▸➤➢]\s*", "", text)
    # Remove leading numbering if present
    text = re.sub(r"^\d+[\.\)]\s*", "", text)
    return text.strip()


def _apply_inline_formatting(text: str, block: MergedBlock) -> str:
    """Apply bold/italic inline formatting to text."""
    # For now, we detect "Term - Definition" patterns and bold the term
    match = re.match(r"^([A-Z][a-zA-Z0-9\s/()]+?)\s*[-–—:]\s+(.+)$", text)
    if match:
        term = match.group(1).strip()
        defn = match.group(2).strip()
        if len(term) < 60:
            return f"**{term}:** {defn}"

    return text
