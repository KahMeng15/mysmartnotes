"""Analytics and statistics endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from app.utils.cache import cache_response
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List
from datetime import datetime, timedelta

from app.models.db import User, Lecture, StudySession, Subject, ChatMessage
from app.utils.auth import get_current_user
from app.utils.db import get_db
from app.schemas.analytics import DashboardSummary

router = APIRouter(prefix="/analytics", tags=["analytics"])


class ProgressStat(BaseModel):
    lecture_id: str
    lecture_title: str
    completion_percentage: float


class TimeSpentStat(BaseModel):
    lecture_id: str
    lecture_title: str
    total_minutes: float
    sessions_count: int


class CompletionStat(BaseModel):
    lecture_title: str
    completion_percentage: float
    status: str  # not_started, in_progress, completed


class ProgressResponse(BaseModel):
    total_lectures: int
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
@cache_response(ttl=300)
async def get_learning_progress(
    request: Request,
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
            overall_completion=0.0,
            by_lecture=[]
        )
    
    by_lecture = []
    total_completion = 0
    
    for lecture in lectures:
        # Placeholder completion logic since standalone flashcards are removed
        has_summary = lecture.summaries is not None and len(lecture.summaries) > 0
        completion_pct = 100.0 if has_summary else 0.0
        
        by_lecture.append(ProgressStat(
            lecture_id=lecture.id,
            lecture_title=lecture.title,
            completion_percentage=completion_pct
        ))
        
        total_completion += completion_pct
    
    overall_completion = (total_completion / len(lectures)) if lectures else 0
    
    return ProgressResponse(
        total_lectures=len(lectures),
        overall_completion=overall_completion,
        by_lecture=by_lecture
    )


@router.get("/time-spent", response_model=TimeSpentResponse)
@cache_response(ttl=300)
async def get_time_spent_analytics(
    request: Request,
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
@cache_response(ttl=300)
async def get_completion_rates(
    request: Request,
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
        # Placeholder completion logic since standalone flashcards are removed
        has_summary = lecture.summaries is not None and len(lecture.summaries) > 0
        completion_pct = 100.0 if has_summary else 0.0
        
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


@router.get("/dashboard-summary", response_model=DashboardSummary)
@cache_response(ttl=300)
async def get_dashboard_summary(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get summarized dashboard statistics (last 7 days)"""
    from sqlalchemy import func
    
    # 1. Totals
    total_subjects = db.query(func.count(Subject.id)).filter(Subject.user_id == current_user.id).scalar() or 0
    total_notes = db.query(func.count(Lecture.id)).filter(Lecture.user_id == current_user.id).scalar() or 0
    
    # 2. Last 7 Days Range
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    
    # 3. Questions Asked (ChatMessage records)
    questions_7d = db.query(func.count(ChatMessage.id)).filter(
        ChatMessage.user_id == current_user.id,
        ChatMessage.created_at >= seven_days_ago
    ).scalar() or 0
    
    # 4. Study Time (StudySession durations)
    study_time_7d = db.query(func.sum(StudySession.duration_minutes)).filter(
        StudySession.user_id == current_user.id,
        StudySession.created_at >= seven_days_ago
    ).scalar() or 0
    
    return DashboardSummary(
        total_subjects=total_subjects,
        total_notes=total_notes,
        questions_asked_7d=questions_7d,
        study_time_7d_mins=int(study_time_7d)
    )
