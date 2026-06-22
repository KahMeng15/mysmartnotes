"""Subjects management endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session, joinedload
from typing import List

from app.models.db import User, Subject
from app.schemas.schemas import SubjectCreate, SubjectUpdate, SubjectResponse
from app.utils.auth import get_current_user
from app.utils.db import get_db, generate_random_id
from app.utils.quotas import enforce_quota_subjects
from app.utils.cache import cache_response, clear_cache_pattern_sync

router = APIRouter(prefix="/subjects", tags=["subjects"])


@router.get("", response_model=List[SubjectResponse])
@cache_response(ttl=3600)
async def get_subjects(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all subjects for the current user"""
    subjects = db.query(Subject).options(joinedload(Subject.group)).filter(Subject.user_id == current_user.id).all()
    return subjects


@router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject(
    subject: SubjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new subject"""
    # Enforce tier quotas
    enforce_quota_subjects(current_user, db)
    

    db_subject = Subject(
        id=generate_random_id(db, Subject),
        name=subject.name,
        description=subject.description,
        color=subject.color,
        user_id=current_user.id,
        group_id=subject.group_id
    )
    db.add(db_subject)
    db.commit()
    db.refresh(db_subject)
    
    # Clear cache
    clear_cache_pattern_sync(f"cache_resp:/subjects*:u{current_user.id}*")
    
    return db_subject


@router.put("/{subject_id}", response_model=SubjectResponse)
async def update_subject(
    subject_id: str,
    subject: SubjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a subject"""
    db_subject = db.query(Subject).options(joinedload(Subject.group)).filter(
        Subject.id == subject_id,
        Subject.user_id == current_user.id
    ).first()
    
    if not db_subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found"
        )
    

    update_data = subject.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_subject, field, value)
    
    db.commit()
    db.refresh(db_subject)
    
    # Clear cache
    clear_cache_pattern_sync(f"cache_resp:/subjects*:u{current_user.id}*")
    
    return db_subject


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject(
    subject_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a subject"""
    db_subject = db.query(Subject).filter(
        Subject.id == subject_id,
        Subject.user_id == current_user.id
    ).first()
    
    if not db_subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found"
        )
    
    # Explicitly delete child notes and exercises
    from app.models.db import Note, Exercise
    db.query(Note).filter(Note.subject_id == subject_id, Note.user_id == current_user.id).delete()
    db.query(Exercise).filter(Exercise.subject_id == subject_id, Exercise.user_id == current_user.id).delete()
    
    db.delete(db_subject)
    db.commit()
    
    # Clear cache
    clear_cache_pattern_sync(f"cache_resp:/subjects*:u{current_user.id}*")
    
    return None
