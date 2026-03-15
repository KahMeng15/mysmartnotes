"""Lectures management endpoints"""
import os
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
from app.utils.db import get_db, generate_random_id
from app.processing.ocr import OCRProcessor
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
    subject_id: str = None,
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
    subject_id: str = Form(...),
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
        id=generate_random_id(db, Lecture),
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
        import time
        start_time = time.time()
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
            
            db_lecture.processing_time_ms = int((time.time() - start_time) * 1000)
            db_lecture.updated_at = datetime.utcnow()
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
            db_lecture.processing_time_ms = int((time.time() - start_time) * 1000)
            db_lecture.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(db_lecture)
            
            logger.info(f"OCR extracted {len(db_lecture.extracted_text)} chars")
        
        # STEP 4: Compute and store embeddings in background
        if db_lecture.extracted_text and db_lecture.extracted_text.strip():
            try:
                from app.processing.embeddings import compute_and_store_embeddings
                compute_and_store_embeddings(db_lecture.id, db_lecture.extracted_text, db)
                logger.info(f"Embeddings computed for lecture {db_lecture.id}")
            except Exception as e:
                logger.error(f"Error computing embeddings: {e}", exc_info=True)
                # Don't fail the upload, embeddings can be computed later
        
    except Exception as e:
        logger.error(f"Error processing lecture: {e}", exc_info=True)
        # Continue anyway, content can be extracted later via reprocess
    
    # Return lecture
    response = LectureResponse.from_orm(db_lecture)
    return response


@router.get("/{lecture_id}", response_model=LectureResponse)
async def get_lecture(
    lecture_id: str,
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
    lecture_id: str,
    title: str = Form(None),
    subject_id: str = Form(None),
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
    lecture_id: str,
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
        import time
        start_time = time.time()
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
        
        lecture.processing_time_ms = int((time.time() - start_time) * 1000)
        logger.info(f"Reprocessing complete: {len(raw_text)} characters, {len(structured_content)} segments, {len(images_data)} images")
        
        # Update lecture with extracted content
        lecture.extracted_text = raw_text
        lecture.extracted_content_structured = json.dumps(structured_content)
        lecture.extracted_images_metadata = json.dumps(images_data)
        lecture.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(lecture)
        
        # Update embeddings after reprocessing
        if raw_text and raw_text.strip():
            try:
                from app.processing.embeddings import update_lecture_embeddings
                update_lecture_embeddings(lecture.id, raw_text, db)
                logger.info(f"Updated embeddings after reprocessing for lecture {lecture_id}")
            except Exception as e:
                logger.error(f"Error updating embeddings after reprocessing: {e}", exc_info=True)
                # Don't fail the reprocessing
        
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
    lecture_id: str,
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
    lecture_id: str,
    body: dict = {},
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
    
    # Extract options from body
    include_toc = body.get("include_toc", True)
    include_cover = body.get("include_cover", True)
    
    try:
        # Build segments from structured content or markdown
        from app.processing.text_processor import ContentSegment
        segments = []
        images = []
        
        if lecture.extracted_content_structured:
            # Parse structured content
            structured_data = json.loads(lecture.extracted_content_structured)
            for item in structured_data:
                segment = ContentSegment(
                    content=item["content"],
                    content_type=ContentType(item["type"]),
                    page_number=item["page"],
                    confidence=item.get("confidence", 0.9),
                    metadata=item.get("metadata", {})
                )
                segments.append(segment)
            # Images currently disabled - feature not yet implemented
        elif lecture.extracted_text:
            # Markdown-only: convert to segments
            structured_data = _markdown_to_segments(lecture.extracted_text)
            for item in structured_data:
                segment = ContentSegment(
                    content=item["content"],
                    content_type=ContentType(item["type"]),
                    page_number=item.get("page", 1),
                    confidence=item.get("confidence", 0.9),
                    metadata=item.get("metadata", {})
                )
                segments.append(segment)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Lecture has no content to export. Please wait for processing to complete."
            )
        
        # Actually generate the PDF
        from app.processing.document_generator import DocumentGenerator
        generator = DocumentGenerator(
            lecture_id=lecture.id,
            lecture_title=lecture.title,
            base_output_dir=GENERATED_DIR,
        )
        
        output_path = generator.generate_pdf(
            content_segments=segments,
            extracted_images=images,
            include_toc=include_toc,
            include_cover=include_cover,
        )
        
        # Save the output path
        lecture.output_pdf_path = output_path
        lecture.updated_at = datetime.utcnow()
        db.commit()
        
        logger.info(f"Generated PDF for lecture {lecture_id}: {output_path}")
        
        return {
            "success": True,
            "message": "PDF generated successfully",
            "download_url": f"/lectures/{lecture_id}/download-pdf",
            "segments_count": len(segments),
            "images_count": len(images)
        }
    
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing structured content: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid structured content format"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating PDF: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating PDF: {str(e)}"
        )


@router.get("/{lecture_id}/download-pdf")
async def download_pdf(
    lecture_id: str,
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


@router.post("/{lecture_id}/export", response_model=dict)
async def export_lecture(
    lecture_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export lecture as PDF or DOCX"""
    import uuid
    task_id = str(uuid.uuid4())[:8]
    _export_progress[task_id] = {"step": "Starting", "percent": 0, "status": "running"}
    
    def progress_callback(step, percent):
        _export_progress[task_id] = {"step": step, "percent": percent, "status": "running" if percent < 100 else "complete"}
    
    export_format = body.get("format", "pdf").lower()
    if export_format not in ("pdf", "docx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format must be 'pdf' or 'docx'"
        )
    
    include_toc = body.get("include_toc", True)
    include_cover = body.get("include_cover", True)
    template_id = body.get("template_id", None)
    
    # Load template config if provided
    template_config = None
    if template_id:
        from app.models.db import ExportTemplate
        tmpl = db.query(ExportTemplate).filter(
            ExportTemplate.id == template_id,
            (ExportTemplate.user_id == current_user.id) | (ExportTemplate.user_id.is_(None))
        ).first()
        if tmpl:
            template_config = tmpl.config
            logger.info(f"[Export] Loaded template '{tmpl.name}' (ID: {template_id})")
            logger.info(f"[Export] Template config: {template_config}")
        else:
            logger.warning(f"[Export] Template ID {template_id} not found")
    else:
        logger.info(f"[Export] No template ID provided, using defaults")

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
        # Build segments from structured content or markdown
        from app.processing.text_processor import ContentSegment
        segments = []
        images = []  # Currently disabled - image feature not yet implemented
        
        if lecture.extracted_content_structured:
            structured_data = json.loads(lecture.extracted_content_structured)
            for item in structured_data:
                segment = ContentSegment(
                    content=item["content"],
                    content_type=ContentType(item["type"]),
                    page_number=item["page"],
                    confidence=item.get("confidence", 0.9),
                    metadata=item.get("metadata", {})
                )
                segments.append(segment)
            # Images currently disabled - feature not yet implemented
        elif lecture.extracted_text:
            structured_data = _markdown_to_segments(lecture.extracted_text)
            for item in structured_data:
                segment = ContentSegment(
                    content=item["content"],
                    content_type=ContentType(item["type"]),
                    page_number=item.get("page", 1),
                    confidence=item.get("confidence", 0.9),
                    metadata=item.get("metadata", {})
                )
                segments.append(segment)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Lecture has no content to export. Please wait for processing to complete."
            )
        
        # Generate the document
        safe_title = "".join(c for c in lecture.title if c.isalnum() or c in (' ', '-', '_')).strip()
        
        if export_format == "pdf":
            from app.processing.document_generator import DocumentGenerator
            generator = DocumentGenerator(
                lecture_id=lecture.id,
                lecture_title=lecture.title,
                base_output_dir=GENERATED_DIR,
            )
            output_path = generator.generate_pdf(
                content_segments=segments,
                extracted_images=images,
                include_toc=include_toc,
                include_cover=include_cover,
                template_config=template_config,
                progress_callback=progress_callback,
            )
            lecture.output_pdf_path = output_path
            download_filename = f"{safe_title}.pdf"
        else:
            from app.processing.docx_generator import DocxGenerator
            generator = DocxGenerator(
                lecture_id=lecture.id,
                lecture_title=lecture.title,
                base_output_dir=GENERATED_DIR,
            )
            output_path = generator.generate_docx(
                content_segments=segments,
                extracted_images=images,
                include_toc=include_toc,
                include_cover=include_cover,
                template_config=template_config,
                progress_callback=progress_callback,
            )
            download_filename = f"{safe_title}.docx"
        
        # Store in GeneratedDocument
        from app.models.db import GeneratedDocument
        gen_doc = GeneratedDocument(
            lecture_id=lecture.id,
            title=f"{lecture.title} ({export_format.upper()})",
            file_path=output_path,
            document_type=export_format,
        )
        db.add(gen_doc)
        lecture.updated_at = datetime.utcnow()
        db.commit()
        
        logger.info(f"Exported {export_format.upper()} for lecture {lecture_id}: {output_path}")
        
        return {
            "success": True,
            "message": f"{export_format.upper()} generated successfully",
            "download_url": f"/lectures/{lecture_id}/download-export?format={export_format}",
            "task_id": task_id,
            "segments_count": len(segments),
            "images_count": len(images)
        }
    
    except json.JSONDecodeError as e:
        logger.error(f"Error parsing structured content: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid structured content format"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error exporting {export_format}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error exporting {export_format}: {str(e)}"
        )


# In-memory export progress tracking
_export_progress = {}


@router.get("/{lecture_id}/export-status/{task_id}")
async def get_export_status(
    lecture_id: str,
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get export task progress"""
    progress = _export_progress.get(task_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Task not found")
    return progress


@router.get("/{lecture_id}/download-export")
async def download_export(
    lecture_id: str,
    format: str = "pdf",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download generated export file (PDF or DOCX)"""
    
    export_format = format.lower()
    if export_format not in ("pdf", "docx"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Format must be 'pdf' or 'docx'"
        )
    
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
    # Look for the generated file
    from app.models.db import GeneratedDocument
    gen_doc = db.query(GeneratedDocument).filter(
        GeneratedDocument.lecture_id == lecture_id,
        GeneratedDocument.document_type == export_format,
    ).order_by(GeneratedDocument.created_at.desc()).first()
    
    if not gen_doc or not os.path.exists(gen_doc.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{export_format.upper()} not generated yet. Please generate it first."
        )
    
    safe_title = "".join(c for c in lecture.title if c.isalnum() or c in (' ', '-', '_')).strip()
    
    mime_types = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    
    return FileResponse(
        path=gen_doc.file_path,
        filename=f"{safe_title}.{export_format}",
        media_type=mime_types[export_format],
    )

@router.put("/{lecture_id}/content", response_model=LectureResponse)
async def update_lecture_content(
    lecture_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save edited markdown content back to the lecture"""
    lecture = db.query(Lecture).options(joinedload(Lecture.subject)).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
    new_text = body.get("extracted_text")
    if new_text is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="extracted_text is required"
        )
    
    lecture.extracted_text = new_text
    lecture.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(lecture)
    
    # Update embeddings to stay in sync
    if new_text and new_text.strip():
        try:
            from app.processing.embeddings import update_lecture_embeddings
            update_lecture_embeddings(lecture.id, new_text, db)
            logger.info(f"Updated embeddings for lecture {lecture_id}")
        except Exception as e:
            logger.error(f"Error updating embeddings: {e}", exc_info=True)
            # Don't fail the content update
    
    logger.info(f"Updated content for lecture {lecture_id}: {len(new_text)} chars")
    return lecture


@router.get("/{lecture_id}/download-file")
async def download_original_file(
    lecture_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download the original uploaded file"""
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
    if not lecture.file_path or not os.path.exists(lecture.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Original file not found"
        )
    
    return FileResponse(
        path=lecture.file_path,
        filename=lecture.file_name or f"lecture_{lecture_id}",
        media_type=lecture.file_type or "application/octet-stream"
    )
