"""
Document generator for creating styled PDF outputs from structured content.
Supports headers, embedded images, markdown formatting, and professional styling.
"""

import os
import logging
from typing import List, Dict, Any, Optional
from pathlib import Path
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Image as RLImage,
    PageBreak, Table, TableStyle, KeepTogether, PageTemplate,
    Frame, Flowable
)
from reportlab.pdfgen import canvas
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from app.processing.text_processor import ContentSegment, ContentType
from app.processing.image_extractor import ExtractedImage

logger = logging.getLogger(__name__)


class HeaderFooter:
    """Handles headers and footers for PDF pages"""

    def __init__(self, lecture_title: str, page_size=letter):
        self.lecture_title = lecture_title
        self.page_size = page_size
        self.page_number = 0

    def draw_header_footer(self, canvas_obj, doc):
        """Draw header and footer on each page"""
        canvas_obj.saveState()
        
        page_width = self.page_size[0]
        page_height = self.page_size[1]
        
        # Header
        canvas_obj.setFont("Helvetica-Bold", 10)
        canvas_obj.drawString(0.5 * inch, page_height - 0.4 * inch, self.lecture_title)
        
        # Footer
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.drawRightString(page_width - 0.5 * inch, 0.3 * inch, f"Page {self.page_number}")
        
        canvas_obj.restoreState()


class StyleSheet:
    """Custom stylesheet for document"""

    @staticmethod
    def get_styles() -> Dict[str, ParagraphStyle]:
        """Get custom styles for document"""
        styles = getSampleStyleSheet()
        
        custom_styles = {
            "H1": ParagraphStyle(
                name="H1_custom",
                parent=styles["Heading1"],
                fontSize=18,
                textColor=colors.HexColor("#1a1a1a"),
                spaceAfter=12,
                spaceBefore=12,
                fontName="Helvetica-Bold",
                borderColor=colors.HexColor("#3498db"),
                borderWidth=2,
                borderPadding=8,
                borderRadius=4,
            ),
            "H2": ParagraphStyle(
                name="H2_custom",
                parent=styles["Heading2"],
                fontSize=14,
                textColor=colors.HexColor("#2c3e50"),
                spaceAfter=10,
                spaceBefore=10,
                fontName="Helvetica-Bold",
            ),
            "H3": ParagraphStyle(
                name="H3_custom",
                parent=styles["Heading3"],
                fontSize=12,
                textColor=colors.HexColor("#34495e"),
                spaceAfter=8,
                spaceBefore=8,
                fontName="Helvetica-Bold",
            ),
            "H4": ParagraphStyle(
                name="H4_custom",
                parent=styles["Heading3"],
                fontSize=11,
                textColor=colors.HexColor("#476978"),
                spaceAfter=6,
                spaceBefore=6,
                fontName="Helvetica-Bold",
            ),
            "H5": ParagraphStyle(
                name="H5_custom",
                parent=styles["Heading3"],
                fontSize=10,
                textColor=colors.HexColor("#566b7f"),
                spaceAfter=4,
                spaceBefore=4,
                fontName="Helvetica-Bold",
            ),
            "Body": ParagraphStyle(
                name="Body_custom",
                parent=styles["BodyText"],
                fontSize=11,
                leading=14,
                alignment=TA_JUSTIFY,
                textColor=colors.HexColor("#2c3e50"),
                spaceAfter=6,
            ),
            "List": ParagraphStyle(
                name="List_custom",
                parent=styles["BodyText"],
                fontSize=11,
                leading=14,
                leftIndent=20,
                textColor=colors.HexColor("#2c3e50"),
                spaceAfter=4,
            ),
            "OrderedList": ParagraphStyle(
                name="OrderedList_custom",
                parent=styles["BodyText"],
                fontSize=11,
                leading=14,
                leftIndent=20,
                textColor=colors.HexColor("#2c3e50"),
                spaceAfter=4,
            ),
            "TableRow": ParagraphStyle(
                name="TableRow_custom",
                parent=styles["BodyText"],
                fontSize=10,
                textColor=colors.HexColor("#2c3e50"),
                spaceAfter=4,
                fontName="Courier",
            ),
            "Caption": ParagraphStyle(
                name="Caption_custom",
                parent=styles["Normal"],
                fontSize=9,
                textColor=colors.HexColor("#7f8c8d"),
                alignment=TA_CENTER,
                spaceAfter=6,
            ),
            "Code": ParagraphStyle(
                name="Code_custom",
                parent=styles["BodyText"],
                fontSize=9,
                fontName="Courier",
                textColor=colors.HexColor("#2c3e50"),
                backColor=colors.HexColor("#ecf0f1"),
                leftIndent=15,
                spaceAfter=6,
                borderColor=colors.HexColor("#bdc3c7"),
                borderWidth=1,
                borderPadding=8,
            ),
        }
        
        return custom_styles


class DocumentGenerator:
    """Generates styled PDF from structured content"""

    def __init__(
        self,
        lecture_id: int,
        lecture_title: str,
        base_output_dir: str = "generated",
        page_size=letter,
    ):
        self.lecture_id = lecture_id
        self.lecture_title = lecture_title
        self.base_output_dir = base_output_dir
        self.output_dir = os.path.join(base_output_dir, str(lecture_id))
        self.page_size = page_size
        self._template_config = None
        
        # Create output directory
        Path(self.output_dir).mkdir(parents=True, exist_ok=True)
        
        self.output_pdf = os.path.join(self.output_dir, "OUTPUT.pdf")
        self.styles = StyleSheet.get_styles()

    def generate_pdf(
        self,
        content_segments: List[ContentSegment],
        extracted_images: Optional[List[ExtractedImage]] = None,
        include_toc: bool = True,
        include_cover: bool = True,
        template_config: Optional[dict] = None,
        progress_callback=None,
    ) -> str:
        """
        Generate styled PDF from content segments
        Returns path to generated PDF
        """
        try:
            extracted_images = extracted_images or []
            self._template_config = template_config or {}
            
            if progress_callback:
                progress_callback("Preparing document", 10)
            
            # Apply template page configuration
            from reportlab.lib.pagesizes import A4, letter, A3, legal
            page_size = letter
            orientation = "portrait"
            page_size_name = "Letter"
            
            if template_config and "page" in template_config:
                page_cfg = template_config["page"]
                
                # Page size
                size_name = page_cfg.get("size", "A4").upper()
                if size_name == "A4":
                    page_size = A4
                elif size_name == "LETTER":
                    page_size = letter
                elif size_name == "LEGAL":
                    page_size = legal
                elif size_name == "A3":
                    page_size = A3
                
                # Orientation - swap dimensions for landscape
                orientation = page_cfg.get("orientation", "portrait").lower()
                if orientation == "landscape":
                    page_size = (page_size[1], page_size[0])  # Swap width/height
            
            self.page_size = page_size
            
            # Get margins (in mm, convert to inches)
            margins_mm = {"top": 25, "bottom": 25, "left": 19, "right": 19}
            if template_config and "page" in template_config:
                page_cfg = template_config["page"]
                if "margins" in page_cfg:
                    margins_mm.update(page_cfg["margins"])
            
            # Convert mm to inches (1 inch = 25.4 mm)
            margins_in = {k: v / 25.4 for k, v in margins_mm.items()}
            
            # Create document
            doc = SimpleDocTemplate(
                self.output_pdf,
                pagesize=self.page_size,
                rightMargin=margins_in["right"] * inch,
                leftMargin=margins_in["left"] * inch,
                topMargin=margins_in["top"] * inch,
                bottomMargin=margins_in["bottom"] * inch,
            )
            
            # Build story
            story = []
            
            # Add title page
            if include_cover:
                if progress_callback:
                    progress_callback("Creating cover page", 20)
                story.extend(self._create_title_page())
                story.append(PageBreak())
            
            # Add table of contents
            if include_toc:
                if progress_callback:
                    progress_callback("Building table of contents", 35)
                story.extend(self._create_table_of_contents(content_segments))
                story.append(PageBreak())
            
            # Add content
            if progress_callback:
                progress_callback("Rendering content", 50)
            story.extend(self._create_content(content_segments, extracted_images))
            
            # Build PDF
            if progress_callback:
                progress_callback("Building PDF", 80)
            doc.build(story, onFirstPage=self._on_page, onLaterPages=self._on_page)
            
            if progress_callback:
                progress_callback("Complete", 100)
            
            logger.info(f"Generated PDF: {self.output_pdf}")
            return self.output_pdf

        except Exception as e:
            logger.error(f"Error generating PDF: {e}")
            raise

    def _create_title_page(self) -> List[Flowable]:
        """Create title page"""
        story = []
        
        story.append(Spacer(1, 1.5 * inch))
        
        # Title
        title_style = ParagraphStyle(
            "Title",
            fontSize=24,
            textColor=colors.HexColor("#1a1a1a"),
            alignment=TA_CENTER,
            fontName="Helvetica-Bold",
            spaceAfter=12,
        )
        story.append(Paragraph(self.lecture_title, title_style))
        
        story.append(Spacer(1, 0.3 * inch))
        
        # Subtitle
        subtitle_style = ParagraphStyle(
            "Subtitle",
            fontSize=14,
            textColor=colors.HexColor("#7f8c8d"),
            alignment=TA_CENTER,
            spaceAfter=12,
        )
        story.append(Paragraph("Extracted and Processed Content", subtitle_style))
        
        story.append(Spacer(1, 0.5 * inch))
        
        # Metadata
        meta_style = ParagraphStyle(
            "Meta",
            fontSize=10,
            textColor=colors.HexColor("#95a5a6"),
            alignment=TA_CENTER,
            spaceAfter=6,
        )
        story.append(Paragraph(f"Generated: {datetime.now().strftime('%B %d, %Y')}", meta_style))
        story.append(Paragraph(f"Lecture ID: {self.lecture_id}", meta_style))
        
        return story

    def _create_table_of_contents(self, content_segments: List[ContentSegment]) -> List[Flowable]:
        """Create table of contents"""
        story = []
        
        # TOC Title
        toc_title = ParagraphStyle(
            "TOC_Title",
            fontSize=16,
            textColor=colors.HexColor("#1a1a1a"),
            fontName="Helvetica-Bold",
            spaceAfter=12,
        )
        story.append(Paragraph("Table of Contents", toc_title))
        
        story.append(Spacer(1, 0.2 * inch))
        
        # TOC entries
        toc_entry_style = ParagraphStyle(
            "TOC_Entry",
            fontSize=11,
            leftIndent=20,
            spaceAfter=6,
            textColor=colors.HexColor("#2c3e50"),
        )
        
        for segment in content_segments:
            if segment.content_type in [ContentType.H1, ContentType.H2]:
                indent = 0 if segment.content_type == ContentType.H1 else 20
                entry_style = ParagraphStyle(
                    f"TOC_{segment.content_type.value}",
                    parent=toc_entry_style,
                    leftIndent=indent,
                )
                story.append(Paragraph(f"• {segment.content[:50]}...", entry_style))
        
        return story

    def _create_content(
        self,
        content_segments: List[ContentSegment],
        extracted_images: List[ExtractedImage],
    ) -> List[Flowable]:
        """Create main content"""
        story = []
        
        # Create image lookup by page
        images_by_page = {}
        for img in extracted_images:
            if img.page_number not in images_by_page:
                images_by_page[img.page_number] = []
            images_by_page[img.page_number].append(img)
        
        # Process segments, collecting consecutive table rows
        i = 0
        while i < len(content_segments):
            segment = content_segments[i]
            
            # Check if this is a table row - collect all consecutive table rows
            if segment.content_type == ContentType.TABLE_ROW:
                table_segments = []
                while i < len(content_segments) and content_segments[i].content_type == ContentType.TABLE_ROW:
                    table_segments.append(content_segments[i])
                    i += 1
                
                # Render the table
                table_flowable = self._render_table(table_segments)
                if table_flowable:
                    story.append(table_flowable)
                    story.append(Spacer(1, 0.2 * inch))
                continue
            
            # Regular paragraph rendering with template styles
            style_name = self._get_style_name_for_segment(segment)
            style = self.styles.get(style_name, self.styles["Body"])
            
            # Apply template element style if available
            if self._template_config and "elements" in self._template_config:
                style = self._apply_template_style(style, style_name)
            
            story.append(Paragraph(segment.content, style))
            story.append(Spacer(1, 0.08 * inch))
            
            # Add images for this page
            if segment.page_number in images_by_page:
                for img in images_by_page[segment.page_number]:
                    story.extend(self._add_image(img))
            
            i += 1
        
        return story
    
    def _get_style_name_for_segment(self, segment: ContentSegment) -> str:
        """Map content type to style name"""
        type_to_style = {
            ContentType.H1: "H1",
            ContentType.H2: "H2",
            ContentType.H3: "H3",
            ContentType.H4: "H4",
            ContentType.H5: "H5",
            ContentType.LIST: "List",
            ContentType.ORDERED_LIST: "OrderedList",
            ContentType.CODE: "Code",
            ContentType.BODY: "Body",
        }
        return type_to_style.get(segment.content_type, "Body")
    
    def _apply_template_style(self, base_style: ParagraphStyle, style_name: str) -> ParagraphStyle:
        """Apply template element styles to paragraph style"""
        elements_config = self._template_config.get("elements", {})
        
        # Map style names to element keys
        style_map = {
            "H1": "h1", "H2": "h2", "H3": "h3", "H4": "h4", "H5": "h5",
            "Body": "paragraph", "List": "list", "OrderedList": "list", "Code": "code"
        }
        
        element_key = style_map.get(style_name)
        if not element_key or element_key not in elements_config:
            return base_style
        
        elem_config = elements_config[element_key]
        
        # Create modified style
        return ParagraphStyle(
            name=f"{base_style.name}_templated",
            parent=base_style,
            fontSize=elem_config.get("font_size", base_style.fontSize),
            textColor=colors.HexColor(elem_config.get("text_color", "#2C3E50")),
            fontName="Helvetica-Bold" if elem_config.get("font_weight") == "bold" else "Helvetica",
            alignment=self._get_alignment(elem_config.get("alignment", "left")),
        )
    
    def _get_alignment(self, alignment_str: str):
        """Convert alignment string to reportlab enum"""
        alignment_map = {
            "left": TA_LEFT,
            "center": TA_CENTER,
            "right": TA_CENTER,  # TA_RIGHT not available; use center
            "justify": TA_JUSTIFY,
        }
        return alignment_map.get(alignment_str, TA_LEFT)
    
    def _render_table(self, table_segments: List[ContentSegment]) -> Optional[Flowable]:
        """
        Render markdown table rows as a ReportLab Table
        Expects table segments with content like: | Header1 | Header2 |
        """
        if not table_segments:
            return None
        
        # Parse markdown table format
        rows = []
        for segment in table_segments:
            # Split by | and clean up
            cells = [cell.strip() for cell in segment.content.split("|")]
            # Filter out empty cells at start/end
            cells = [c for c in cells if c and not c.startswith("---")]
            if cells:
                rows.append(cells)
        
        if not rows:
            return None
        
        # Create table with better column width calculation
        try:
            # Account for margins and padding
            margins_in = 0.75  # Default document margins in inches
            available_width = self.page_size[0] - (2 * margins_in * inch)
            num_cols = len(rows[0]) if rows else 1
            col_width = available_width / num_cols
            
            table = Table(rows, colWidths=[col_width] * num_cols)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#593f8f")),
                ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
                ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 10),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                ('TOPPADDING', (0, 0), (-1, 0), 8),
                ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
                ('GRID', (0, 0), (-1, -1), 1, colors.black),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
            ]))
            return table
        except Exception as e:
            logger.warning(f"Failed to render table: {e}")
            return None

    def _add_image(self, image_obj: ExtractedImage) -> List[Flowable]:
        """Add image to story"""
        story = []
        
        try:
            if not os.path.exists(image_obj.file_path):
                logger.warning(f"Image file not found: {image_obj.file_path}")
                return story
            
            # Add caption if exists
            if image_obj.caption:
                caption_para = Paragraph(image_obj.caption, self.styles["Caption"])
                story.append(caption_para)
            
            # Add image
            img = RLImage(image_obj.file_path, width=5 * inch, height=3 * inch)
            story.append(img)
            
            # Add image metadata if it contains text
            if image_obj.text_content:
                meta_text = f"<i>Text in image: {image_obj.text_content[:100]}...</i>"
                story.append(Paragraph(meta_text, self.styles["Caption"]))
            
            story.append(Spacer(1, 0.2 * inch))
            
        except Exception as e:
            logger.error(f"Error adding image {image_obj.filename}: {e}")
        
        return story

    def _on_page(self, canvas_obj, doc):
        """Callback for page drawing"""
        canvas_obj.saveState()
        
        page_width = self.page_size[0]
        
        # Draw branded footer (left side)
        canvas_obj.setFont("Helvetica", 7)
        generated_date = datetime.now().strftime("%B %d, %Y %I:%M %p")
        footer_text = f"Generated by mysmartnotes.vercel.app | Create notes and study smart! | {generated_date}"
        canvas_obj.drawString(0.5 * inch, 0.35 * inch, footer_text)
        
        # Draw page number (right side)
        canvas_obj.setFont("Helvetica", 8)
        canvas_obj.drawRightString(
            page_width - 0.5 * inch,
            0.35 * inch,
            f"Page {doc.page}"
        )
        
        canvas_obj.restoreState()

    def get_output_info(self) -> Dict[str, Any]:
        """Get information about generated PDF"""
        try:
            if os.path.exists(self.output_pdf):
                file_size_mb = os.path.getsize(self.output_pdf) / (1024 * 1024)
                return {
                    "success": True,
                    "output_file": self.output_pdf,
                    "file_size_mb": round(file_size_mb, 2),
                    "generated_at": datetime.now().isoformat(),
                }
            else:
                return {
                    "success": False,
                    "error": "Output PDF not found",
                }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
            }
