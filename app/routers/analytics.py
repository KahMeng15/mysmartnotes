"""Analytics and statistics endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from datetime import datetime, timedelta

from app.models.db import User, Lecture, Flashcard, StudySession
from app.utils.auth import get_current_user
from app.utils.db import get_db

router = APIRouter(prefix="/analytics", tags=["analytics"])


class ProgressStat(BaseModel):
    lecture_id: int
    lecture_title: str
    completion_percentage: float
    flashcards_studied: int
    total_flashcards: int


class TimeSpentStat(BaseModel):
    lecture_id: int
    lecture_title: str
    total_minutes: float
    sessions_count: int


class CompletionStat(BaseModel):
    lecture_title: str
    completion_percentage: float
    status: str  # not_started, in_progress, completed


class ProgressResponse(BaseModel):
    total_lectures: int
    total_flashcards: int
    total_studied: int
    overall_completion: float
    by_lecture: List[ProgressStat]


class TimeSpentResponse(BaseModel):
    total_study_time_minutes: float
    average_session_minutes: float
    total_sessions: int
    by_lecture: List[TimeSpentStat]


class CompletionResponse(BaseModel):
    completed_count: int
    in_progress_count: int
    not_started_count: int
    completion_rates: List[CompletionStat]


@router.get("/progress", response_model=ProgressResponse)
async def get_learning_progress(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get learning progress statistics"""
    lectures = db.query(Lecture).filter(
        Lecture.user_id == current_user.id
    ).all()
    
    if not lectures:
        return ProgressResponse(
            total_lectures=0,
            total_flashcards=0,
            total_studied=0,
            overall_completion=0.0,
            by_lecture=[]
        )
    
    by_lecture = []
    total_studied = 0
    total_flashcards = 0
    
    for lecture in lectures:
        flashcards = db.query(Flashcard).filter(
            Flashcard.lecture_id == lecture.id
        ).all()
        
        studied = sum(1 for fc in flashcards if fc.is_reviewed)
        total = len(flashcards)
        completion_pct = (studied / total * 100) if total > 0 else 0
        
        by_lecture.append(ProgressStat(
            lecture_id=lecture.id,
            lecture_title=lecture.title,
            completion_percentage=completion_pct,
            flashcards_studied=studied,
            total_flashcards=total
        ))
        
        total_studied += studied
        total_flashcards += total
    
    overall_completion = (total_studied / total_flashcards * 100) if total_flashcards > 0 else 0
    
    return ProgressResponse(
        total_lectures=len(lectures),
        total_flashcards=total_flashcards,
        total_studied=total_studied,
        overall_completion=overall_completion,
        by_lecture=by_lecture
    )


@router.get("/time-spent", response_model=TimeSpentResponse)
async def get_time_spent_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get time spent on study sessions"""
    sessions = db.query(StudySession).filter(
        StudySession.user_id == current_user.id
    ).all()
    
    if not sessions:
        return TimeSpentResponse(
            total_study_time_minutes=0.0,
            average_session_minutes=0.0,
            total_sessions=0,
            by_lecture=[]
        )
    
    # Group by lecture
    by_lecture_dict = {}
    total_minutes = 0
    
    for session in sessions:
        duration_minutes = session.duration_minutes or 0
        total_minutes += duration_minutes
        
        if session.lecture_id not in by_lecture_dict:
            by_lecture_dict[session.lecture_id] = {
                "lecture_title": db.query(Lecture).get(session.lecture_id).title,
                "total_minutes": 0,
                "sessions_count": 0
            }
        
        by_lecture_dict[session.lecture_id]["total_minutes"] += duration_minutes
        by_lecture_dict[session.lecture_id]["sessions_count"] += 1
    
    by_lecture = [
        TimeSpentStat(
            lecture_id=lecture_id,
            lecture_title=data["lecture_title"],
            total_minutes=data["total_minutes"],
            sessions_count=data["sessions_count"]
        )
        for lecture_id, data in by_lecture_dict.items()
    ]
    
    average_minutes = (total_minutes / len(sessions)) if sessions else 0
    
    return TimeSpentResponse(
        total_study_time_minutes=total_minutes,
        average_session_minutes=average_minutes,
        total_sessions=len(sessions),
        by_lecture=by_lecture
    )


@router.get("/completion", response_model=CompletionResponse)
async def get_completion_rates(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get completion rates for lectures"""
    lectures = db.query(Lecture).filter(
        Lecture.user_id == current_user.id
    ).all()
    
    if not lectures:
        return CompletionResponse(
            completed_count=0,
            in_progress_count=0,
            not_started_count=0,
            completion_rates=[]
        )
    
    completed_count = 0
    in_progress_count = 0
    not_started_count = 0
    completion_rates = []
    
    for lecture in lectures:
        flashcards = db.query(Flashcard).filter(
            Flashcard.lecture_id == lecture.id
        ).all()
        
        if not flashcards:
            status = "not_started"
            not_started_count += 1
            completion_pct = 0.0
        else:
            studied = sum(1 for fc in flashcards if fc.is_reviewed)
            total = len(flashcards)
            completion_pct = (studied / total * 100) if total > 0 else 0
            
            if completion_pct == 0:
                status = "not_started"
                not_started_count += 1
            elif completion_pct >= 100:
                status = "completed"
                completed_count += 1
            else:
                status = "in_progress"
                in_progress_count += 1
        
        completion_rates.append(CompletionStat(
            lecture_title=lecture.title,
            completion_percentage=completion_pct,
            status=status
        ))
    
    return CompletionResponse(
        completed_count=completed_count,
        in_progress_count=in_progress_count,
        not_started_count=not_started_count,
        completion_rates=completion_rates
    )
