"""
Unified document processing pipeline.

Routes any document format through the appropriate extraction path:
- Native PDF/PPTX/DOCX → SmartPipeline text extraction + ImageExtractorV2
- Scanned PDFs → pdf2image → ScannedDocHandler OCR + ImageExtractorV2
- Image files → ScannedDocHandler OCR + ImageExtractorV2
- TXT files → Direct read

Returns a ContentBundle with markdown, images, and metadata.
"""

import logging
import os
import time
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional, Callable

logger = logging.getLogger(__name__)


@dataclass
class ContentBundle:
    markdown: str
    images: list = field(default_factory=list)
    image_map: list = field(default_factory=list)
    processing_path: str = "native"
    timings: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)
    ocr_confidence: float = 0.0


class UnifiedContentProcessor:
    """Single entry point for processing all document types."""

    SUPPORTED_EXTS = {".pdf", ".pptx", ".docx", ".txt", ".md", ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff"}
    IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"}

    def __init__(self, use_polish: bool = False, gemini_api_key: Optional[str] = None,
                 gemini_model: Optional[str] = None):
        self.use_polish = use_polish
        self.gemini_api_key = gemini_api_key
        self.gemini_model = gemini_model
        self._smart_pipeline = None
        self._image_extractor = None
        self._scanned_handler = None
        self._image_mapper = None

    @property
    def smart_pipeline(self):
        if self._smart_pipeline is None:
            from app.processing.smart_pipeline import SmartPipeline
            self._smart_pipeline = SmartPipeline(
                use_polish=self.use_polish,
                gemini_api_key=self.gemini_api_key,
                gemini_model=self.gemini_model,
            )
        return self._smart_pipeline

    @property
    def image_extractor(self):
        if self._image_extractor is None:
            from app.processing.image_extractor_v2 import ImageExtractorV2
            self._image_extractor = ImageExtractorV2()
        return self._image_extractor

    @property
    def scanned_handler(self):
        if self._scanned_handler is None:
            from app.processing.scanned_doc_handler import ScannedDocHandler
            self._scanned_handler = ScannedDocHandler()
        return self._scanned_handler

    @property
    def image_mapper(self):
        if self._image_mapper is None:
            from app.processing.image_text_mapper import ImageTextMapper
            self._image_mapper = ImageTextMapper()
        return self._image_mapper

    def extract(self, file_path: str, resource_id: str = "",
                progress_callback: Optional[Callable] = None) -> ContentBundle:
        ext = Path(file_path).suffix.lower()
        timings = {}

        if ext not in self.SUPPORTED_EXTS:
            return ContentBundle(
                markdown=f"Error: Unsupported file format: {ext}",
                warnings=[f"Unsupported format: {ext}"],
            )

        if ext == ".txt" or ext == ".md":
            return self._process_text(file_path)

        if ext in self.IMAGE_EXTS:
            return self._process_image(file_path, resource_id, progress_callback)

        if ext == ".pdf":
            t0 = time.time()
            is_scanned, confidence = self.scanned_handler.is_scanned_pdf(file_path)
            timings["scanned_detection"] = time.time() - t0

            if is_scanned:
                return self._process_scanned_pdf(file_path, resource_id, progress_callback, timings)
            else:
                return self._process_native_pdf(file_path, resource_id, progress_callback, timings)

        elif ext == ".pptx":
            return self._process_pptx(file_path, resource_id, progress_callback)

        elif ext == ".docx":
            return self._process_docx(file_path, resource_id, progress_callback)

        return ContentBundle(
            markdown=f"Error: Unsupported format: {ext}",
            warnings=[f"Unsupported: {ext}"],
        )

    def _process_text(self, file_path: str) -> ContentBundle:
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                text = f.read()
            return ContentBundle(markdown=text, processing_path="text")
        except Exception as e:
            return ContentBundle(markdown=f"Error reading text file: {e}", warnings=[str(e)])

    def _process_image(self, file_path: str, resource_id: str,
                       progress_callback: Optional[Callable] = None) -> ContentBundle:
        if progress_callback:
            progress_callback(10, "Processing image...")

        ocr_text = self.scanned_handler.process_image_file(file_path, progress_callback=progress_callback)

        if progress_callback:
            progress_callback(70, "Extracting images...")

        images = self.image_extractor.extract(file_path, resource_id)

        if progress_callback:
            progress_callback(85, "Mapping images to text...")

        markdown = self.image_mapper.insert_images(ocr_text, images, source_format="image")

        return ContentBundle(
            markdown=markdown,
            images=images,
            processing_path="image_ocr",
        )

    def _process_scanned_pdf(self, file_path: str, resource_id: str,
                              progress_callback: Optional[Callable],
                              timings: dict) -> ContentBundle:
        if progress_callback:
            progress_callback(10, "Converting scanned PDF to images...")

        t0 = time.time()
        ocr_text = self.scanned_handler.process_scanned_pdf(file_path, progress_callback=progress_callback)
        timings["ocr_extraction"] = time.time() - t0

        if progress_callback:
            progress_callback(75, "Extracting images from scanned pages...")

        t0 = time.time()
        images = self.image_extractor.extract(file_path, resource_id)
        timings["image_extraction"] = time.time() - t0

        if progress_callback:
            progress_callback(90, "Mapping images to text...")

        markdown = self.image_mapper.insert_images(ocr_text, images, source_format="pdf")

        return ContentBundle(
            markdown=markdown,
            images=images,
            processing_path="scanned_ocr",
            timings=timings,
        )

    def _process_native_pdf(self, file_path: str, resource_id: str,
                             progress_callback: Optional[Callable],
                             timings: dict) -> ContentBundle:
        warnings = []

        if progress_callback:
            progress_callback(10, "Extracting text from PDF...")

        t0 = time.time()
        markdown = self.smart_pipeline.process(file_path, progress_callback=progress_callback)
        timings["text_extraction"] = time.time() - t0

        if not markdown or markdown.startswith("Error:"):
            logger.info("Native PDF extraction produced no text, trying scanned path...")
            return self._process_scanned_pdf(file_path, resource_id, progress_callback, timings)

        if progress_callback:
            progress_callback(70, "Extracting images...")

        t0 = time.time()
        images = self.image_extractor.extract(file_path, resource_id)
        timings["image_extraction"] = time.time() - t0

        if progress_callback:
            progress_callback(85, "Placing images in document...")

        t0 = time.time()
        markdown_with_images = self.image_mapper.insert_images(markdown, images, source_format="pdf")
        timings["image_mapping"] = time.time() - t0

        missing_refs = self._check_missing_diagram_refs(markdown)
        if missing_refs:
            warnings.append(f"Text references {len(missing_refs)} diagram(s) but no image was found nearby")

        return ContentBundle(
            markdown=markdown_with_images,
            images=images,
            processing_path="native",
            timings=timings,
            warnings=warnings,
        )

    def _process_pptx(self, file_path: str, resource_id: str,
                       progress_callback: Optional[Callable] = None) -> ContentBundle:
        warnings = []

        if progress_callback:
            progress_callback(10, "Extracting text from PPTX...")

        t0 = time.time()
        markdown = self.smart_pipeline.process(file_path, progress_callback=progress_callback)
        timings = {"text_extraction": time.time() - t0}

        if progress_callback:
            progress_callback(70, "Extracting images from slides...")

        t0 = time.time()
        images = self.image_extractor.extract(file_path, resource_id)
        timings["image_extraction"] = time.time() - t0

        if progress_callback:
            progress_callback(85, "Placing images in slides...")

        t0 = time.time()
        markdown_with_images = self.image_mapper.insert_images(markdown, images, source_format="pptx")
        timings["image_mapping"] = time.time() - t0

        return ContentBundle(
            markdown=markdown_with_images,
            images=images,
            processing_path="native",
            timings=timings,
            warnings=warnings,
        )

    def _process_docx(self, file_path: str, resource_id: str,
                       progress_callback: Optional[Callable] = None) -> ContentBundle:
        if progress_callback:
            progress_callback(10, "Extracting text from DOCX...")

        t0 = time.time()
        markdown = self.smart_pipeline.process(file_path, progress_callback=progress_callback)
        timings = {"text_extraction": time.time() - t0}

        if progress_callback:
            progress_callback(70, "Extracting images from document...")

        t0 = time.time()
        images = self.image_extractor.extract(file_path, resource_id)
        timings["image_extraction"] = time.time() - t0

        if progress_callback:
            progress_callback(85, "Placing images in document...")

        markdown_with_images = self.image_mapper.insert_images(markdown, images, source_format="docx")

        return ContentBundle(
            markdown=markdown_with_images,
            images=images,
            processing_path="native",
            timings=timings,
        )

    def _check_missing_diagram_refs(self, markdown: str) -> list[str]:
        import re
        from app.processing.image_text_mapper import DIAGRAM_REF_PATTERNS

        refs = []
        for pattern in DIAGRAM_REF_PATTERNS:
            for m in re.finditer(pattern, markdown, re.IGNORECASE):
                refs.append(m.group(0))
        return refs
