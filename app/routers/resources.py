"""Notes management endpoints"""
import os
import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks, Request
from app.utils.cache import cache_response, clear_cache_pattern_sync
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional, Callable
import uuid

from app.models.db import User, Resource, Subject, Note, Task, Exercise
from app.schemas.schemas import ResourceResponse
from app.schemas.exercise import ExerciseResponse
from app.utils.auth import get_current_user
from app.utils.db import get_db, generate_random_id, SessionLocal
from app.utils.tasks import TaskManager
from app.utils.storage import StorageManager
from app.utils.quotas import enforce_quota_resources, enforce_quota_storage
from app.utils.crypto import decrypt_secret
from app.processing.ocr import OCRProcessor
from app.processing.image_extractor import ImageExtractor
from app.processing.text_processor import ContentType
from app.processing.smart_pipeline import SmartPipeline
from app.processing.note_processor import (
    get_pipeline_for_user,
    extract_markdown_for_user,
    markdown_to_segments,
    process_resource_task
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/resources", tags=["resources"])

# Upload directory - use local temp directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "uploads")
GENERATED_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "generated")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(GENERATED_DIR, exist_ok=True)


def _rebuild_resource_content(
    note: "Resource",
    current_user: "User",
    db: Session,
    use_v2: bool = True,
    reset_first: bool = False,
) -> "Resource":
    """
    Rebuild a note's extracted content from the original uploaded file.
    For PDF/PPTX, this reruns the SmartPipeline from scratch. For images,
    this reruns OCR extraction. Structured content, images, processing time,
    and embeddings are refreshed together.
    """
    if not os.path.exists(note.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource file not found"
        )

    # Clear cache first to ensure other requests (like SubjectView) immediately see the reset state
    clear_cache_pattern_sync(f"cache_resp:/resources*:u{current_user.id}*")

    # Delete output PDF file if it exists
    if note.output_pdf_path and os.path.exists(note.output_pdf_path):
        try:
            os.remove(note.output_pdf_path)
            logger.info(f"Deleted output PDF for note {note.id}: {note.output_pdf_path}")
        except Exception as e:
            logger.warning(f"Error deleting output PDF for note {note.id}: {e}")
    note.output_pdf_path = None
    note.processing_time_ms = None

    if reset_first:
        StorageManager.delete_resource_files(note.id)

    note.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(note)

    # Initialize or update Task status to processing
    task_id = f"ocr_{current_user.id}_{note.id}"
    db_task = db.query(Task).filter(Task.task_id == task_id).first()
    if not db_task:
        db_task = Task(
            task_id=task_id,
            user_id=current_user.id,
            task_type="resource_processing",
            status="processing",
            progress=10,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        db.add(db_task)
    else:
        db_task.status = "processing"
        db_task.progress = 10
        db_task.error_message = None
        db_task.updated_at = datetime.utcnow()
    db.commit()

    import time
    start_time = time.time()
    try:
        file_ext = os.path.splitext(note.file_path)[1].lower()

        if file_ext in ('.pdf', '.pptx'):
            logger.info(f"Rebuilding note {note.id} with SmartPipeline from scratch")
            raw_text, timings = extract_markdown_for_user(current_user, note.file_path)
            StorageManager.save_resource_json(note.id, "timings", timings)
            structured_content = markdown_to_segments(raw_text)

            images_data = []
            if file_ext == '.pdf':
                try:
                    extractor = ImageExtractor(resource_id=note.id)
                    images_extracted = extractor.extract_images_from_pdf(note.file_path)
                    images_data = [img.to_dict() for img in images_extracted]
                    logger.info(f"Extracted {len(images_data)} images during resource rebuild")
                except Exception as e:
                    logger.warning(f"Image extraction failed during resource rebuild: {e}")
            
            # Save to file storage
            StorageManager.save_resource_text(note.id, raw_text)
            StorageManager.save_resource_json(note.id, "structured", structured_content)
            StorageManager.save_resource_json(note.id, "images", images_data)

        else:
            logger.info(f"Rebuilding note {note.id} with OCR fallback")
            ocr_result = OCRProcessor.extract_text(
                note.file_path,
                note.file_type,
                resource_id=note.id,
                use_v2=use_v2
            )
            raw_text = ocr_result.get("raw_text", "")
            structured_content = ocr_result.get("structured_content", [])
            images_data = ocr_result.get("images", [])
            
            # Save to file storage
            StorageManager.save_resource_text(note.id, raw_text)
            StorageManager.save_resource_json(note.id, "structured", structured_content)
            StorageManager.save_resource_json(note.id, "images", images_data)

        # Auto-detect title from first H1 heading
        if raw_text:
            for line in raw_text.split('\n'):
                if line.strip().startswith('# '):
                    detected_title = line.strip()[2:].strip()
                    if detected_title:
                        note.title = detected_title
                        logger.info(f"Auto-detected title '{detected_title}' for note {note.id} during rebuild")
                        break

        note.processing_time_ms = int((time.time() - start_time) * 1000)
        note.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(note)

        if raw_text and raw_text.strip():
            try:
                from app.processing.embeddings import update_resource_embeddings
                update_resource_embeddings(note.id, raw_text, db)
                logger.info(f"Updated embeddings after rebuilding note {note.id}")
            except Exception as e:
                logger.error(f"Error updating embeddings after resource rebuild: {e}", exc_info=True)

        logger.info(
            f"Resource rebuild complete: {note.id}, "
            f"{len(raw_text)} chars, {len(structured_content)} segments, {len(images_data)} images"
        )
        
        # Mark Task complete
        db_task.status = "completed"
        db_task.progress = 100
        db_task.updated_at = datetime.utcnow()
        db.commit()
        
        return note
    except Exception as e:
        logger.error(f"Error during resource rebuild for {note.id}: {e}", exc_info=True)
        # Mark Task failed
        db_task.status = "failed"
        db_task.error_message = str(e)
        db_task.progress = 0
        db_task.updated_at = datetime.utcnow()
        db.commit()
        raise


@router.get("", response_model=List[ResourceResponse])
@cache_response(ttl=3600)
async def get_resources(
    request: Request,
    subject_id: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all notes for the current user, optionally filtered by subject"""
    query = db.query(Resource).filter(Resource.user_id == current_user.id)
    
    if subject_id:
        query = query.filter(Resource.subject_id == subject_id)
    
    notes = query.order_by(Resource.created_at.desc()).all()
    
    response_notes = []
    for note in notes:
        note_data = ResourceResponse.from_orm(note)
        timings = StorageManager.get_resource_json(note.id, "timings")
        if timings:
            note_data.timings = timings
        response_notes.append(note_data)

    return response_notes


@router.post("/upload", response_model=List[ResourceResponse], status_code=status.HTTP_201_CREATED)
async def upload_resource(
    background_tasks: BackgroundTasks,
    subject_id: str = Form(...),
    files: List[UploadFile] = File(...),
    title: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload multiple note files and create note records"""
    
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
    
    allowed_types = {
        "application/pdf": ".pdf",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
        "application/vnd.ms-powerpoint": ".ppt",
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg"
    }

    processed_notes = []

    for file in files:
        # Handle auto-title per file
        auto_detect_title = False
        file_title = title
        if not file_title:
            file_title = os.path.splitext(file.filename)[0]
            auto_detect_title = True
        
        # If multiple files and a title is provided, use the filename as title instead of duplicating the same title
        if len(files) > 1 and title:
             file_title = f"{title} - {os.path.splitext(file.filename)[0]}"

        if file.content_type not in allowed_types:
            logger.warning(f"File type not allowed for {file.filename}: {file.content_type}")
            continue
        
        # Validate file size (50MB max)
        max_size = 50 * 1024 * 1024  # 50MB
        contents = await file.read()
        if len(contents) > max_size:
            logger.warning(f"File too large: {file.filename}")
            continue
        
        # Enforce tier quotas
        try:
            enforce_quota_resources(current_user, db)
            enforce_quota_storage(current_user, len(contents), db)
        except HTTPException as e:
            logger.error(f"Quota exceeded: {e.detail}")
            # If we already processed some, we return them, otherwise raise for the first one
            if not processed_notes:
                raise e
            break
        
        # Create upload directory structure
        user_upload_dir = os.path.join(UPLOAD_DIR, str(current_user.id))
        os.makedirs(user_upload_dir, exist_ok=True)
        
        # Save file
        file_name = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
        file_path = os.path.join(user_upload_dir, file_name)
        
        with open(file_path, "wb") as f:
            f.write(contents)
        
        # Create resource record
        db_note = Resource(
            id=generate_random_id(db, Resource),
            title=file_title,
            subject_id=subject_id,
            user_id=current_user.id,
            file_path=file_path,
            file_name=file.filename,
            file_size=len(contents),
            file_type=file.content_type,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.add(db_note)
        db.commit()
        db.refresh(db_note)
        
        # STEP 3: Process content extraction in background (Offloaded to Worker)
        task_id = f"ocr_{current_user.id}_{db_note.id}"
        TaskManager.submit_task(
            task_id, 
            "resource_processing", 
            current_user.id, 
            resource_id=db_note.id, 
            file_name=file.filename,
            auto_detect_title=auto_detect_title
        )
        processed_notes.append(db_note)

    # Clear cache
    clear_cache_pattern_sync(f"cache_resp:/resources*:u{current_user.id}*")
    
    if not processed_notes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid files were uploaded"
        )

    return processed_notes



@router.get("/{resource_id}", response_model=ResourceResponse)
@cache_response(ttl=3600)
async def get_resource(
    request: Request,
    resource_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific note"""
    
    note = db.query(Resource).options(
        joinedload(Resource.subject).joinedload(Subject.group)
    ).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )

    # Manually populate text fields from storage for the response
    note_data = ResourceResponse.from_orm(note)
    note_data.extracted_text = StorageManager.get_resource_text(resource_id)

    # Get structured content and images
    structured = StorageManager.get_resource_json(resource_id, "structured")
    if structured:
        note_data.extracted_content_structured = json.dumps(structured)

    images = StorageManager.get_resource_json(resource_id, "images")
    if images:
        note_data.extracted_images_metadata = json.dumps(images)

    timings = StorageManager.get_resource_json(resource_id, "timings")
    if timings:
        note_data.timings = timings

    logger.info(f"GET note {resource_id}: extracted_text length = {len(note_data.extracted_text) if note_data.extracted_text else 'NULL'}")
    return note_data


@router.put("/{resource_id}", response_model=ResourceResponse)
async def update_resource(
    resource_id: str,
    title: str = Form(None),
    subject_id: str = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update resource metadata"""
    note = db.query(Resource).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    
    if title:
        note.title = title
    
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
        note.subject_id = subject_id
    
    note.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(note)

    # Clear cache
    clear_cache_pattern_sync(f"cache_resp:/resources*:u{current_user.id}*")

    return note



@router.post("/{resource_id}/reprocess-ocr", response_model=ResourceResponse)
def reprocess_ocr(
    resource_id: str,
    use_v2: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Reprocess OCR for existing note to extract structured content with enhanced v2 processor"""
    
    note = db.query(Resource).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    
    try:
        logger.info(f"Reprocessing OCR for note {resource_id} (use_v2={use_v2})")
        note = _rebuild_resource_content(note, current_user, db, use_v2=use_v2, reset_first=False)
        logger.info(f"Successfully reprocessed OCR for note {resource_id}")
        
        note_data = ResourceResponse.from_orm(note)
        timings = StorageManager.get_resource_json(note.id, "timings")
        if timings:
            note_data.timings = timings
            
        clear_cache_pattern_sync(f"cache_resp:/resources*:u{current_user.id}*")
        return note_data
        
    except Exception as e:
        import traceback
        import sys
        traceback.print_exc(file=sys.stderr)
        logger.error(f"Error reprocessing OCR: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error reprocessing OCR: {str(e)}"
        )


@router.post("/{resource_id}/reprocess", response_model=ResourceResponse)
def reprocess_resource_from_scratch(
    resource_id: str,
    use_v2: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Fully rebuild a note from the original uploaded file, replacing all derived content."""
    note = db.query(Resource).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )

    try:
        logger.info(f"Starting full resource rebuild for {resource_id}")
        note = _rebuild_resource_content(note, current_user, db, use_v2=use_v2, reset_first=True)
        logger.info(f"Successfully rebuilt note {resource_id} from scratch")
        
        note_data = ResourceResponse.from_orm(note)
        timings = StorageManager.get_resource_json(note.id, "timings")
        if timings:
            note_data.timings = timings
            
        clear_cache_pattern_sync(f"cache_resp:/resources*:u{current_user.id}*")
        return note_data
    except Exception as e:
        logger.error(f"Error rebuilding note from scratch: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error rebuilding note: {str(e)}"
        )


@router.delete("/{resource_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resource(
    resource_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a note"""
    note = db.query(Resource).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    
    # 1. Delete the actual uploaded file if it exists
    if note.file_path and os.path.exists(note.file_path):
        try:
            os.remove(note.file_path)
        except Exception as e:
            # Log error but don't fail the request
            logger.warning(f"Error deleting original file: {e}")

    # 2. Delete storage files (extracted text, structured JSON, images)
    try:
        StorageManager.delete_resource_files(note.id)
    except Exception as e:
        logger.warning(f"Error deleting storage files: {e}")

    # 3. Delete database record (cascades to related objects)
    try:
        db.delete(note)
        db.commit()
        
        # Clear cache
        clear_cache_pattern_sync(f"cache_resp:/resources*:u{current_user.id}*")
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting note from database: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database deletion failed: {str(e)}"
        )
    
    return None


@router.post("/{resource_id}/generate-pdf", response_model=dict)
async def generate_pdf(
    resource_id: str,
    body: dict = {},
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate OUTPUT.pdf from note content"""
    
    # Get note
    note = db.query(Resource).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    
    # Extract options from body
    include_toc = body.get("include_toc", True)
    include_cover = body.get("include_cover", True)
    
    try:
        # Build segments from structured content or markdown
        from app.processing.text_processor import ContentSegment
        segments = []
        images = []
        
        if note.extracted_content_structured:
            # Parse structured content
            structured_data = json.loads(note.extracted_content_structured)
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
        elif note.extracted_text:
            # Markdown-only: convert to segments
            structured_data = _markdown_to_segments(note.extracted_text)
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
                detail="Resource has no content to export. Please wait for processing to complete."
            )
        
        # Actually generate the PDF
        from app.processing.document_generator import DocumentGenerator
        generator = DocumentGenerator(
            resource_id=note.id,
            note_title=note.title,
            base_output_dir=GENERATED_DIR,
        )
        
        output_path = generator.generate_pdf(
            content_segments=segments,
            extracted_images=images,
            include_toc=include_toc,
            include_cover=include_cover,
        )
        
        # Save the output path
        note.output_pdf_path = output_path
        note.updated_at = datetime.utcnow()
        db.commit()
        
        logger.info(f"Generated PDF for note {resource_id}: {output_path}")
        
        return {
            "success": True,
            "message": "PDF generated successfully",
            "download_url": f"/resources/{resource_id}/download-pdf",
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


@router.get("/{resource_id}/download-pdf")
async def download_pdf(
    resource_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download generated OUTPUT.pdf"""
    
    # Get note
    note = db.query(Resource).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    
    if not note.output_pdf_path or not os.path.exists(note.output_pdf_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not generated yet. Please generate it first."
        )
    
    try:
        # Generate safe filename
        safe_title = "".join(c for c in note.title if c.isalnum() or c in (' ', '-', '_')).strip()
        filename = f"{safe_title}_OUTPUT.pdf"
        
        return FileResponse(
            path=note.output_pdf_path,
            filename=filename,
            media_type="application/pdf"
        )
    except Exception as e:
        logger.error(f"Error downloading PDF: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error downloading PDF"
        )


@router.post("/{resource_id}/export", response_model=dict)
async def export_resource(
    resource_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export note as PDF or DOCX"""
    import uuid
    logger.info(f"[Export] Received request for note {resource_id} with body: {body}")
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
    
    include_cover = body.get("include_cover")
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
            logger.debug(f"[Export] Template Config Keys: {list(template_config.keys()) if template_config else 'None'}")
            
            # Apply template settings for include_cover if not explicitly in request body
            if include_cover is None:
                include_cover = template_config.get("cover_page", {}).get("enabled", True)
                
            logger.info(f"[Export] Cover: {include_cover}")
        else:
            logger.warning(f"[Export] Template ID {template_id} not found in database")
    
    # Final defaults if still None
    if include_cover is None: include_cover = True

    # Get note
    note = db.query(Resource).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )

    # Build segments from structured content or markdown
    from app.processing.text_processor import ContentSegment, ContentType
    segments = []
    images = []  # Currently disabled - image feature not yet implemented

    try:
        # Inject header segments based on template config
        if template_config and "header" in template_config:
            h_cfg = template_config["header"]
            if h_cfg.get("show_note_title"):
                segments.append(ContentSegment(
                    content=note.title,
                    content_type=ContentType.NOTE_TITLE,
                    page_number=1
                ))
            if h_cfg.get("show_subject_name") and note.subject:
                segments.append(ContentSegment(
                    content=note.subject.name,
                    content_type=ContentType.SUBJECT_NAME,
                    page_number=1
                ))
            if h_cfg.get("show_group_name") and note.subject and note.subject.group_id:
                from app.models.db import SubjectGroup
                group = db.query(SubjectGroup).filter(SubjectGroup.id == note.subject.group_id).first()
                if group:
                    segments.append(ContentSegment(
                        content=group.name,
                        content_type=ContentType.GROUP_NAME,
                        page_number=1
                    ))

        # Flag to skip first H1 if we already injected a NOTE_TITLE
        skip_first_h1 = template_config and template_config.get("header", {}).get("show_note_title", False)

        if note.extracted_content_structured:
            structured_data = json.loads(note.extracted_content_structured)
            for item in structured_data:
                # If it's the first H1 and we are skipping it, do so
                if skip_first_h1 and item["type"] == "h1":
                    skip_first_h1 = False  # Only skip the VERY first one
                    continue
                
                segment = ContentSegment(
                    content=item["content"],
                    content_type=ContentType(item["type"]),
                    page_number=item["page"],
                    confidence=item.get("confidence", 0.9),
                    metadata=item.get("metadata", {})
                )
                segments.append(segment)
            # Images currently disabled - feature not yet implemented
        elif note.extracted_text:
            structured_data = _markdown_to_segments(note.extracted_text)
            for item in structured_data:
                # If it's the first H1 and we are skipping it, do so
                if skip_first_h1 and item["type"] == "h1":
                    skip_first_h1 = False  # Only skip the VERY first one
                    continue
                    
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
                detail="Resource has no content to export. Please wait for processing to complete."
            )
        
        # Generate the document
        safe_title = "".join(c for c in note.title if c.isalnum() or c in (' ', '-', '_')).strip()
        
        if export_format == "pdf":
            from app.processing.document_generator import DocumentGenerator
            generator = DocumentGenerator(
                resource_id=note.id,
                note_title=note.title,
                base_output_dir=GENERATED_DIR,
            )
            output_path = generator.generate_pdf(
                content_segments=segments,
                extracted_images=images,
                include_toc=False,
                include_cover=include_cover,
                template_config=template_config,
                progress_callback=progress_callback,
            )
            note.output_pdf_path = output_path
            download_filename = f"{safe_title}.pdf"
        else:
            from app.processing.docx_generator import DocxGenerator
            generator = DocxGenerator(
                resource_id=note.id,
                note_title=note.title,
                base_output_dir=GENERATED_DIR,
            )
            output_path = generator.generate_docx(
                content_segments=segments,
                extracted_images=images,
                include_toc=False,
                include_cover=include_cover,
                template_config=template_config,
                progress_callback=progress_callback,
            )
            download_filename = f"{safe_title}.docx"
        
        # Store in Note
        from app.models.db import Note
        gen_doc = Note(
            resource_id=note.id,
            title=f"{note.title} ({export_format.upper()})",
            file_path=output_path,
            summary_type=export_format,
        )
        db.add(gen_doc)
        note.updated_at = datetime.utcnow()
        db.commit()
        
        logger.info(f"Exported {export_format.upper()} for note {resource_id}: {output_path}")
        
        return {
            "success": True,
            "message": f"{export_format.upper()} generated successfully",
            "download_url": f"/resources/{resource_id}/download-export?format={export_format}",
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


@router.get("/{resource_id}/export-status/{task_id}")
async def get_export_status(
    resource_id: str,
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get export task progress"""
    progress = _export_progress.get(task_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Task not found")
    return progress


@router.get("/{resource_id}/download-export")
async def download_export(
    resource_id: str,
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
    
    note = db.query(Resource).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    
    # Look for the generated file
    from app.models.db import Note
    gen_doc = db.query(Note).filter(
        Note.resource_id == resource_id,
        Note.summary_type == export_format,
    ).order_by(Note.created_at.desc()).first()
    
    if not gen_doc or not os.path.exists(gen_doc.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{export_format.upper()} not generated yet. Please generate it first."
        )
    
    safe_title = "".join(c for c in note.title if c.isalnum() or c in (' ', '-', '_')).strip()
    
    mime_types = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    
    return FileResponse(
        path=gen_doc.file_path,
        filename=f"{safe_title}.{export_format}",
        media_type=mime_types[export_format],
    )

@router.put("/{resource_id}/content", response_model=ResourceResponse)
async def update_resource_content(
    resource_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Save edited markdown content back to the note"""
    note = db.query(Resource).options(joinedload(Resource.subject)).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    
    new_text = body.get("extracted_text")
    if new_text is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="extracted_text is required"
        )
    
    StorageManager.save_resource_text(note.id, new_text)
    StorageManager.save_resource_json(note.id, "structured", _markdown_to_segments(new_text))
    note.updated_at = datetime.utcnow()
    
    # Invalidate existing summary when content changes
    db.query(Note).filter(
        Note.resource_id == resource_id,
        Note.summary_type == "summary"
    ).delete()
    
    db.commit()
    db.refresh(note)
    
    # Clear cache
    clear_cache_pattern_sync(f"cache_resp:/resources*:u{current_user.id}*")
    
    # Update embeddings to stay in sync
    if new_text and new_text.strip():
        try:
            from app.processing.embeddings import update_resource_embeddings
            update_resource_embeddings(note.id, new_text, db)
            logger.info(f"Updated embeddings for note {resource_id}")
        except Exception as e:
            logger.error(f"Error updating embeddings: {e}", exc_info=True)
            # Don't fail the content update
    
    logger.info(f"Updated content for note {resource_id}: {len(new_text)} chars")
    return note


@router.get("/{resource_id}/download-file")
async def download_original_file(
    resource_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download the original uploaded file"""
    note = db.query(Resource).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()
    
    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    
    if not note.file_path or not os.path.exists(note.file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Original file not found"
        )
    
    return FileResponse(
        path=note.file_path,
        filename=note.file_name or f"note_{resource_id}",
        media_type=note.file_type or "application/octet-stream"
    )


@router.get("/{resource_id}/processing-logs")
async def get_resource_processing_logs(
    resource_id: str,
    limit: int = 200,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Return recent log lines related to a specific note's processing.
    Scans api.log and errors.log for lines mentioning the resource_id.
    """
    note = db.query(Resource).filter(
        Resource.id == resource_id,
        Resource.user_id == current_user.id
    ).first()

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )

    import re
    log_dir = os.path.join(os.path.dirname(__file__), "..", "..", "logs")
    log_files = ["api.log", "errors.log"]
    entries = []

    for log_file in log_files:
        log_path = os.path.join(log_dir, log_file)
        if not os.path.exists(log_path):
            continue
        try:
            # Read last 5MB of each log file to avoid loading huge files
            max_bytes = 5 * 1024 * 1024
            with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                f.seek(0, 2)
                file_size = f.tell()
                start = max(0, file_size - max_bytes)
                f.seek(start)
                if start > 0:
                    f.readline()  # skip partial first line
                lines = f.readlines()

            for line in lines:
                if resource_id not in line:
                    continue
                # Skip noisy uvicorn HTTP access lines for this note
                if "uvicorn.access" in line:
                    continue
                # Parse: "2026-06-22 17:10:03,378 [LEVEL] logger.name: message"
                m = re.match(
                    r'^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},\d+)\s+\[(\w+)\]\s+([\w\.]+):\s+(.*)',
                    line.strip()
                )
                if m:
                    entries.append({
                        "timestamp": m.group(1),
                        "level": m.group(2),
                        "logger": m.group(3),
                        "message": m.group(4),
                        "source": log_file,
                    })
                else:
                    entries.append({
                        "timestamp": None,
                        "level": "INFO",
                        "logger": log_file,
                        "message": line.strip(),
                        "source": log_file,
                    })
        except Exception as e:
            logger.warning(f"Failed to read log file {log_file}: {e}")

    # Sort chronologically, trim to limit
    entries.sort(key=lambda x: x["timestamp"] or "")
    entries = entries[-limit:]

    return {
        "resource_id": resource_id,
        "count": len(entries),
        "entries": entries,
    }


@router.get("/{resource_id}/related")
def get_related_content(
    resource_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all notes and exercises related to a resource (direct + merged)"""
    try:
        resource = db.query(Resource).filter(
            Resource.id == resource_id,
            Resource.user_id == current_user.id
        ).first()
        if not resource:
            raise HTTPException(status_code=404, detail="Resource not found")

        # Direct notes (resource_id matches)
        direct_notes = db.query(Note).join(Resource, Note.resource_id == Resource.id).filter(
            Resource.user_id == current_user.id,
            Note.resource_id == resource_id
        ).order_by(Note.created_at.desc()).all()

        # Merged notes (note's resource_ids JSON contains this resource_id)
        merged_notes = db.query(Note).join(Resource, Note.resource_id == Resource.id).filter(
            Resource.user_id == current_user.id,
            Note.resource_id != resource_id,
            Note.resource_ids.isnot(None)
        ).order_by(Note.created_at.desc()).all()
        merged_notes = [
            n for n in merged_notes
            if n.resource_ids and resource_id in json.loads(n.resource_ids)
        ]

        # Direct exercises
        direct_exercises = db.query(Exercise).filter(
            Exercise.user_id == current_user.id,
            Exercise.resource_id == resource_id
        ).order_by(Exercise.created_at.desc()).all()

        # Merged exercises (check parameters JSON for resource_ids)
        subject_exercises = db.query(Exercise).filter(
            Exercise.user_id == current_user.id,
            Exercise.resource_id != resource_id,
            Exercise.subject_id == resource.subject_id
        ).order_by(Exercise.created_at.desc()).all()
        merged_exercises = []
        for ex in subject_exercises:
            params = StorageManager.get_resource_json(ex.id, "parameters")
            if params and isinstance(params, dict):
                r_ids = params.get("resource_ids", [])
                if resource_id in r_ids:
                    merged_exercises.append(ex)

        all_notes = direct_notes + merged_notes
        all_notes.sort(key=lambda n: n.created_at or datetime.min, reverse=True)

        all_exercises = direct_exercises + merged_exercises
        all_exercises.sort(key=lambda e: e.created_at or datetime.min, reverse=True)

        def format_timestamp(dt):
            if not dt:
                return ""
            if dt.tzinfo is None:
                return dt.isoformat() + 'Z'
            return dt.isoformat()

        notes_data = []
        for n in all_notes:
            notes_data.append({
                "id": n.id,
                "version": n.version,
                "resource_id": n.resource_id,
                "title": n.title,
                "summary_type": n.summary_type,
                "file_path": n.file_path,
                "created_at": format_timestamp(n.created_at),
                "mode": n.mode,
                "output_format": n.output_format,
                "processing_method": n.processing_method,
                "split_level": n.split_level,
                "model": n.model,
                "is_user_edited": n.is_user_edited or False,
                "is_pinned": n.is_pinned or False,
                "prompt_name": n.prompt_name,
                "prompt_icon": n.prompt_icon,
                "resource_ids": n.resource_ids,
            })

        exercises_data = []
        for ex in all_exercises:
            params = StorageManager.get_resource_json(ex.id, "parameters") or {}
            exercises_data.append({
                "id": ex.id,
                "title": ex.title,
                "resource_id": ex.resource_id,
                "subject_id": ex.subject_id,
                "group_id": ex.group_id,
                "file_path": ex.file_path,
                "file_name": ex.file_name,
                "model": ex.model,
                "processing_time_ms": ex.processing_time_ms,
                "created_at": format_timestamp(ex.created_at),
                "updated_at": format_timestamp(ex.updated_at),
                "parameters": params,
            })

        return {
            "notes": notes_data,
            "exercises": exercises_data,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching related content for resource {resource_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
