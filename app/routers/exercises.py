"""Exercises management endpoints"""
import os
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid

from app.models.db import User, Exercise, ExerciseQuestion, Subject, Task
from app.schemas.exercise import ExerciseResponse, ExerciseCreate, ExerciseUpdate, ExerciseCheckRequest, ExerciseCheckResponse, ExerciseExplainRequest, ExerciseGenerateRequest
from app.utils.auth import get_current_user
from app.utils.db import get_db, generate_random_id, SessionLocal
from app.utils.tasks import TaskManager
from app.processing.exercise_processor import process_exercise_task, grade_answer, explain_answer, generate_exercise_task

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/exercises",
    tags=["exercises"],
    responses={401: {"description": "Unauthorized"}}
)

@router.get("/subject/{subject_id}", response_model=List[ExerciseResponse])
def get_exercises_by_subject(subject_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get all exercises for a subject"""
    exercises = db.query(Exercise).filter(
        Exercise.subject_id == subject_id,
        Exercise.user_id == current_user.id
    ).all()
    return exercises

@router.get("/{exercise_id}", response_model=ExerciseResponse)
def get_exercise(exercise_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get specific exercise"""
    exercise = db.query(Exercise).filter(
        Exercise.id == exercise_id,
        Exercise.user_id == current_user.id
    ).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    return exercise

@router.post("/upload", response_model=ExerciseResponse)
def upload_exercise(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    subject_id: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Upload a file to process into an exercise"""
    subject = db.query(Subject).filter(Subject.id == subject_id, Subject.user_id == current_user.id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    # Save file
    file_id = f"ex_{generate_random_id(db, Exercise)}"
    ext = os.path.splitext(file.filename)[1].lower() if file.filename else ""
    user_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", f"user_{current_user.id}")
    os.makedirs(user_dir, exist_ok=True)
    file_path = os.path.join(user_dir, f"{file_id}{ext}")
    
    with open(file_path, "wb") as buffer:
        buffer.write(file.file.read())

    exercise = Exercise(
        id=file_id,
        user_id=current_user.id,
        subject_id=subject_id,
        group_id=subject.group_id,
        title=file.filename or "Uploaded Exercise",
        file_path=file_path,
        file_name=file.filename
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)

    # Launch background task to process the file and extract questions
    task_id = f"extract_ex_{file_id}"
    TaskManager.submit_task(
        task_id=task_id,
        user_id=current_user.id,
        task_type="exercise_extraction",
        exercise_id=file_id
    )
    
    background_tasks.add_task(process_exercise_task, exercise_id=file_id, user_id=current_user.id, task_id=task_id)
    
    return exercise

@router.post("/merge", response_model=ExerciseResponse)
def merge_exercises(
    exercise_ids: List[str],
    title: str = "Merged Exercise",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Merge multiple exercises into a new one"""
    if not exercise_ids:
        raise HTTPException(status_code=400, detail="No exercises provided")
        
    exercises = db.query(Exercise).filter(
        Exercise.id.in_(exercise_ids),
        Exercise.user_id == current_user.id
    ).all()
    
    if not exercises:
        raise HTTPException(status_code=404, detail="Exercises not found")
        
    subject_id = exercises[0].subject_id
    
    new_ex_id = f"ex_{generate_random_id(db, Exercise)}"
    new_ex = Exercise(
        id=new_ex_id,
        user_id=current_user.id,
        subject_id=subject_id,
        title=title,
        group_id=exercises[0].group_id
    )
    db.add(new_ex)
    
    order = 0
    for ex in exercises:
        for q in ex.questions:
            new_q = ExerciseQuestion(
                exercise_id=new_ex_id,
                question_text=q.question_text,
                answer_text=q.answer_text,
                question_type=q.question_type,
                options=q.options,
                original_number=q.original_number,
                order=order,
                explanation=q.explanation,
                reference_note_id=q.reference_note_id
            )
            db.add(new_q)
            order += 1
            
    db.commit()
    db.refresh(new_ex)
    return new_ex

@router.post("/questions/{question_id}/grade", response_model=ExerciseCheckResponse)
def grade_exercise_answer(
    question_id: int,
    req: ExerciseCheckRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Grade a subjective or coding answer using AI"""
    question = db.query(ExerciseQuestion).join(Exercise).filter(
        ExerciseQuestion.id == question_id,
        Exercise.user_id == current_user.id
    ).first()
    
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    # Standard string match fallback for objective
    if question.question_type == "objective":
        is_correct = req.user_answer.strip().lower() == question.answer_text.strip().lower()
        return ExerciseCheckResponse(
            is_correct=is_correct,
            feedback="Correct!" if is_correct else "Incorrect.",
            correct_answer=question.answer_text
        )
        
    # Use AI to grade
    return grade_answer(current_user, question, req.user_answer)

@router.post("/questions/{question_id}/explain")
def explain_exercise_answer(
    question_id: int,
    req: ExerciseExplainRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate an AI explanation for the question"""
    question = db.query(ExerciseQuestion).join(Exercise).filter(
        ExerciseQuestion.id == question_id,
        Exercise.user_id == current_user.id
    ).first()
    
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    explanation = explain_answer(current_user, question, req.user_answer)
    question.explanation = explanation
    db.commit()
    
    return {"explanation": explanation}

@router.delete("/{exercise_id}")
def delete_exercise(exercise_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete an exercise"""
    exercise = db.query(Exercise).filter(
        Exercise.id == exercise_id,
        Exercise.user_id == current_user.id
    ).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
        
    if exercise.file_path and os.path.exists(exercise.file_path):
        try:
            os.remove(exercise.file_path)
        except:
            pass
            
    db.delete(exercise)
    db.commit()
    return {"status": "success"}

@router.post("/generate", response_model=ExerciseResponse)
def generate_exercise(
    req: ExerciseGenerateRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Generate an exercise using AI from resources"""
    subject = db.query(Subject).filter(Subject.id == req.subject_id, Subject.user_id == current_user.id).first()
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    file_id = f"ex_{generate_random_id(db, Exercise)}"
    
    exercise = Exercise(
        id=file_id,
        user_id=current_user.id,
        subject_id=req.subject_id,
        group_id=subject.group_id,
        title="Generated Exercise",
        model="gemini-2.5-pro",
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)

    task_id = f"generate_ex_{file_id}"
    TaskManager.submit_task(
        task_id=task_id,
        user_id=current_user.id,
        task_type="exercise_generation",
        exercise_id=file_id,
        req=req.dict()
    )
    
    background_tasks.add_task(generate_exercise_task, exercise_id=file_id, user_id=current_user.id, req_data=req.dict(), task_id=task_id)
    
    return exercise
