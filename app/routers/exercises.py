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
from app.config import get_settings
from app.utils.tasks import TaskManager
from app.utils.storage import StorageManager
from app.processing.exercise_processor import process_exercise_task, grade_answer, explain_answer, generate_exercise_task
from app.processing.document_generator import ContentSegment, ContentType
import uuid
import os

_export_progress = {}

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
    ).order_by(Exercise.created_at.desc()).all()
    
    response_exercises = []
    for ex in exercises:
        ex_data = ExerciseResponse.from_orm(ex)
        params = StorageManager.get_resource_json(ex.id, "parameters")
        if params:
            ex_data.parameters = params
        response_exercises.append(ex_data)
    return response_exercises

@router.get("/{exercise_id}", response_model=ExerciseResponse)
def get_exercise(exercise_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Get specific exercise"""
    exercise = db.query(Exercise).filter(
        Exercise.id == exercise_id,
        Exercise.user_id == current_user.id
    ).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
        
    ex_data = ExerciseResponse.from_orm(exercise)
    params = StorageManager.get_resource_json(exercise.id, "parameters")
    if params:
        ex_data.parameters = params
    return ex_data

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
        exercise_id=file_id,
        title=exercise.title
    )
    
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
    
    title = req.title.strip() if req.title and req.title.strip() else None
    if not title:
        if req.resource_ids:
            from app.models.db import Resource
            resources = db.query(Resource).filter(Resource.id.in_(req.resource_ids)).all()
            titles = [r.title for r in resources if r.title]
            if len(titles) > 2:
                base_title = f"{titles[0]} + {len(titles)-1} others Exercise"
            elif titles:
                base_title = f"{' & '.join(titles)} Exercise"
            else:
                base_title = "Generated Exercise"
        else:
            base_title = "Generated Exercise"
            
        import re
        existing_exs = db.query(Exercise).filter(
            Exercise.subject_id == req.subject_id,
            Exercise.user_id == current_user.id,
            Exercise.title.like(f"{base_title}%")
        ).all()
        
        if existing_exs:
            max_counter = 0
            for ex in existing_exs:
                if ex.title == base_title:
                    max_counter = max(max_counter, 1)
                else:
                    m = re.search(r' (\d+)$', ex.title)
                    if m:
                        max_counter = max(max_counter, int(m.group(1)))
            if max_counter > 0:
                title = f"{base_title} {max_counter + 1}"
            else:
                title = base_title
        else:
            title = base_title

    exercise = Exercise(
        id=file_id,
        user_id=current_user.id,
        subject_id=req.subject_id,
        group_id=subject.group_id,
        title=title,
        model=current_user.ai_model or get_settings().GLOBAL_AI_TIER1_MODEL,
    )
    db.add(exercise)
    db.commit()
    db.refresh(exercise)

    db.refresh(exercise)

    StorageManager.save_resource_json(file_id, "parameters", req.dict())

    task_id = f"generate_ex_{file_id}"
    TaskManager.submit_task(
        task_id=task_id,
        user_id=current_user.id,
        task_type="exercise_generation",
        exercise_id=file_id,
        req_data=req.dict(),
        title=title
    )
    
    ex_data = ExerciseResponse.from_orm(exercise)
    ex_data.parameters = req.dict()
    return ex_data

@router.patch("/{exercise_id}/rename", response_model=ExerciseResponse)
def rename_exercise(
    exercise_id: str,
    req: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    exercise = db.query(Exercise).filter(
        Exercise.id == exercise_id,
        Exercise.user_id == current_user.id
    ).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
    
    if "title" in req:
        exercise.title = req["title"]
        db.commit()
        db.refresh(exercise)
    
    ex_data = ExerciseResponse.from_orm(exercise)
    params = StorageManager.get_resource_json(exercise.id, "parameters")
    if params:
        ex_data.parameters = params
    return ex_data

@router.post("/{exercise_id}/reprocess", response_model=ExerciseResponse)
def reprocess_exercise(
    exercise_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    exercise = db.query(Exercise).filter(
        Exercise.id == exercise_id,
        Exercise.user_id == current_user.id
    ).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
        
    params = StorageManager.get_resource_json(exercise.id, "parameters")
    
    # Based on whether it's an uploaded file or generated
    if exercise.file_path and os.path.exists(exercise.file_path):
        task_id = f"extract_ex_{exercise_id}"
        TaskManager.submit_task(
            task_id=task_id,
            user_id=current_user.id,
            task_type="exercise_extraction",
            exercise_id=exercise_id,
            title=exercise.title
        )
    elif params:
        task_id = f"generate_ex_{exercise_id}"
        TaskManager.submit_task(
            task_id=task_id,
            user_id=current_user.id,
            task_type="exercise_generation",
            exercise_id=exercise_id,
            req_data=params,
            title=exercise.title
        )
    else:
        raise HTTPException(status_code=400, detail="Cannot reprocess: missing file or generation parameters")
        
    ex_data = ExerciseResponse.from_orm(exercise)
    if params:
        ex_data.parameters = params
    return ex_data

@router.get("/{exercise_id}/processing-logs")
async def get_exercise_processing_logs(
    exercise_id: str,
    limit: int = 200,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    exercise = db.query(Exercise).filter(
        Exercise.id == exercise_id,
        Exercise.user_id == current_user.id
    ).first()

    if not exercise:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exercise not found"
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
            max_bytes = 5 * 1024 * 1024
            with open(log_path, "r", encoding="utf-8", errors="replace") as f:
                f.seek(0, 2)
                file_size = f.tell()
                start = max(0, file_size - max_bytes)
                f.seek(start)
                if start > 0:
                    f.readline()
                lines = f.readlines()

            for line in lines:
                if exercise_id not in line:
                    continue
                if "uvicorn.access" in line:
                    continue
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
                        "timestamp": "",
                        "level": "INFO",
                        "logger": "unknown",
                        "message": line.strip(),
                        "source": log_file,
                    })
        except Exception as e:
            logger.error(f"Error reading {log_file}: {e}")

    # sort newest first
    entries.sort(key=lambda x: x["timestamp"], reverse=True)
    if limit > 0:
        entries = entries[:limit]

    return {"entries": entries}

@router.post("/{exercise_id}/export", response_model=dict)
async def export_exercise(
    exercise_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export an exercise to PDF or DOCX using DocumentGenerator"""
    logger.info(f"[Export] Received request for exercise {exercise_id} with body: {body}")
    task_id = str(uuid.uuid4())[:8]
    _export_progress[task_id] = {"step": "Starting", "percent": 0, "status": "running"}
    
    def progress_callback(step, percent):
        _export_progress[task_id] = {"step": step, "percent": percent, "status": "running" if percent < 100 else "complete"}
    
    export_format = body.get("format", "pdf").lower()
    if export_format not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="Format must be 'pdf' or 'docx'")
        
    include_cover = body.get("include_cover", True)
    template_id = body.get("template_id", None)
    
    exercise = db.query(Exercise).filter(Exercise.id == exercise_id, Exercise.user_id == current_user.id).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
        
    questions = db.query(ExerciseQuestion).filter(ExerciseQuestion.exercise_id == exercise.id).order_by(ExerciseQuestion.order).all()
    if not questions:
        raise HTTPException(status_code=400, detail="Exercise has no questions to export.")
        
    template_config = None
    if template_id:
        from app.models.db import ExportTemplate
        tmpl = db.query(ExportTemplate).filter(
            ExportTemplate.id == template_id,
            (ExportTemplate.user_id == current_user.id) | (ExportTemplate.user_id.is_(None))
        ).first()
        if tmpl:
            template_config = tmpl.config

    segments = []
    
    if template_config and "header" in template_config:
        h_cfg = template_config["header"]
        if h_cfg.get("show_note_title"):
            segments.append(ContentSegment(content=exercise.title, content_type=ContentType.NOTE_TITLE, page_number=1))
            
    import json
    for i, q in enumerate(questions):
        q_text = f"**Q{i+1}:** {q.question_text}"
        segments.append(ContentSegment(content=q_text, content_type=ContentType.H3, page_number=1))
        
        if q.question_type == "objective" and q.options:
            try:
                opts = json.loads(q.options) if isinstance(q.options, str) else q.options
                for opt in opts:
                    segments.append(ContentSegment(content=f"- {opt}", content_type=ContentType.LIST, page_number=1))
            except:
                pass
                
        ans_text = f"**Answer:** {q.answer_text}"
        segments.append(ContentSegment(content="", content_type=ContentType.BODY, page_number=1))
        segments.append(ContentSegment(content=ans_text, content_type=ContentType.BODY, page_number=1))
        segments.append(ContentSegment(content="", content_type=ContentType.BODY, page_number=1))

    try:
        from app.routers.processing import GENERATED_DIR
        safe_title = "".join(c for c in exercise.title if c.isalnum() or c in (' ', '-', '_')).strip()
        
        if export_format == "pdf":
            from app.processing.document_generator import DocumentGenerator
            generator = DocumentGenerator(
                lecture_id=exercise.id,
                lecture_title=f"Exercise: {exercise.title}",
                base_output_dir=GENERATED_DIR,
            )
            output_path = generator.generate_pdf(
                content_segments=segments,
                extracted_images=[],
                include_toc=False,
                include_cover=include_cover,
                template_config=template_config,
                progress_callback=progress_callback,
            )
        else:
            from app.processing.docx_generator import DocxGenerator
            generator = DocxGenerator(
                lecture_id=exercise.id,
                lecture_title=f"Exercise: {exercise.title}",
                base_output_dir=GENERATED_DIR,
            )
            output_path = generator.generate_docx(
                content_segments=segments,
                extracted_images=[],
                include_toc=False,
                include_cover=include_cover,
                template_config=template_config,
                progress_callback=progress_callback,
            )
            
        _export_progress[task_id] = {
            "step": "Complete", 
            "percent": 100, 
            "status": "complete", 
            "output_path": output_path
        }
        
        return {
            "success": True,
            "message": f"{export_format.upper()} generated successfully",
            "download_url": f"/exercises/{exercise.id}/download-export?format={export_format}&task_id={task_id}",
            "task_id": task_id,
            "segments_count": len(segments),
            "images_count": 0
        }
    except Exception as e:
        logger.error(f"Error exporting {export_format}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{exercise_id}/export-status/{task_id}")
async def get_export_status(
    exercise_id: str,
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    progress = _export_progress.get(task_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Task not found")
    return progress

@router.get("/{exercise_id}/download-export")
async def download_export(
    exercise_id: str,
    task_id: str,
    format: str = "pdf",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    from fastapi.responses import FileResponse
    export_format = format.lower()
    exercise = db.query(Exercise).filter(Exercise.id == exercise_id, Exercise.user_id == current_user.id).first()
    if not exercise:
        raise HTTPException(status_code=404, detail="Exercise not found")
        
    progress = _export_progress.get(task_id)
    if not progress or "output_path" not in progress:
        raise HTTPException(status_code=404, detail="Export not ready or task not found")
        
    output_path = progress["output_path"]
    if not os.path.exists(output_path):
        raise HTTPException(status_code=404, detail=f"{export_format.upper()} file not found.")
        
    safe_title = "".join(c for c in exercise.title if c.isalnum() or c in (' ', '-', '_')).strip()
    
    mime_types = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    
    return FileResponse(
        path=output_path,
        filename=f"{safe_title}.{export_format}",
        media_type=mime_types.get(export_format, "application/octet-stream"),
    )
