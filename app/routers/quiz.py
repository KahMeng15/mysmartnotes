from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import List, Optional
from datetime import datetime
import json
import os
import uuid
import logging
import time

logger = logging.getLogger(__name__)

from app.models.db import User, Quiz, QuizQuestion, Subject, Note, QuizProgress, Summary, SubjectGroup, QuizGroup
from app.utils.auth import get_current_user
from app.utils.db import get_db, generate_random_id
from app.utils.tasks import TaskManager
from app.utils.quotas import enforce_quota_quizzes
from app.schemas.quiz import (
    QuizCreate, QuizUpdate, QuizResponse, QuizQuestionCreate, QuizQuestionResponse,
    QuizQuestionUpdate,
    QuizGenerateRequest, QuizCheckRequest, QuizCheckResponse, SingleQuestionGenerateRequest,
    QuizGroupCreate, QuizGroupResponse, QuizExplainRequest, BulkQuizUpdate
)
from app.processing.ai_client import AIClient, get_ai_client
from app.processing.quiz_generator import (
    generate_advanced_quiz, check_semantic_answer, generate_single_question,
    import_quiz_from_content, extract_text_from_upload
)
from app.processing.text_processor import ContentSegment, ContentType

router = APIRouter(
    prefix="/quizzes",
    tags=["quizzes"]
)

# In-memory export progress tracking
_export_progress = {}

@router.get("", response_model=List[QuizResponse])
def get_quizzes(
    q: Optional[str] = None,
    quiz_group_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all quizzes for current user with optional search and group filtering."""
    query = db.query(Quiz).filter(Quiz.user_id == current_user.id)
    
    if quiz_group_id is not None:
        if quiz_group_id == "":
            query = query.filter(Quiz.quiz_group_id == None)
        else:
            query = query.filter(Quiz.quiz_group_id == quiz_group_id)
        
    if q:
        search_filter = or_(
            Quiz.title.ilike(f"%{q}%"),
            Quiz.questions.any(QuizQuestion.question_text.ilike(f"%{q}%")),
            Quiz.questions.any(QuizQuestion.answer_text.ilike(f"%{q}%")),
            # Note info
            Quiz.note.has(Note.title.ilike(f"%{q}%")),
            Quiz.subject.has(Subject.name.ilike(f"%{q}%")),
            Quiz.group.has(SubjectGroup.name.ilike(f"%{q}%"))
        )
        query = query.filter(search_filter)
        
    quizzes = query.order_by(Quiz.created_at.desc()).all()
    return quizzes

@router.get("/groups", response_model=List[QuizGroupResponse])
def get_quiz_groups(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all quiz groups for current user."""
    return db.query(QuizGroup).filter(QuizGroup.user_id == current_user.id).all()

@router.post("/groups", response_model=QuizGroupResponse)
def create_quiz_group(
    group_in: QuizGroupCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new quiz group."""
    group = QuizGroup(
        id=generate_random_id(db, QuizGroup),
        user_id=current_user.id,
        name=group_in.name
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return group

@router.put("/groups/{group_id}", response_model=QuizGroupResponse)
def update_quiz_group(
    group_id: str,
    group_in: QuizGroupCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a quiz group name."""
    group = db.query(QuizGroup).filter(QuizGroup.id == group_id, QuizGroup.user_id == current_user.id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    group.name = group_in.name
    db.commit()
    db.refresh(group)
    return group

@router.delete("/groups/{group_id}")
def delete_quiz_group(
    group_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a quiz group."""
    group = db.query(QuizGroup).filter(QuizGroup.id == group_id, QuizGroup.user_id == current_user.id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    db.delete(group)
    db.commit()
    return {"success": True}

@router.put("/{quiz_id}/move")
def move_quiz(
    quiz_id: str,
    quiz_group_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Move a quiz to a different group (or remove from group)."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    if quiz_group_id:
        group = db.query(QuizGroup).filter(QuizGroup.id == quiz_group_id, QuizGroup.user_id == current_user.id).first()
        if not group:
            raise HTTPException(status_code=404, detail="Quiz Group not found")
            
    quiz.quiz_group_id = quiz_group_id
    db.commit()
    return {"success": True}

@router.post("", response_model=QuizResponse)
def create_quiz(
    quiz_in: QuizCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a manual quiz."""
    quiz = Quiz(
        id=generate_random_id(db, Quiz),
        user_id=current_user.id,
        title=quiz_in.title,
        scope_type=quiz_in.scope_type,
        group_id=quiz_in.group_id,
        subject_id=quiz_in.subject_id,
        note_id=quiz_in.note_id,
        quiz_group_id=quiz_in.quiz_group_id
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz

@router.get("/{quiz_id}", response_model=QuizResponse)
def get_quiz(
    quiz_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific quiz and its questions."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz

@router.put("/{quiz_id}", response_model=QuizResponse)
def update_quiz(
    quiz_id: str,
    quiz_in: QuizUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update quiz details (e.g. title)."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    if quiz_in.title is not None:
        quiz.title = quiz_in.title
    if quiz_in.quiz_group_id is not None:
        # Check if quiz_group_id is empty string, which means remove from group
        quiz.quiz_group_id = quiz_in.quiz_group_id if quiz_in.quiz_group_id != "" else None
        
    db.commit()
    db.refresh(quiz)
    return quiz

@router.delete("/{quiz_id}")
def delete_quiz(
    quiz_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a quiz."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    db.delete(quiz)
    db.commit()
    return {"success": True}

@router.post("/generate", response_model=dict)
async def generate_quiz_ai(
    request: QuizGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate a quiz using AI as a background task."""
    # Enforce tier quotas
    enforce_quota_quizzes(current_user, db)
    
    task_id = f"quiz_{current_user.id}_{int(time.time())}"
    
    # 1. Determine title
    title = request.title
    if not title:
        if request.scope_type == "note" and request.scope_id:
            note = db.query(Note).filter(Note.id == request.scope_id).first()
            title = f"Quiz on {note.title}" if note else "Generating AI Quiz..."
        elif request.scope_type == "subject" and request.scope_id:
            subject = db.query(Subject).filter(Subject.id == request.scope_id).first()
            title = f"Quiz on {subject.name}" if subject else "Generating AI Quiz..."
        elif request.scope_type == "group" and request.scope_id:
            group = db.query(SubjectGroup).filter(SubjectGroup.id == request.scope_id).first()
            title = f"Quiz on {group.name}" if group else "Generating AI Quiz..."
        else:
            title = "Generating AI Quiz..."

    # 2. Synchronously create Quiz record with 0 questions
    quiz_id = generate_random_id(db, Quiz)
    quiz = Quiz(
        id=quiz_id,
        user_id=current_user.id,
        title=title,
        scope_type=request.scope_type,
        quiz_group_id=request.quiz_group_id,
        model="Generating..." # Status indicator
    )
    
    if request.scope_type == "group":
        quiz.group_id = request.scope_id
    elif request.scope_type == "subject":
        quiz.subject_id = request.scope_id
        subject = db.query(Subject).filter(Subject.id == request.scope_id).first()
        if subject: quiz.group_id = subject.group_id
    elif request.scope_type == "note":
        quiz.note_id = request.scope_id
        note = db.query(Note).filter(Note.id == request.scope_id).first()
        if note:
            quiz.subject_id = note.subject_id
            subject = db.query(Subject).filter(Subject.id == note.subject_id).first()
            if subject: quiz.group_id = subject.group_id

    db.add(quiz)
    db.commit()
    
    # 3. Fire background task
    TaskManager.submit_task(
        task_id, 
        "quiz_generation", 
        current_user.id, 
        quiz_id=quiz_id, # Provide quiz_id to worker
        title=request.title, # Passed if backend still wants to use it
        scope_type=request.scope_type,
        scope_id=request.scope_id,
        question_types=request.question_types,
        num_questions=request.number_of_questions,
        quiz_group_id=request.quiz_group_id
    )

    return {"task_id": task_id, "quiz_id": quiz_id, "status": "pending"}

@router.post("/import", response_model=QuizResponse)
async def import_quiz_endpoint(
    title: Optional[str] = Form(default=None),
    text: Optional[str] = Form(None),
    file: List[UploadFile] = File(None),
    quiz_group_id: Optional[str] = Form(None),
    generate_answers: bool = Form(True),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Import a quiz from pasted text or multiple files."""
    ai_client = get_ai_client(user=current_user, db=db)
    
    import_text = text or ""
    
    if file:
        temp_dir = "uploads/temp"
        os.makedirs(temp_dir, exist_ok=True)
        
        extracted_texts = []
        for upload_file in file:
            file_path = os.path.join(temp_dir, f"{uuid.uuid4()}_{upload_file.filename}")
            
            with open(file_path, "wb") as buffer:
                content = await upload_file.read()
                buffer.write(content)
                
            try:
                # Extract text from file
                text_content = extract_text_from_upload(file_path)
                if text_content:
                    extracted_texts.append(f"--- Content from {upload_file.filename} ---\n{text_content}")
            finally:
                # Clean up temp file
                if os.path.exists(file_path):
                    os.remove(file_path)
        
        if extracted_texts:
            import_text = (import_text + "\n\n" + "\n\n".join(extracted_texts)).strip()
                
    if not import_text:
        raise HTTPException(status_code=400, detail="No text content provided for import.")
        
    try:
        quiz = await import_quiz_from_content(
            db=db,
            user=current_user,
            ai_client=ai_client,
            title=title or "",  # Pass empty string → backend uses AI suggested title
            text=import_text,
            quiz_group_id=quiz_group_id,
            generate_missing_answers=generate_answers
        )
        return quiz
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error importing quiz: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred during quiz import.")

@router.post("/{quiz_id}/generate_single", response_model=QuizQuestionResponse)
async def generate_single_question_endpoint(
    quiz_id: str,
    request: SingleQuestionGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate a single question for an existing quiz using AI."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
        
    ai_client = get_ai_client(user=current_user, db=db)
    
    try:
        q_data = await generate_single_question(
            db=db,
            user=current_user,
            ai_client=ai_client,
            quiz=quiz,
            question_type=request.question_type
        )
        
        # Count current questions for order
        q_count = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz.id).count()
        
        new_q = QuizQuestion(
            quiz_id=quiz.id,
            question_text=q_data.get("question_text"),
            answer_text=q_data.get("answer_text"),
            question_type=q_data.get("question_type"),
            options=q_data.get("options"),
            order=q_count
        )
        db.add(new_q)
        db.commit()
        db.refresh(new_q)
        return new_q
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{quiz_id}/questions", response_model=QuizQuestionResponse)
def add_question(
    quiz_id: str,
    question_in: QuizQuestionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a question to a quiz manually."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    
    question = QuizQuestion(
        quiz_id=quiz.id,
        question_text=question_in.question_text,
        answer_text=question_in.answer_text,
        question_type=question_in.question_type,
        options=question_in.options,
        order=question_in.order
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question

@router.put("/{quiz_id}/questions/{question_id}", response_model=QuizQuestionResponse)
def update_question(
    quiz_id: str,
    question_id: int,
    question_in: QuizQuestionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a specific question in a quiz."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
        
    question = db.query(QuizQuestion).filter(QuizQuestion.id == question_id, QuizQuestion.quiz_id == quiz.id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    update_data = question_in.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(question, key, value)
        
    db.commit()
    db.refresh(question)
    return question

@router.delete("/{quiz_id}/questions/{question_id}")
def delete_question(
    quiz_id: str,
    question_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a specific question from a quiz."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
        
    question = db.query(QuizQuestion).filter(QuizQuestion.id == question_id, QuizQuestion.quiz_id == quiz.id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    db.delete(question)
    db.commit()
    return {"success": True}

@router.post("/{quiz_id}/questions/{question_id}/explain", response_model=QuizQuestionResponse)
async def explain_question_endpoint(
    quiz_id: str,
    question_id: int,
    request: QuizExplainRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Explain a question using AI based on source or web."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
        
    question = db.query(QuizQuestion).filter(QuizQuestion.id == question_id, QuizQuestion.quiz_id == quiz.id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    
    # Check if cached explanation exists and matches requested mode/format
    if (question.explanation and 
        question.explanation_mode == request.ai_mode and 
        question.explanation_output == request.output_format and 
        request.scope != "web"):
         return question

    ai_client = get_ai_client(user=current_user, db=db)
    context = ""
    
    # 1. Get Context from Source
    if request.scope in ["source", "both"]:
        note_ids = []
        if quiz.note_id:
            note_ids = [quiz.note_id]
        elif quiz.subject_id:
            notes = db.query(Note).filter(Note.subject_id == quiz.subject_id).all()
            note_ids = [l.id for l in notes]
        elif quiz.group_id:
            subjects = db.query(Subject).filter(Subject.group_id == quiz.group_id).all()
            for s in subjects:
                notes = db.query(Note).filter(Note.subject_id == s.id).all()
                note_ids.extend([l.id for l in notes])
        
        if note_ids:
            try:
                from app.processing.embeddings import retrieve_relevant_chunks, combine_snippets
                chunks = retrieve_relevant_chunks(
                    query=f"{question.question_text} {question.answer_text}",
                    note_ids=note_ids,
                    db=db,
                    top_k=5
                )
                if chunks:
                    snippets = [{"text": chunk["text"], "position": chunk["position"], "score": chunk["score"]} for chunk in chunks]
                    context = combine_snippets(snippets, max_chars=3000)
            except Exception as e:
                logger.error(f"Error retrieving source context for explanation: {e}")

    # 2. Get Context from Web if source is empty or scope is web/both
    if (not context or request.scope in ["web", "both"]) and request.scope != "source":
        try:
            from app.routers.chat import web_search
            web_snippet, web_sources, web_error = await web_search(f"Explain this question and answer: {question.question_text} - {question.answer_text}")
            if web_snippet:
                context = (context + "\n\nWeb Search Info:\n" + web_snippet).strip()
        except Exception as e:
            logger.error(f"Error retrieving web context for explanation: {e}")

    # 3. Generate Explanation
    mode_prompt = f"Provide a thorough explanation for the following question and answer. Use the context provided if available."
    if request.ai_mode == "simple": mode_prompt = "Explain this simply for a beginner."
    elif request.ai_mode == "eli5": mode_prompt = "Explain this like I'm five."
    
    format_prompt = "Respond in clear sentences."
    if request.output_format == "pointform": format_prompt = "Respond in bullet points."
    
    user_answer_context = ""
    if request.user_answer:
        user_answer_context = f"\nThe user provided this answer: '{request.user_answer}'. Please explain why this answer is correct or incorrect compared to the true answer."

    prompt = f"""{mode_prompt}
{format_prompt}
{user_answer_context}

Question: {question.question_text}
Answer: {question.answer_text}

Context:
{context or 'No additional context available.'}

Explanation:"""

    try:
        explanation = await ai_client.generate_text(prompt, max_tokens=1000)
        question.explanation = explanation
        question.explanation_mode = request.ai_mode
        question.explanation_output = request.output_format
        db.commit()
        db.refresh(question)
        return question
    except Exception as e:
        logger.error(f"Error generating explanation: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate explanation")

@router.put("/{quiz_id}/questions/bulk", response_model=List[QuizQuestionResponse])
def bulk_update_questions(
    quiz_id: str,
    bulk_in: BulkQuizUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Bulk update quiz questions including order."""
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
        
    updated_questions = []
    for q_update in bulk_in.questions:
        question = db.query(QuizQuestion).filter(QuizQuestion.id == q_update.id, QuizQuestion.quiz_id == quiz.id).first()
        if question:
            question.question_text = q_update.question_text
            question.answer_text = q_update.answer_text
            question.question_type = q_update.question_type
            question.options = q_update.options
            question.order = q_update.order
            question.explanation = q_update.explanation
            question.explanation_mode = q_update.explanation_mode
            question.explanation_output = q_update.explanation_output
            updated_questions.append(question)
        else:
            # Handle new question if id is negative or similar (not implemented here but good practice)
            pass
            
    db.commit()
    for q in updated_questions:
        db.refresh(q)
    return updated_questions

@router.post("/{quiz_id}/check", response_model=QuizCheckResponse)
async def check_answer_ai(
    quiz_id: str,
    question_id: int,
    request: QuizCheckRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check a subjective answer using AI Semantic Grading."""
    # Ensure correct user owns quiz
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
        
    question = db.query(QuizQuestion).filter(QuizQuestion.id == question_id, QuizQuestion.quiz_id == quiz.id).first()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    is_correct = False
    feedback = ""
    
    # Standard logic for objective queries
    if question.question_type == "objective":
        is_correct = request.user_answer.strip().lower() == question.answer_text.strip().lower()
        feedback = "Correct!" if is_correct else "Incorrect."
    else:
        # Subjective/Fill in the blank AI logic
        ai_client = get_ai_client(user=current_user, db=db)
        result = await check_semantic_answer(
            ai_client=ai_client,
            question_text=question.question_text,
            correct_answer=question.answer_text,
            user_answer=request.user_answer
        )
        is_correct = result.get("is_correct", False)
        feedback = result.get("feedback", "No feedback available.")
        
    # Implement SRS progression
    progress = db.query(QuizProgress).filter(
        QuizProgress.user_id == current_user.id,
        QuizProgress.question_id == question.id
    ).first()
    
    if not progress:
        progress = QuizProgress(
            user_id=current_user.id,
            quiz_id=quiz.id,
            question_id=question.id,
            last_reviewed_at=datetime.utcnow(),
            interval_days=1 if is_correct else 0,
            ease_factor=2.5,
            consecutive_correct=1 if is_correct else 0
        )
        db.add(progress)
    else:
        progress.last_reviewed_at = datetime.utcnow()
        if is_correct:
            progress.consecutive_correct += 1
            progress.interval_days = max(1, int(progress.interval_days * progress.ease_factor))
            progress.ease_factor += 0.1
        else:
            progress.consecutive_correct = 0
            progress.interval_days = 0
            progress.ease_factor = max(1.3, progress.ease_factor - 0.2)
            
    db.commit()
    
    return QuizCheckResponse(
        is_correct=is_correct,
        feedback=feedback,
        correct_answer=question.answer_text
    )

@router.post("/{quiz_id}/export", response_model=dict)
async def export_quiz(
    quiz_id: str,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export a quiz to PDF or DOCX using DocumentGenerator"""
    logger.info(f"[Export] Received request for quiz {quiz_id} with body: {body}")
    task_id = str(uuid.uuid4())[:8]
    _export_progress[task_id] = {"step": "Starting", "percent": 0, "status": "running"}
    
    def progress_callback(step, percent):
        _export_progress[task_id] = {"step": step, "percent": percent, "status": "running" if percent < 100 else "complete"}
    
    export_format = body.get("format", "pdf").lower()
    if export_format not in ("pdf", "docx"):
        raise HTTPException(status_code=400, detail="Format must be 'pdf' or 'docx'")
        
    include_cover = body.get("include_cover", True)
    template_id = body.get("template_id", None)
    
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
        
    questions = db.query(QuizQuestion).filter(QuizQuestion.quiz_id == quiz.id).order_by(QuizQuestion.order).all()
    if not questions:
        raise HTTPException(status_code=400, detail="Quiz has no questions to export.")
        
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

    # Build ContentSegments
    segments = []
    
    # Optional headers
    if template_config and "header" in template_config:
        h_cfg = template_config["header"]
        if h_cfg.get("show_note_title"):
            segments.append(ContentSegment(content=quiz.title, content_type=ContentType.NOTE_TITLE, page_number=1))
            
    # Add Questions and Answers
    for i, q in enumerate(questions):
        # Question part
        q_text = f"**Q{i+1}:** {q.question_text}"
        segments.append(ContentSegment(content=q_text, content_type=ContentType.H3, page_number=1))
        
        # Options if objective
        if q.question_type == "objective" and q.options:
            try:
                opts = json.loads(q.options) if isinstance(q.options, str) else q.options
                for opt in opts:
                    segments.append(ContentSegment(content=f"- {opt}", content_type=ContentType.LIST, page_number=1))
            except:
                pass
                
        # Answer part (add spacing)
        ans_text = f"**Answer:** {q.answer_text}"
        segments.append(ContentSegment(content="", content_type=ContentType.BODY, page_number=1))
        segments.append(ContentSegment(content=ans_text, content_type=ContentType.BODY, page_number=1))
        segments.append(ContentSegment(content="", content_type=ContentType.BODY, page_number=1))

    try:
        from app.routers.processing import GENERATED_DIR
        
        safe_title = "".join(c for c in quiz.title if c.isalnum() or c in (' ', '-', '_')).strip()
        
        if export_format == "pdf":
            from app.processing.document_generator import DocumentGenerator
            generator = DocumentGenerator(
                note_id=quiz.id, # using quiz.id as a unique dir folder
                note_title=f"Quiz: {quiz.title}",
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
                note_id=quiz.id,
                note_title=f"Quiz: {quiz.title}",
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
            
        gen_doc = Summary(
            note_id=quiz.note_id or 1, # fallback if subject-based quiz
            title=f"{quiz.title} ({export_format.upper()})",
            file_path=output_path,
            summary_type=f"quiz_{export_format}",
        )
        db.add(gen_doc)
        db.commit()
        
        return {
            "success": True,
            "message": f"{export_format.upper()} generated successfully",
            "download_url": f"/quizzes/{quiz.id}/download-export?format={export_format}",
            "task_id": task_id,
            "segments_count": len(segments),
            "images_count": 0
        }
    except Exception as e:
        logger.error(f"Error exporting {export_format}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{quiz_id}/export-status/{task_id}")
async def get_export_status(
    quiz_id: str,
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get export task progress"""
    progress = _export_progress.get(task_id)
    if not progress:
        raise HTTPException(status_code=404, detail="Task not found")
    return progress

@router.get("/{quiz_id}/download-export")
async def download_export(
    quiz_id: str,
    format: str = "pdf",
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download generated export file"""
    from fastapi.responses import FileResponse
    
    export_format = format.lower()
    quiz = db.query(Quiz).filter(Quiz.id == quiz_id, Quiz.user_id == current_user.id).first()
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
        
    gen_doc = db.query(Summary).filter(
        Summary.summary_type == f"quiz_{export_format}",
        Summary.title == f"{quiz.title} ({export_format.upper()})"
    ).order_by(Summary.created_at.desc()).first()
    
    if not gen_doc or not os.path.exists(gen_doc.file_path):
        raise HTTPException(status_code=404, detail=f"{export_format.upper()} not generated yet.")
        
    safe_title = "".join(c for c in quiz.title if c.isalnum() or c in (' ', '-', '_')).strip()
    
    mime_types = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    
    return FileResponse(
        path=gen_doc.file_path,
        filename=f"{safe_title}.{export_format}",
        media_type=mime_types.get(export_format, "application/octet-stream"),
    )
