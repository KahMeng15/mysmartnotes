"""Lectures management endpoints"""
import os
import shutil
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List
import uuid

from app.models.db import User, Lecture, Subject
from app.schemas.schemas import LectureResponse
from app.utils.auth import get_current_user
from app.utils.db import get_db
# Lazy import for tasks (avoid circular imports and version conflicts)

router = APIRouter(prefix="/lectures", tags=["lectures"])

# Upload directory - use local temp directory
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


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
    title: str = Form(...),
    subject_id: int = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload a lecture file and create lecture record"""
    
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
    
    # Trigger OCR processing in background
    task_id = f"ocr_{db_lecture.id}_{uuid.uuid4().hex[:8]}"
    
    def process_lecture(lecture_id: int, file_path: str):
        """Background task to extract text and generate embeddings"""
        try:
            # Lazy import to avoid startup issues
            from app.utils.tasks import OCRTask
            
            # Extract text
            ocr_result = OCRTask.process_file(file_path)
            extracted_text = ocr_result.get("extracted_text", "")
            chunks = ocr_result.get("chunks", [])
            
            # Update lecture with extracted text
            db_session = db.session
            lecture = db_session.query(Lecture).filter(Lecture.id == lecture_id).first()
            if lecture:
                lecture.extracted_text = extracted_text
                db_session.commit()
            
            # TODO: Generate and store embeddings
            # This would require saving embeddings to a separate table
            
            return {"status": "success", "extracted_text_length": len(extracted_text)}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    # Submit background task (lazy import)
    try:
        from app.utils.tasks import TaskManager
        TaskManager.submit_task(
            task_id,
            process_lecture,
            db_lecture.id,
            file_path
        )
    except ImportError:
        # If tasks module unavailable, just skip background processing
        pass
    
    # Return lecture with task info
    response = dict(db_lecture.__dict__)
    response["task_id"] = task_id
    return response


@router.get("/{lecture_id}", response_model=LectureResponse)
async def get_lecture(
    lecture_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific lecture"""
    lecture = db.query(Lecture).filter(
        Lecture.id == lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
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
            print(f"Error deleting file: {e}")
    
    # Delete database record
    db.delete(lecture)
    db.commit()
    
    return None
