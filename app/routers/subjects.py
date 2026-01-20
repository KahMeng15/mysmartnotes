"""Subjects management endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.models.db import User, Subject
from app.schemas.schemas import SubjectCreate, SubjectUpdate, SubjectResponse
from app.utils.auth import get_current_user
from app.utils.db import get_db

router = APIRouter(prefix="/subjects", tags=["subjects"])


@router.get("", response_model=List[SubjectResponse])
async def get_subjects(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all subjects for the current user"""
    subjects = db.query(Subject).filter(Subject.user_id == current_user.id).all()
    return subjects


@router.post("", response_model=SubjectResponse, status_code=status.HTTP_201_CREATED)
async def create_subject(
    subject: SubjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new subject"""
    # Check if subject already exists
    existing = db.query(Subject).filter(
        Subject.user_id == current_user.id,
        Subject.name == subject.name
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject already exists"
        )
    
    db_subject = Subject(
        name=subject.name,
        description=subject.description,
        color=subject.color,
        user_id=current_user.id
    )
    db.add(db_subject)
    db.commit()
    db.refresh(db_subject)
    return db_subject


@router.put("/{subject_id}", response_model=SubjectResponse)
async def update_subject(
    subject_id: int,
    subject: SubjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a subject"""
    db_subject = db.query(Subject).filter(
        Subject.id == subject_id,
        Subject.user_id == current_user.id
    ).first()
    
    if not db_subject:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Subject not found"
        )
    
    # Check for duplicate name
    if subject.name:
        existing = db.query(Subject).filter(
            Subject.user_id == current_user.id,
            Subject.name == subject.name,
            Subject.id != subject_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Subject name already exists"
            )
    
    update_data = subject.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_subject, field, value)
    
    db.commit()
    db.refresh(db_subject)
    return db_subject


@router.delete("/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_subject(
    subject_id: int,
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
    
    db.delete(db_subject)
    db.commit()
    return None
