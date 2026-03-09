"""
DOCX document generator for creating styled Word documents from structured content.
Supports headings, lists, images, and professional styling.
"""

import os
import logging
from typing import List, Optional
from pathlib import Path
from datetime import datetime

from docx import Document
from docx.shared import Pt, Inches, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.section import WD_ORIENT
import re

from app.processing.text_processor import ContentSegment, ContentType
from app.processing.image_extractor import ExtractedImage

logger = logging.getLogger(__name__)


class DocxGenerator:
    """Generates styled DOCX from structured content"""

    def __init__(
        self,
        lecture_id: int,
        lecture_title: str,
        base_output_dir: str = "generated",
    ):
        self.lecture_id = lecture_id
        self.lecture_title = lecture_title
        self.base_output_dir = base_output_dir
        self.output_dir = os.path.join(base_output_dir, str(lecture_id))

        # Create output directory
        Path(self.output_dir).mkdir(parents=True, exist_ok=True)

        self.output_docx = os.path.join(self.output_dir, "OUTPUT.docx")

    def generate_docx(
        self,
        content_segments: List[ContentSegment],
        extracted_images: Optional[List[ExtractedImage]] = None,
        include_toc: bool = True,
        include_cover: bool = True,
        template_config: Optional[dict] = None,
        progress_callback=None,
    ) -> str:
        """
        Generate styled DOCX from content segments.
        Returns path to generated DOCX.
        """
        try:
            extracted_images = extracted_images or []
            self._template_config = template_config
            doc = Document()

            if progress_callback:
                progress_callback("Preparing document", 10)

            # Configure default font and styles (applying template if provided)
            self._setup_styles(doc)

            # Cover page
            if include_cover:
                if progress_callback:
                    progress_callback("Creating cover page", 20)
                self._create_cover_page(doc)

            # Table of contents placeholder
            if include_toc:
                if progress_callback:
                    progress_callback("Building table of contents", 35)
                self._create_toc_placeholder(doc, content_segments)

            # Margins setup from template
            if template_config and "page" in template_config:
                page_cfg = template_config["page"]
                margins = page_cfg.get("margins", {})
                if margins:
                    for section in doc.sections:
                        if "top" in margins: section.top_margin = Cm(margins["top"] / 10.0)
                        if "bottom" in margins: section.bottom_margin = Cm(margins["bottom"] / 10.0)
                        if "left" in margins: section.left_margin = Cm(margins["left"] / 10.0)
                        if "right" in margins: section.right_margin = Cm(margins["right"] / 10.0)
                        
                orientation = page_cfg.get("orientation", "portrait").lower()
                if orientation == "landscape":
                    for section in doc.sections:
                        section.orientation = WD_ORIENT.LANDSCAPE
                        section.page_width, section.page_height = section.page_height, section.page_width

            # Main content
            if progress_callback:
                progress_callback("Rendering content", 50)
            self._create_content(doc, content_segments, extracted_images)

            # Footer with branding
            if progress_callback:
                progress_callback("Adding footer", 80)
            self._create_footer(doc)

            # Save
            if progress_callback:
                progress_callback("Saving document", 90)
            doc.save(self.output_docx)
            
            if progress_callback:
                progress_callback("Complete", 100)
            
            logger.info(f"Generated DOCX: {self.output_docx}")
            return self.output_docx

        except Exception as e:
            logger.error(f"Error generating DOCX: {e}", exc_info=True)
            raise

    def _setup_styles(self, doc: Document):
        """Configure default document styles, applying template if available"""
        tc = getattr(self, '_template_config', None) or {}
        el_cfg = tc.get("elements", {})
        spacing_cfg = tc.get("spacing", {})
        
        # Helper to parse hex color
        def hex_to_rgb(hex_str):
            hex_str = hex_str.lstrip('#')
            return tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))
        
        # Normal style
        p_cfg = el_cfg.get("paragraph", {})
        style = doc.styles["Normal"]
        font = style.font
        font.name = tc.get("font_family", "Instrument Sans")
        font.size = Pt(p_cfg.get("font_size", 11))
        p_color = hex_to_rgb(p_cfg.get("text_color", "#000000"))
        font.color.rgb = RGBColor(*p_color)

        pf = style.paragraph_format
        pf.space_after = Pt(spacing_cfg.get("paragraph_spacing", 8))
        pf.line_spacing = spacing_cfg.get("line_spacing", 1.15)

        # Heading styles from template or defaults
        heading_defaults = {
            "Heading 1": {"key": "h1", "size": 28, "color": "#1A1A2E", "bold": True, "space_before": 18, "space_after": 12},
            "Heading 2": {"key": "h2", "size": 24, "color": "#2C3E50", "bold": True, "space_before": 14, "space_after": 10},
            "Heading 3": {"key": "h3", "size": 20, "color": "#34495E", "bold": True, "space_before": 12, "space_after": 8},
            "Heading 4": {"key": "h4", "size": 16, "color": "#333333", "bold": True, "space_before": 10, "space_after": 6},
        }

        # Setup Alignment mapping helper function
        def _get_docx_alignment(align_str):
            if align_str == 'center': return WD_ALIGN_PARAGRAPH.CENTER
            if align_str == 'right': return WD_ALIGN_PARAGRAPH.RIGHT
            if align_str == 'justify': return WD_ALIGN_PARAGRAPH.JUSTIFY
            return WD_ALIGN_PARAGRAPH.LEFT
            
        p_align = _get_docx_alignment(p_cfg.get("alignment", "left"))
        try:
            doc.styles["Normal"].paragraph_format.alignment = p_align
        except:
            pass

        for style_name, defaults in heading_defaults.items():
            try:
                h_style = doc.styles[style_name]
                h_el = el_cfg.get(defaults["key"], {})
                h_style.font.name = tc.get("font_family", "Instrument Sans")
                h_style.font.size = Pt(h_el.get("font_size", defaults["size"]))
                h_color = hex_to_rgb(h_el.get("text_color", defaults["color"]))
                h_style.font.color.rgb = RGBColor(*h_color)
                h_style.font.bold = h_el.get("font_weight", "bold") == "bold"
                h_style.paragraph_format.space_before = Pt(defaults["space_before"])
                h_style.paragraph_format.space_after = Pt(defaults["space_after"])
                h_style.paragraph_format.alignment = _get_docx_alignment(h_el.get("alignment", "left"))
            except KeyError:
                pass

    def _create_cover_page(self, doc: Document):
        """Create a cover page"""
        # Add vertical spacing
        for _ in range(6):
            doc.add_paragraph("")

        # Title
        title_para = doc.add_paragraph()
        title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = title_para.add_run(self.lecture_title)
        run.font.size = Pt(36)
        run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)
        run.bold = True
        run.font.name = "Instrument Sans"

        # Subtitle
        subtitle_para = doc.add_paragraph()
        subtitle_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = subtitle_para.add_run("Extracted and Processed Content")
        run.font.size = Pt(14)
        run.font.color.rgb = RGBColor(0x7F, 0x8C, 0x8D)
        run.font.name = "Instrument Sans"

        # Spacer
        doc.add_paragraph("")

        # Date
        date_para = doc.add_paragraph()
        date_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = date_para.add_run(f"Generated: {datetime.now().strftime('%B %d, %Y')}")
        run.font.size = Pt(10)
        run.font.color.rgb = RGBColor(0x95, 0xA5, 0xA6)
        run.font.name = "Instrument Sans"

        # Page break after cover
        doc.add_page_break()

    def _create_toc_placeholder(self, doc: Document, content_segments: List[ContentSegment]):
        """Create a table of contents section"""
        toc_heading = doc.add_paragraph()
        run = toc_heading.add_run("Table of Contents")
        run.font.size = Pt(16)
        run.bold = True
        run.font.color.rgb = RGBColor(0x1A, 0x1A, 0x1A)
        run.font.name = "Instrument Sans"

        # List headings from content
        for segment in content_segments:
            if segment.content_type in [ContentType.H1, ContentType.H2]:
                indent = "" if segment.content_type == ContentType.H1 else "    "
                content_text = segment.content[:60]
                if len(segment.content) > 60:
                    content_text += "..."
                entry = doc.add_paragraph(f"{indent}• {content_text}")
                entry.paragraph_format.space_after = Pt(4)
                for run in entry.runs:
                    run.font.size = Pt(11)
                    run.font.color.rgb = RGBColor(0x2C, 0x3E, 0x50)
                    run.font.name = "Instrument Sans"
                if segment.content_type == ContentType.H2:
                    entry.paragraph_format.left_indent = Pt(20)

        doc.add_page_break()

    def _create_content(
        self,
        doc: Document,
        content_segments: List[ContentSegment],
        extracted_images: List[ExtractedImage],
    ):
        """Create main content"""
        # Image lookup by page
        images_by_page = {}
        for img in extracted_images:
            if img.page_number not in images_by_page:
                images_by_page[img.page_number] = []
            images_by_page[img.page_number].append(img)

        for segment in content_segments:
            if segment.content_type == ContentType.H1:
                doc.add_heading(segment.content, level=1)
            elif segment.content_type == ContentType.H2:
                doc.add_heading(segment.content, level=2)
            elif segment.content_type == ContentType.H3:
                doc.add_heading(segment.content, level=3)
            elif segment.content_type == ContentType.LIST:
                # Handle bullet points
                content = segment.content
                content = re.sub(r'^\s*[-*+•]\s+', '', content)
                para = doc.add_paragraph(content, style="List Bullet")
                for run in para.runs:
                    run.font.name = tc.get("font_family", "Instrument Sans")
                    run.font.size = Pt(11)
            elif segment.content_type == ContentType.CODE:
                para = doc.add_paragraph()
                run = para.add_run(segment.content)
                run.font.name = "Courier New"
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(0x2C, 0x3E, 0x50)
                para.paragraph_format.left_indent = Pt(15)
            else:
                # Body text
                para = doc.add_paragraph(segment.content)
                for run in para.runs:
                    run.font.name = tc.get("font_family", "Instrument Sans")
                    run.font.size = Pt(11)
                    run.font.color.rgb = RGBColor(0x2C, 0x3E, 0x50)

            # Add images for this page
            if segment.page_number in images_by_page:
                for img in images_by_page[segment.page_number]:
                    self._add_image(doc, img)
                # Remove so images aren't duplicated
                del images_by_page[segment.page_number]

    def _add_image(self, doc: Document, image_obj: ExtractedImage):
        """Add image to document"""
        try:
            if not image_obj.file_path or not os.path.exists(image_obj.file_path):
                logger.warning(f"Image file not found: {image_obj.file_path}")
                return

            # Caption before image
            if image_obj.caption:
                caption_para = doc.add_paragraph()
                caption_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
                run = caption_para.add_run(image_obj.caption)
                run.font.size = Pt(9)
                run.font.color.rgb = RGBColor(0x7F, 0x8C, 0x8D)
                run.italic = True

            # Add image (max 5 inches wide)
            para = doc.add_paragraph()
            para.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = para.add_run()
            run.add_picture(image_obj.file_path, width=Inches(5))

        except Exception as e:
            logger.error(f"Error adding image {image_obj.filename}: {e}")

    def _create_footer(self, doc: Document):
        """Add branded footer to all sections"""
        generated_date = datetime.now().strftime("%B %d, %Y %I:%M %p")
        footer_text = f"Generated by mysmartnotes.vercel.app | Create notes and study smart! | {generated_date}"

        for section in doc.sections:
            footer = section.footer
            footer.is_linked_to_previous = False
            footer_para = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
            footer_para.text = ""
            run = footer_para.add_run(footer_text)
            run.font.size = Pt(7)
            run.font.color.rgb = RGBColor(0x95, 0xA5, 0xA6)
            run.font.name = "Instrument Sans"
            footer_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
