"""Flashcards management endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional

from app.models.db import User, Flashcard, Lecture
from app.utils.auth import get_current_user
from app.utils.db import get_db

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


class FlashcardBase(BaseModel):
    question: str
    answer: str
    difficulty: str = "medium"


class FlashcardCreate(FlashcardBase):
    lecture_id: int


class FlashcardUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    difficulty: Optional[str] = None


class FlashcardResponse(FlashcardBase):
    id: int
    lecture_id: int
    times_reviewed: int
    times_correct: int
    
    class Config:
        from_attributes = True


class FlashcardReviewRequest(BaseModel):
    correct: bool


@router.get("", response_model=List[FlashcardResponse])
async def get_flashcards(
    lecture_id: int = None,
    subject_id: int = None,
    difficulty: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get flashcards, optionally filtered by lecture or difficulty"""
    
    query = db.query(Flashcard).join(Lecture).filter(
        Lecture.user_id == current_user.id
    )
    
    if lecture_id:
        query = query.filter(Flashcard.lecture_id == lecture_id)
    
    if difficulty:
        query = query.filter(Flashcard.difficulty == difficulty)
    
    flashcards = query.all()
    return flashcards


@router.post("", response_model=FlashcardResponse, status_code=status.HTTP_201_CREATED)
async def create_flashcard(
    flashcard: FlashcardCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new flashcard"""
    
    # Verify lecture belongs to user
    lecture = db.query(Lecture).filter(
        Lecture.id == flashcard.lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
    db_flashcard = Flashcard(
        lecture_id=flashcard.lecture_id,
        question=flashcard.question,
        answer=flashcard.answer,
        difficulty=flashcard.difficulty,
        times_reviewed=0,
        times_correct=0
    )
    
    db.add(db_flashcard)
    db.commit()
    db.refresh(db_flashcard)
    return db_flashcard


@router.get("/{flashcard_id}", response_model=FlashcardResponse)
async def get_flashcard(
    flashcard_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific flashcard"""
    
    flashcard = db.query(Flashcard).join(Lecture).filter(
        Flashcard.id == flashcard_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not flashcard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flashcard not found"
        )
    
    return flashcard


@router.put("/{flashcard_id}", response_model=FlashcardResponse)
async def update_flashcard(
    flashcard_id: int,
    update: FlashcardUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a flashcard"""
    
    flashcard = db.query(Flashcard).join(Lecture).filter(
        Flashcard.id == flashcard_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not flashcard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flashcard not found"
        )
    
    update_data = update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(flashcard, field, value)
    
    db.commit()
    db.refresh(flashcard)
    return flashcard


@router.post("/{flashcard_id}/review", response_model=FlashcardResponse)
async def review_flashcard(
    flashcard_id: int,
    request: FlashcardReviewRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mark flashcard as reviewed"""
    
    flashcard = db.query(Flashcard).join(Lecture).filter(
        Flashcard.id == flashcard_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not flashcard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flashcard not found"
        )
    
    flashcard.times_reviewed += 1
    if request.correct:
        flashcard.times_correct += 1
    
    db.commit()
    db.refresh(flashcard)
    return flashcard


@router.delete("/{flashcard_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flashcard(
    flashcard_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a flashcard"""
    
    flashcard = db.query(Flashcard).join(Lecture).filter(
        Flashcard.id == flashcard_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not flashcard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Flashcard not found"
        )
    
    db.delete(flashcard)
    db.commit()
    return None
