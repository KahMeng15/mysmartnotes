"""OCR and text extraction module"""
import os
import pytesseract
from pdf2image import convert_from_path
from pptx import Presentation
from PIL import Image
import logging

logger = logging.getLogger(__name__)


class OCRProcessor:
    """Handle text extraction from various file types"""
    
    @staticmethod
    def extract_from_pdf(file_path: str) -> str:
        """Extract text from PDF using OCR"""
        try:
            logger.info(f"Extracting text from PDF: {file_path}")
            images = convert_from_path(file_path)
            text = ""
            
            for page_num, image in enumerate(images):
                logger.debug(f"Processing PDF page {page_num + 1}")
                # Convert image to text using Tesseract
                page_text = pytesseract.image_to_string(image)
                text += f"\n--- Page {page_num + 1} ---\n{page_text}"
            
            return text.strip()
        except Exception as e:
            logger.error(f"Error extracting text from PDF: {e}")
            raise
    
    @staticmethod
    def extract_from_pptx(file_path: str) -> str:
        """Extract text from PowerPoint presentation"""
        try:
            logger.info(f"Extracting text from PPTX: {file_path}")
            prs = Presentation(file_path)
            text = ""
            
            for slide_num, slide in enumerate(prs.slides):
                text += f"\n--- Slide {slide_num + 1} ---\n"
                for shape in slide.shapes:
                    if hasattr(shape, "text"):
                        text += shape.text + "\n"
            
            return text.strip()
        except Exception as e:
            logger.error(f"Error extracting text from PPTX: {e}")
            raise
    
    @staticmethod
    def extract_from_image(file_path: str) -> str:
        """Extract text from image using OCR"""
        try:
            logger.info(f"Extracting text from image: {file_path}")
            image = Image.open(file_path)
            text = pytesseract.image_to_string(image)
            return text.strip()
        except Exception as e:
            logger.error(f"Error extracting text from image: {e}")
            raise
    
    @staticmethod
    def extract_text(file_path: str, file_type: str) -> str:
        """
        Extract text based on file type
        
        Args:
            file_path: Path to the file
            file_type: MIME type or file extension
            
        Returns:
            Extracted text
        """
        if "pdf" in file_type.lower():
            return OCRProcessor.extract_from_pdf(file_path)
        elif "pptx" in file_type.lower() or "presentation" in file_type.lower():
            return OCRProcessor.extract_from_pptx(file_path)
        elif "image" in file_type.lower() or file_type.lower().endswith((".png", ".jpg", ".jpeg")):
            return OCRProcessor.extract_from_image(file_path)
        else:
            raise ValueError(f"Unsupported file type: {file_type}")
    
    @staticmethod
    def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list:
        """
        Split text into chunks for embedding
        
        Args:
            text: Text to chunk
            chunk_size: Size of each chunk (words)
            overlap: Number of overlapping words between chunks
            
        Returns:
            List of text chunks
        """
        words = text.split()
        chunks = []
        
        for i in range(0, len(words), chunk_size - overlap):
            chunk = " ".join(words[i:i + chunk_size])
            if chunk.strip():
                chunks.append(chunk)
        
        return chunks
