import json
import logging
import time
import os
from datetime import datetime
from typing import Dict, Any, List

from app.models.db import User, Exercise, ExerciseQuestion, Task, Resource
from app.utils.db import SessionLocal
from app.utils.tasks import TaskManager
from app.processing.ocr import OCRProcessor
from app.processing.note_processor import get_pipeline_for_user
from app.processing.ai_client import AIClient
from app.processing.embeddings import retrieve_relevant_chunks
from app.schemas.exercise import ExerciseCheckResponse

logger = logging.getLogger(__name__)

def process_exercise_task(exercise_id: str, user_id: int, task_id: str = None):
    db = SessionLocal()
    try:
        exercise = db.query(Exercise).filter(Exercise.id == exercise_id).first()
        user = db.query(User).filter(User.id == user_id).first()
        
        if not exercise or not user:
            TaskManager._update_db_task(task_id, status="failed", error="Exercise or User not found")
            return
            
        def progress_callback(percent, message=None):
            if task_id:
                TaskManager.update_task_progress(task_id, percent, message=message)
 
        start_time = time.time()
        file_path = exercise.file_path
        file_ext = os.path.splitext(file_path)[1].lower() if file_path else ""
        
        # 1. Extract text from the file
        progress_callback(10, "Extracting text from file...")
        raw_text = ""
        
        if file_ext in ('.pdf', '.pptx', '.txt', '.md'):
            # Use SmartPipeline for better extraction
            pipeline = get_pipeline_for_user(user)
            # Disable polish to save time and token cost for raw text extraction
            pipeline.use_polish = False 
            raw_text = pipeline.process(file_path)
            if isinstance(raw_text, str) and raw_text.startswith("Error:"):
                raise RuntimeError(raw_text)
        else:
            # Fallback to OCR for images
            ocr_result = OCRProcessor.extract_text(file_path, "image" if file_ext in ('.png', '.jpg', '.jpeg') else "unknown", note_id=exercise_id)
            raw_text = ocr_result.get("raw_text", "")
            
        if not raw_text.strip():
            raise ValueError("No text could be extracted from the file.")
            
        # 2. Parse text into Q&A JSON via LLM
        progress_callback(40, "Using AI to parse questions and answers...")
        
        system_prompt = (
            "You are an AI assistant specialized in parsing educational exercises, exams, and worksheets. "
            "Extract all questions from the provided text. For each question, identify its number, the question text, "
            "and the answer (if available). Also, infer the question type (e.g., 'objective', 'subjective', 'fill_in_the_blank', 'coding') "
            "and any options if it is multiple choice. "
            "Return the output STRICTLY as a JSON array of objects with the following keys: "
            "'original_number' (string), 'question_text' (string), 'answer_text' (string, empty if none), "
            "'question_type' (string), 'options' (array of strings, or null if not applicable). "
            "Do NOT wrap the JSON in markdown code blocks. Ensure valid JSON."
        )
        
        client = AIClient()
        response = client.generate_text(
            prompt=f"Text:\n{raw_text}",
            system_prompt=system_prompt,
            temperature=0.1
        )
        
        try:
            # Strip markdown code blocks if the LLM adds them despite instructions
            json_text = response
            if json_text.startswith("```json"):
                json_text = json_text[7:]
            if json_text.startswith("```"):
                json_text = json_text[3:]
            if json_text.endswith("```"):
                json_text = json_text[:-3]
                
            questions_data = json.loads(json_text.strip())
        except Exception as e:
            logger.error(f"Failed to parse LLM JSON response: {response}")
            raise ValueError("Failed to parse extracted questions into JSON format.")
            
        # 3. Process questions and find reference resources
        progress_callback(80, "Mapping references and generating missing answers...")
        
        # Get all resource IDs for this subject
        subject_resources = db.query(Resource.id).filter(Resource.subject_id == exercise.subject_id).all()
        subject_resource_ids = [r.id for r in subject_resources]
        
        order = 0
        for q_data in questions_data:
            answer = q_data.get("answer_text", "").strip()
            
            # If no answer, optionally generate one
            if not answer:
                ans_resp = client.generate_text(
                    prompt=f"Answer this question concisely and accurately: {q_data.get('question_text', '')}",
                    system_prompt="You are a helpful study assistant. Provide a direct and correct answer.",
                    temperature=0.3
                )
                answer = ans_resp.strip()
                
            # Find reference resource
            ref_resource_id = None
            if subject_resource_ids:
                try:
                    chunks = retrieve_relevant_chunks(q_data.get("question_text", ""), subject_resource_ids, db, top_k=1)
                    if chunks:
                        ref_resource_id = chunks[0]["resource_id"]
                except Exception as e:
                    logger.warning(f"Error retrieving relevant chunks: {e}")
                    
            db_q = ExerciseQuestion(
                exercise_id=exercise.id,
                question_text=q_data.get("question_text", ""),
                answer_text=answer,
                question_type=q_data.get("question_type", "subjective"),
                options=q_data.get("options"),
                original_number=str(q_data.get("original_number", "")),
                order=order,
                reference_resource_id=ref_resource_id
            )
            db.add(db_q)
            order += 1
            
        exercise.processing_time_ms = int((time.time() - start_time) * 1000)
        exercise.updated_at = datetime.utcnow()
        db.commit()
        
        progress_callback(100, "Processing complete")
        if task_id:
            TaskManager._update_db_task(task_id, status="completed", progress=100)
            
    except Exception as e:
        logger.error(f"Error processing exercise {exercise_id}: {e}", exc_info=True)
        if task_id:
            TaskManager._update_db_task(task_id, status="failed", error=str(e))
    finally:
        db.close()


def grade_answer(user: User, question: ExerciseQuestion, user_answer: str) -> ExerciseCheckResponse:
    client = AIClient()
    prompt = f"Question: {question.question_text}\nCorrect Answer: {question.answer_text}\nUser's Answer: {user_answer}"
    system_prompt = (
        "You are grading a student's answer. Compare the User's Answer to the Correct Answer. "
        "Return your evaluation as a strict JSON object with two keys: "
        "'is_correct' (boolean) and 'feedback' (string, a brief explanation of why it's correct or incorrect). "
        "Do NOT include any markdown formatting, just the raw JSON."
    )
    
    response = client.generate_text(
        prompt=prompt,
        system_prompt=system_prompt,
        temperature=0.1
    )
    
    try:
        # Strip potential code blocks
        json_text = response.strip()
        if json_text.startswith("```json"): json_text = json_text[7:]
        if json_text.startswith("```"): json_text = json_text[3:]
        if json_text.endswith("```"): json_text = json_text[:-3]
        
        result = json.loads(json_text.strip())
        return ExerciseCheckResponse(
            is_correct=result.get("is_correct", False),
            feedback=result.get("feedback", "Could not parse feedback."),
            correct_answer=question.answer_text
        )
    except Exception as e:
        logger.error(f"Error parsing grading response: {e}")
        return ExerciseCheckResponse(
            is_correct=False,
            feedback="An error occurred while grading your answer.",
            correct_answer=question.answer_text
        )

def explain_answer(user: User, question: ExerciseQuestion, user_answer: str = None) -> str:
    client = AIClient()
    prompt = f"Question: {question.question_text}\nCorrect Answer: {question.answer_text}"
    if user_answer:
        prompt += f"\nUser's Attempt: {user_answer}"
        
    system_prompt = (
        "Explain the correct answer to this question clearly and simply. "
        "If the user provided an attempt, explain where they went wrong or right."
    )
    
    return client.generate_text(
        prompt=prompt,
        system_prompt=system_prompt,
        temperature=0.7
    ).strip()
