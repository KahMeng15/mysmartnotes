"""Study sessions tracking endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from app.models.db import User, StudySession, Lecture
from app.utils.auth import get_current_user
from app.utils.db import get_db

router = APIRouter(prefix="/study-sessions", tags=["study-sessions"])


class StudySessionCreate(BaseModel):
    lecture_id: int
    session_type: str  # "quiz", "flashcard", "reading"
    duration_minutes: int
    questions_attempted: int = 0
    questions_correct: int = 0
    score: Optional[float] = None


class StudySessionResponse(BaseModel):
    id: int
    lecture_id: int
    session_type: str
    duration_minutes: int
    questions_attempted: int
    questions_correct: int
    score: Optional[float]
    created_at: datetime
    
    class Config:
        from_attributes = True


class StudySessionStats(BaseModel):
    total_sessions: int
    total_study_time: int  # minutes
    average_session_duration: float
    total_questions_attempted: int
    total_questions_correct: int
    average_accuracy: float


@router.get("", response_model=List[StudySessionResponse])
async def get_study_sessions(
    lecture_id: int = None,
    session_type: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get study sessions for the current user"""
    
    query = db.query(StudySession).filter(StudySession.user_id == current_user.id)
    
    if lecture_id:
        query = query.filter(StudySession.lecture_id == lecture_id)
    
    if session_type:
        query = query.filter(StudySession.session_type == session_type)
    
    sessions = query.order_by(StudySession.created_at.desc()).all()
    return sessions


@router.post("", response_model=StudySessionResponse, status_code=status.HTTP_201_CREATED)
async def create_study_session(
    session: StudySessionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new study session record"""
    
    # Verify lecture belongs to user
    lecture = db.query(Lecture).filter(
        Lecture.id == session.lecture_id,
        Lecture.user_id == current_user.id
    ).first()
    
    if not lecture:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lecture not found"
        )
    
    # Calculate score if questions attempted
    score = None
    if session.questions_attempted > 0:
        score = (session.questions_correct / session.questions_attempted) * 100
    
    db_session = StudySession(
        user_id=current_user.id,
        lecture_id=session.lecture_id,
        session_type=session.session_type,
        duration_minutes=session.duration_minutes,
        questions_attempted=session.questions_attempted,
        questions_correct=session.questions_correct,
        score=score or session.score
    )
    
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session


@router.get("/stats", response_model=StudySessionStats)
async def get_study_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get study statistics for the current user"""
    
    sessions = db.query(StudySession).filter(
        StudySession.user_id == current_user.id
    ).all()
    
    if not sessions:
        return StudySessionStats(
            total_sessions=0,
            total_study_time=0,
            average_session_duration=0.0,
            total_questions_attempted=0,
            total_questions_correct=0,
            average_accuracy=0.0
        )
    
    total_time = sum(s.duration_minutes for s in sessions)
    total_questions = sum(s.questions_attempted for s in sessions)
    total_correct = sum(s.questions_correct for s in sessions)
    
    average_accuracy = (total_correct / total_questions * 100) if total_questions > 0 else 0.0
    average_session = total_time / len(sessions) if sessions else 0.0
    
    return StudySessionStats(
        total_sessions=len(sessions),
        total_study_time=total_time,
        average_session_duration=average_session,
        total_questions_attempted=total_questions,
        total_questions_correct=total_correct,
        average_accuracy=average_accuracy
    )


@router.get("/{session_id}", response_model=StudySessionResponse)
async def get_study_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific study session"""
    
    session = db.query(StudySession).filter(
        StudySession.id == session_id,
        StudySession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study session not found"
        )
    
    return session


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_study_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a study session"""
    
    session = db.query(StudySession).filter(
        StudySession.id == session_id,
        StudySession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Study session not found"
        )
    
    db.delete(session)
    db.commit()
    return None
