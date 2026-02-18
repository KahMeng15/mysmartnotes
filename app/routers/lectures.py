"""Lectures management endpoints"""
import os
import shutil
import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import List
import uuid

from app.models.db import User, Lecture, Subject
from app.schemas.schemas import LectureResponse
from app.utils.auth import get_current_user
from app.utils.db import get_db
from app.processing.ocr import OCRProcessor
from app.processing.document_generator import DocumentGenerator
from app.processing.image_extractor import ImageExtractor
from app.processing.text_processor import ContentType
from app.processing.smart_pipeline import SmartPipeline
from app.routers.processing import _markdown_to_segments

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lectures", tags=["lectures"])

# Upload directory - use local temp directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
GENERATED_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "generated")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(GENERATED_DIR, exist_ok=True)


@router.get("", response_model=List[LectureResponse])
async def get_lectures(
    subject_id: int = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all lectures for the current user, optionally filtered by subject"""
    query = db.query(Lecture).filter(Lecture.user_id == current_user.id)
    
    if subject_id:
        query = query.filter(Lecture.subject_id == subject_id)
    
    lectures = query.order_by(Lecture.created_at.desc()).all()
    return lectures


@router.post("/upload", response_model=LectureResponse, status_code=status.HTTP_201_CREATED)
async def upload_lecture(
    subject_id: int = Form(...),
    file: UploadFile = File(...),
    title: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a lecture file and create lecture record"""
    
    # Handle auto-title
    auto_detect_title = False
    if not title:
        title = os.path.splitext(file.filename)[0]
        auto_detect_title = True

    # Validate subject exists and belongs to user
    subject = db.query(Subject).filter(
        Subject.id == subject_id,
        Subject.user_id == current_user.id
    ).first()
    
    if not subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found"
        )
    
    # Validate file type
    allowed_types = {
        "application/pdf": ".pdf",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
        "application/vnd.ms-powerpoint": ".ppt",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg"
    }
    
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not allowed. Allowed types: {', '.join(allowed_types.keys())}"
        )
    
    # Validate file size (50MB max)
    max_size = 50 * 1024 * 1024  # 50MB
    contents = await file.read()
    if len(contents) > max_size:
        raise HTTPException(
            status_code=status.HTTP_413_PAYLOAD_TOO_LARGE,
            detail="File size exceeds 50MB limit"
        )
    
    # Create upload directory structure
    user_upload_dir = os.path.join(UPLOAD_DIR, str(current_user.id))
    os.makedirs(user_upload_dir, exist_ok=True)
    
    # Save file
    file_ext = allowed_types[file.content_type]
    file_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
    file_path = os.path.join(user_upload_dir, file_name)
    
    with open(file_path, "wb") as f:
        f.write(contents)
    
    # Create lecture record
    db_lecture = Lecture(
        title=title,
        subject_id=subject_id,
        user_id=current_user.id,
        file_path=file_path,
        file_name=file.filename,
        file_size=len(contents),
        file_type=file.content_type,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    
    db.add(db_lecture)
    db.commit()
    db.refresh(db_lecture)
    
    # Process content extraction immediately
    try:
        file_ext = os.path.splitext(file_path)[1].lower()
        
        if file_ext in ('.pdf', '.pptx'):
            # Use SmartPipeline for PDF/PPTX — produces clean Markdown
            logger.info(f"Starting smart pipeline processing for lecture {db_lecture.id}")
            pipeline = SmartPipeline(
                use_layout_detection=False,
                use_table_transformer=False,
            )
            markdown = pipeline.process(file_path)
            structured_segments = _markdown_to_segments(markdown)
            
            db_lecture.extracted_text = markdown
            db_lecture.extracted_content_structured = json.dumps(structured_segments)
            
            # Auto-title detection from H1
            if auto_detect_title:
                for line in markdown.split('\n'):
                    if line.strip().startswith('# '):
                        detected_title = line.strip()[2:].strip()
                        if detected_title:
                            db_lecture.title = detected_title
                            logger.info(f"Auto-detected title: {detected_title}")
                            break
            
            db.commit()
            db.refresh(db_lecture)
            
            lines = markdown.split("\n")
            headings = len([l for l in lines if l.startswith("#")])
            list_items = len([l for l in lines if l.strip().startswith("- ")])
            logger.info(f"Smart pipeline: {len(markdown)} chars, {headings} headings, {list_items} list items")
        else:
            # Fallback to OCR for images and other file types
            logger.info(f"Starting OCR processing for lecture {db_lecture.id}")
            ocr_result = OCRProcessor.extract_text(file_path, db_lecture.file_type, lecture_id=db_lecture.id)
            
            db_lecture.extracted_text = ocr_result.get("raw_text", "")
            db_lecture.extracted_content_structured = json.dumps(ocr_result.get("structured_content", []))
            db_lecture.extracted_images_metadata = json.dumps(ocr_result.get("images", []))
            db.commit()
            db.refresh(db_lecture)
            
            logger.info(f"OCR extracted {len(db_lecture.extracted_text)} chars")
        
    except Exception as e:
        logger.error(f"Error processing lecture: {e}", exc_info=True)
        # Continue anyway, content can be extracted later via reprocess
    
    # Return lecture
    response = LectureResponse.from_orm(db_lecture)
    return response


@router.get("/{lecture_id}", response_model=LectureResponse)
async def get_lecture(
    lecture_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific lecture"""
    import logging
    logger = logging.getLogger(__name__)
    
    lecture = db.query(Lecture).options(joinedload(Lecture.subject)).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
    logger.info(f"GET lecture {lecture_id}: extracted_text length = {len(lecture.extracted_text) if lecture.extracted_text else 'NULL'}")
    return lecture


@router.put("/{lecture_id}", response_model=LectureResponse)
async def update_lecture(
    lecture_id: int,
    title: str = Form(None),
    subject_id: int = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update lecture metadata"""
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
    if title:
        lecture.title = title
    
    if subject_id:
        # Verify subject exists and belongs to user
        subject = db.query(Subject).filter(
            Subject.id == subject_id,
            Subject.user_id == current_user.id
        ).first()
        if not subject:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Subject not found"
            )
        lecture.subject_id = subject_id
    
    lecture.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(lecture)
    
    return lecture


@router.post("/{lecture_id}/reprocess-ocr", response_model=LectureResponse)
async def reprocess_ocr(
    lecture_id: int,
    use_v2: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reprocess OCR for existing lecture to extract structured content with enhanced v2 processor"""
    
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
    if not os.path.exists(lecture.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture file not found"
        )
    
    try:
        logger.info(f"Reprocessing OCR for lecture {lecture_id} (use_v2={use_v2})")
        
        # Extract text with structured content using specified processor
        file_ext = os.path.splitext(lecture.file_path)[1].lower()
        
        if file_ext in ('.pdf', '.pptx'):
            # Use SmartPipeline for PDF/PPTX
            logger.info(f"Using SmartPipeline for reprocessing {lecture.file_path}")
            pipeline = SmartPipeline(
                use_layout_detection=False,
                use_table_transformer=False,
            )
            raw_text = pipeline.process(lecture.file_path)
            structured_content = _markdown_to_segments(raw_text)
            
            # Extract images separately for PDF
            images_data = []
            if file_ext == '.pdf':
                try:
                    extractor = ImageExtractor(lecture_id=lecture.id)
                    images_extracted = extractor.extract_images_from_pdf(lecture.file_path)
                    images_data = [img.to_dict() for img in images_extracted]
                    logger.info(f"Extracted {len(images_data)} images")
                except Exception as e:
                    logger.warning(f"Image extraction failed during reprocessing: {e}")
        else:
            # Use Legacy/Fallback OCR for images
            ocr_result = OCRProcessor.extract_text(
                lecture.file_path, 
                lecture.file_type, 
                lecture_id=lecture_id,
                use_v2=use_v2
            )
            raw_text = ocr_result.get("raw_text", "")
            structured_content = ocr_result.get("structured_content", [])
            images_data = ocr_result.get("images", [])
        
        logger.info(f"Reprocessing complete: {len(raw_text)} characters, {len(structured_content)} segments, {len(images_data)} images")
        
        # Update lecture with extracted content
        lecture.extracted_text = raw_text
        lecture.extracted_content_structured = json.dumps(structured_content)
        lecture.extracted_images_metadata = json.dumps(images_data)
        lecture.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(lecture)
        
        logger.info(f"Successfully reprocessed OCR for lecture {lecture_id}")
        return lecture
        
    except Exception as e:
        import traceback
        import sys
        traceback.print_exc(file=sys.stderr)
        logger.error(f"Error reprocessing OCR: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error reprocessing OCR: {str(e)}"
        )


@router.delete("/{lecture_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lecture(
    lecture_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a lecture"""
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
    # Delete file
    if lecture.file_path and os.path.exists(lecture.file_path):
        try:
            os.remove(lecture.file_path)
        except Exception as e:
            # Log error but don't fail the request
            logger.warning(f"Error deleting file: {e}")
    
    # Delete database record
    db.delete(lecture)
    db.commit()
    
    return None


@router.post("/{lecture_id}/generate-pdf", response_model=dict)
async def generate_pdf(
    lecture_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate OUTPUT.pdf from lecture content"""
    
    # Get lecture
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
    try:
        # Check if structured content exists
        if not lecture.extracted_content_structured:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Lecture content not yet processed. Please wait for OCR to complete."
            )
        
        # Parse structured content
        structured_data = json.loads(lecture.extracted_content_structured)
        images_data = json.loads(lecture.extracted_images_metadata) if lecture.extracted_images_metadata else []
        
        # Convert structured data back to ContentSegment objects
        from app.processing.text_processor import ContentSegment
        segments = []
        for item in structured_data:
            segment = ContentSegment(
                content=item["content"],
                content_type=ContentType(item["type"]),
                page_number=item["page"],
                confidence=item.get("confidence", 0.9),
                metadata=item.get("metadata", {})
            )
            segments.append(segment)
        
        # Convert images data back to ExtractedImage objects
        from app.processing.image_extractor import ExtractedImage
        images = []
        for img_data in images_data:
            img = ExtractedImage(
                filename=img_data["filename"],
                page_number=img_data["page"],
                position_x=img_data["position"]["x"],
                position_y=img_data["position"]["y"],
                width=img_data["dimensions"]["width"],
                height=img_data["dimensions"]["height"],
                caption=img_data.get("caption", ""),
                text_content=img_data.get("text_content", ""),
                confidence=img_data.get("confidence", 0.8),
                is_diagram=img_data.get("is_diagram", False),
                file_path=img_data.get("file_path", "")
            )
            images.append(img)
        
        # Generate PDF
        generator = DocumentGenerator(
            lecture_id=lecture_id,
            lecture_title=lecture.title,
            base_output_dir=GENERATED_DIR
        )
        
        output_pdf = generator.generate_pdf(segments, images)
        
        # Update lecture with PDF path
        lecture.output_pdf_path = output_pdf
        db.commit()
        
        logger.info(f"Generated PDF for lecture {lecture_id}: {output_pdf}")
        
        return {
            "success": True,
            "message": "PDF generated successfully",
            "pdf_path": output_pdf,
            "file_size_mb": os.path.getsize(output_pdf) / (1024 * 1024)
        }
    
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing structured content: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid structured content format"
        )
    except Exception as e:
        logger.error(f"Error generating PDF: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating PDF: {str(e)}"
        )


@router.get("/{lecture_id}/download-pdf")
async def download_pdf(
    lecture_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download generated OUTPUT.pdf"""
    
    # Get lecture
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
    if not lecture.output_pdf_path or not os.path.exists(lecture.output_pdf_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not generated yet. Please generate it first."
        )
    
    try:
        # Generate safe filename
        safe_title = "".join(c for c in lecture.title if c.isalnum() or c in (' ', '-', '_')).strip()
        filename = f"{safe_title}_OUTPUT.pdf"
        
        return FileResponse(
            path=lecture.output_pdf_path,
            filename=filename,
            media_type="application/pdf"
        )
    except Exception as e:
        logger.error(f"Error downloading PDF: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error downloading PDF"
        )
