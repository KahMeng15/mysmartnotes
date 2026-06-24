import json
import logging
import time
import os
import re as _re
from datetime import datetime
from sqlalchemy.orm import Session
from typing import Dict, Any, List

from app.models.db import User, Exercise, Task, Resource
from app.utils.db import SessionLocal
from app.utils.tasks import TaskManager
from app.utils.storage import StorageManager
from app.processing.ocr import OCRProcessor
from app.processing.note_processor import get_pipeline_for_user
from app.processing.ai_client import AIClient
from app.processing.embeddings import retrieve_relevant_chunks
from app.schemas.exercise import ExerciseCheckResponse

logger = logging.getLogger(__name__)

def _run_async(coro_fn, *args, **kwargs):
    import asyncio
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
        
    if loop and loop.is_running():
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(lambda: asyncio.run(coro_fn(*args, **kwargs)))
            return future.result()
    else:
        return asyncio.run(coro_fn(*args, **kwargs))

def _looks_like_provider_error(raw_response: str) -> bool:
    if not raw_response:
        return False
    lower = raw_response.strip().lower()
    error_markers = [
        "connection failed", "failed after", "provider error",
        "timeout", "timed out", "[gemini]", "[huggingface]", "[ollama]"
    ]
    return any(marker in lower for marker in error_markers)

def _normalize_type(raw: str) -> str:
    lower = (raw or "").lower()
    if lower in {"objective", "multiple_choice", "multiple-choice", "mcq"}:
        return "objective"
    if lower in {"fill_in_the_blank", "fill-in-the-blank", "blank"}:
        return "fill_in_the_blank"
    return "subjective"

def _try_parse_import_payload(raw_response: str):
    if not raw_response:
        raise json.JSONDecodeError("Empty response", "", 0)
    candidates = []
    text = raw_response.strip()
    candidates.append(text)
    fenced_blocks = _re.findall(r"```(?:json)?\s*([\s\S]*?)\s*```", text, flags=_re.IGNORECASE)
    candidates.extend([block.strip() for block in fenced_blocks if block.strip()])
    obj_start = text.find("{")
    obj_end = text.rfind("}")
    if obj_start != -1 and obj_end != -1 and obj_end > obj_start:
        candidates.append(text[obj_start:obj_end + 1].strip())
    arr_start = text.find("[")
    arr_end = text.rfind("]")
    if arr_start != -1 and arr_end != -1 and arr_end > arr_start:
        candidates.append(text[arr_start:arr_end + 1].strip())
    seen = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    raise json.JSONDecodeError("Could not parse JSON payload", text, 0)

def _extract_fallback_questions(raw_text: str) -> List[Dict[str, Any]]:
    if not raw_text:
        return []
    extracted: List[Dict[str, Any]] = []
    qa_pattern = _re.compile(
        r"(?ims)(?:^|\n)\s*(?:q(?:uestion)?\s*[\d.\-)]*\s*[:\-])\s*(.+?)\s*"
        r"(?:\n|\r\n)\s*(?:a(?:nswer)?\s*[\d.\-)]*\s*[:\-])\s*(.+?)"
        r"(?=\n\s*(?:q(?:uestion)?\s*[\d.\-)]*\s*[:\-])|\Z)"
    )
    for match in qa_pattern.finditer(raw_text):
        q_text = " ".join(match.group(1).split())
        a_text = " ".join(match.group(2).split())
        if not q_text:
            continue
        q_type = "fill_in_the_blank" if "_____" in q_text else "subjective"
        extracted.append({
            "question_text": q_text,
            "original_number": None,
            "answer_text": a_text,
            "question_type": q_type,
            "options": None,
        })
    if extracted:
        return extracted

    lines = [line.strip() for line in raw_text.splitlines()]
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line:
            i += 1
            continue
        question_text = None
        q_match = _re.match(r"^(?:q(?:uestion)?\s*[\d.\-)]*\s*[:\-]\s*)?(.*\?)$", line, flags=_re.IGNORECASE)
        if q_match:
            question_text = q_match.group(1).strip()
        if not question_text:
            i += 1
            continue
        answer_parts: List[str] = []
        j = i + 1
        while j < len(lines):
            candidate = lines[j]
            if not candidate:
                if answer_parts: break
                j += 1
                continue
            if candidate.endswith("?"): break
            candidate = _re.sub(r"^(?:a(?:nswer)?\s*[:\-]\s*)", "", candidate, flags=_re.IGNORECASE)
            answer_parts.append(candidate)
            j += 1
        answer_text = " ".join(answer_parts).strip() or "Answer not provided in source text."
        q_type = "fill_in_the_blank" if "_____" in question_text else "subjective"
        extracted.append({
            "question_text": question_text,
            "original_number": None,
            "answer_text": answer_text,
            "question_type": q_type,
            "options": None,
        })
        i = j if j > i else i + 1
    return extracted

def process_exercise_task(exercise_id: str, user_id: int, task_id: str = None, **kwargs):
    db = SessionLocal()
    try:
        exercise = db.query(Exercise).filter(Exercise.id == exercise_id).first()
        user = db.query(User).filter(User.id == user_id).first()
        
        if not exercise or not user:
            if task_id: TaskManager._update_db_task(task_id, status="failed", error="Exercise or User not found")
            return
            
        def progress_callback(percent, message=None):
            if task_id:
                TaskManager.update_task_progress(task_id, percent, message=message)
 
        start_time = time.time()
        file_path = exercise.file_path
        file_ext = os.path.splitext(file_path)[1].lower() if file_path else ""
        
        progress_callback(10, "Extracting text from file...")
        raw_text = ""
        
        if file_ext in ('.pdf', '.pptx', '.txt', '.md', '.docx'):
            if file_ext == '.docx':
                from docx import Document
                doc = Document(file_path)
                raw_text = "\n".join([p.text for p in doc.paragraphs])
            else:
                pipeline = get_pipeline_for_user(user)
                pipeline.use_polish = False 
                raw_text = pipeline.process(file_path)
                if isinstance(raw_text, str) and raw_text.startswith("Error:"):
                    raise RuntimeError(raw_text)
        else:
            ocr_result = OCRProcessor.extract_text(file_path, "image" if file_ext in ('.png', '.jpg', '.jpeg') else "unknown", note_id=exercise_id)
            raw_text = ocr_result.get("raw_text", "")
            
        if not raw_text.strip():
            raise ValueError("No text could be extracted from the file.")
            
        progress_callback(40, "Using AI to parse questions and answers...")
        
        text = raw_text
        if len(text) > 25000:
            text = text[:25000] + "... [truncated]"
            
        text = _re.sub(r'(?<=[.!?])\s+(?=[b-z]\.\s)', '\n', text)
        text = _re.sub(r'(?<=\.)\s+(?=\([b-z]\)\s)', '\n', text)

        prompt = f"""Extract and structure all quiz questions from the following text. 
Text to process:
---
{text}
---

Rules:
1. **Identify Questions and Answers**: Pair each question with its corresponding answer. Questions may start with numbers like "1.1", "Q1:", "a.", etc.
2. **Generate Missing Answers**: If 'generate_missing_answers' is true, generate accurate answers for any questions that are missing them, based on context.
3. **CRITICAL - Rejoin Broken Lines**: The input may be from a PDF or scanned document where sentences are broken mid-line. Rejoin them into complete, coherent sentences.
4. **CRITICAL - No Orphaned Words**: Never leave a word or abbreviation stranded alone at the end of a sentence.
5. **CRITICAL - Clean Question Clusters**: Extract the real question text that follows headers and only use the first number as the `original_number`.
6. **CRITICAL - Remove Non-Content**: Strip out page numbers, chapter titles, etc.
7. **NO Empty Strings**: Never include empty strings.
8. **Preserve Rich Formatting**: Keep bullet points, and format inline list enumerations as proper Markdown lists.
9. **CRITICAL - Handle Squished Lists**: Split them onto SEPARATE LINES, keeping the original letter prefix. NEVER convert `a. / b. / c.` markers to `- `.
10. **Nested Inline Lists**: Convert inline lists to numbered lines.
11. **Question Extraction**: The `original_number` is the question label. The `question_text` must NOT start with the original number.
12. **Format the output as a strict JSON object**. The JSON object must have:
    - `"suggested_title"`: A short, descriptive title.
    - `"questions"`: An array of objects, each with:
        - `"question_text"`: Clean question text (no leading number).
        - `"original_number"`: The original question label (e.g., "1.1"). `null` if not found.
        - `"answer_text"`: The answer.
        - `"question_type"`: One of `"objective"`, `"subjective"`, `"fill_in_the_blank"`.
        - `"options"`: For `"objective"`, an array of 4 options. `null` for others.

Generate_missing_answers: True
Respond with ONLY the JSON object.
"""
        
        client = AIClient()
        response = _run_async(
            client.generate_text,
            prompt=prompt,
            system_instruction="You are an expert educational content extractor.",
            max_tokens=3500
        )
        
        provider_failed = _looks_like_provider_error(response)
        suggested_title = None
        questions_data = []
        
        if not provider_failed:
            try:
                data = _try_parse_import_payload(response)
                if isinstance(data, list):
                    questions_data = data
                else:
                    questions_data = data.get("questions", [])
                    raw_title = data.get("suggested_title")
                    suggested_title = raw_title.strip() if isinstance(raw_title, str) and raw_title.strip() else None
            except json.JSONDecodeError:
                logger.error(f"Failed to parse imported quiz JSON: {response}")

        if not questions_data:
            questions_data = _extract_fallback_questions(text)
            
        if not questions_data:
            raise ValueError("AI failed to structure the imported content properly.")

        normalized_questions = []
        for q_data in questions_data:
            q_text = str(q_data.get("question_text", "")).strip()
            if not q_text: continue
            q_type = _normalize_type(str(q_data.get("question_type", "subjective")))
            options = q_data.get("options") if q_type == "objective" else None
            normalized_questions.append({
                "question_text": q_text,
                "original_number": q_data.get("original_number"),
                "answer_text": str(q_data.get("answer_text", "")).strip(),
                "question_type": q_type,
                "options": options,
            })

        if not normalized_questions:
            raise ValueError("No valid questions could be extracted.")

        questions_data = normalized_questions
        
        if suggested_title and exercise.title == "Uploaded Exercise":
            exercise.title = suggested_title

        progress_callback(80, "Mapping references and generating missing answers...")
        
        subject_resources = db.query(Resource.id).filter(Resource.subject_id == exercise.subject_id).all()
        subject_resource_ids = [r.id for r in subject_resources]
        
        order = 0
        for q_data in questions_data:
            ref_resource_id = None
            if subject_resource_ids:
                try:
                    chunks = retrieve_relevant_chunks(q_data.get("question_text", ""), subject_resource_ids, db, top_k=1)
                    if chunks:
                        ref_resource_id = chunks[0]["resource_id"]
                except Exception as e:
                    pass
            q_data["reference_resource_id"] = ref_resource_id
            q_data["order"] = order
            q_data["original_number"] = str(q_data.get("original_number", ""))
            q_data["id"] = str(order + 1)
            order += 1
            
        StorageManager.save_exercise_json(exercise.id, questions_data)
        exercise.content_path = StorageManager._get_exercise_path(exercise.id)
            
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


def grade_answer(user: User, question: Dict[str, Any], user_answer: str) -> ExerciseCheckResponse:
    """Grades a user's answer using the LLM for subjective questions"""
    client = AIClient()
    
    question_text = question.get("question_text", "")
    answer_text = question.get("answer_text", "")
    
    prompt = f"""
Question: {question_text}
Correct Answer: {answer_text}
User's Answer: {user_answer}
"""
    system_prompt = (
        "You are grading a student's answer. Do NOT require exact wording. "
        "Evaluate if the student's answer correctly captures the core meaning or concept of the Correct Answer. "
        "Be lenient with typos, synonyms, or alternative phrasings as long as the fundamental concept is accurate. "
        "Return your evaluation as a strict JSON object with two keys: "
        "'is_correct' (boolean) and 'feedback' (string, a brief 1-2 sentence explanation). "
        "Do NOT include any markdown formatting, just the raw JSON."
    )
    response = _run_async(
        client.generate_text,
        prompt=prompt,
        system_instruction=system_prompt,
        max_tokens=4000
    )
    try:
        json_text = response.strip()
        if json_text.startswith("```json"): json_text = json_text[7:]
        if json_text.startswith("```"): json_text = json_text[3:]
        if json_text.endswith("```"): json_text = json_text[:-3]
        result = json.loads(json_text.strip())
        return ExerciseCheckResponse(
            is_correct=result.get("is_correct", False),
            feedback=result.get("feedback", "Could not parse feedback."),
            correct_answer=answer_text
        )
    except Exception as e:
        return ExerciseCheckResponse(
            is_correct=False,
            feedback="An error occurred while grading your answer.",
            correct_answer=answer_text
        )

def explain_answer(user: User, question: Dict[str, Any], user_answer: str = None) -> str:
    """Generates an explanation for the correct answer"""
    client = AIClient()
    
    question_text = question.get("question_text", "")
    answer_text = question.get("answer_text", "")
    
    prompt = f"""
Question: {question_text}
Correct Answer: {answer_text}
"""
    if user_answer:
        prompt += f"\nUser's Attempt: {user_answer}"
    system_prompt = (
        "Explain the correct answer to this question in 1-3 concise sentences. "
        "Address the reader directly. Be extremely brief and straight to the point. "
        "If an attempt is provided, briefly state why it is right or wrong."
    )
    return _run_async(
        client.generate_text,
        prompt=prompt,
        system_instruction=system_prompt,
        max_tokens=4000
    ).strip()

def generate_exercise_task(exercise_id: str, user_id: int, req_data: Dict[str, Any], task_id: str = None, **kwargs):
    db = SessionLocal()
    try:
        exercise = db.query(Exercise).filter(Exercise.id == exercise_id).first()
        user = db.query(User).filter(User.id == user_id).first()
        if not exercise or not user:
            if task_id: TaskManager._update_db_task(task_id, status="failed", error="Exercise or User not found")
            return
            
        def progress_callback(percent, message=None):
            if task_id:
                TaskManager.update_task_progress(task_id, percent, message=message)

        progress_callback(10, "Fetching resources...")
        start_time = time.time()
        
        resource_ids = req_data.get("resource_ids", [])
        resources_text = ""
        for r_id in resource_ids:
            r = db.query(Resource).filter(Resource.id == r_id, Resource.user_id == user_id).first()
            if r:
                r_text = StorageManager.get_resource_text(r.id)
                if r_text:
                    resources_text += f"\n--- {r.title} ---\n{r_text}\n"

        if not resources_text.strip():
            raise ValueError("No content found in the selected resources.")
            
        if len(resources_text) > 30000:
            resources_text = resources_text[:30000] + "... [truncated]"
            
        progress_callback(40, "Using AI to generate exercise...")
        
        question_types = req_data.get("question_types", [])
        lengths = req_data.get("lengths", [])
        difficulties = req_data.get("difficulties", [])
        num_questions = req_data.get("num_questions", 5)

        types_str = ", ".join(question_types)
        lengths_str = ", ".join(lengths)
        diff_str = ", ".join(difficulties)

        prompt = f"""Generate exactly {num_questions} quiz questions based on the following content.

The questions MUST be of the following types: {types_str}. 
Target lengths: {lengths_str}.
Target difficulties: {diff_str}.
If "mixed" is specified, provide a relatively even mix of 'objective' (multiple choice), 'subjective' (short answer), and 'fill_in_the_blank'.

Content:
{resources_text}

Format the response as a strict JSON array of objects. Do not wrap it in markdown codeblocks like ```json, just output the raw JSON array.
Each object must have the following keys:
- "question_text": The actual question. For fill in the blank, use "_____" to represent the blank.
- "answer_text": The correct answer (for AI and user reference).
- "question_type": Must be exactly one of: "objective", "subjective", "fill_in_the_blank".
- "options": (ONLY for "objective" type) a list of 4 string options containing the correct answer and 3 distractors. Leave as null for other types.

Respond with ONLY the JSON array.
"""
        
        client = AIClient()
        response = _run_async(
            client.generate_text,
            prompt=prompt,
            system_instruction="You are an expert educational content generator.",
            max_tokens=8192
        )
        
        try:
            json_text = response.strip()
            if json_text.startswith("```json"): json_text = json_text[7:]
            if json_text.startswith("```"): json_text = json_text[3:]
            if json_text.endswith("```"): json_text = json_text[:-3]
            questions_data = json.loads(json_text.strip())
        except json.JSONDecodeError:
            raise ValueError("Failed to parse generated questions into JSON format.")
            
        progress_callback(80, "Saving generated exercise...")
        
        order = 0
        for q in questions_data:
            q["original_number"] = str(q.get("original_number", order + 1))
            q["order"] = order
            q["id"] = str(order + 1)
            order += 1
            
        StorageManager.save_exercise_json(exercise_id, questions_data)
        exercise.content_path = StorageManager._get_exercise_path(exercise_id)
            
        exercise.processing_time_ms = int((time.time() - start_time) * 1000)
        exercise.updated_at = datetime.utcnow()
        db.commit()
        
        progress_callback(100, "Exercise generation complete.")
        if task_id:
            TaskManager._update_db_task(task_id, status="completed", progress=100)
        
    except Exception as e:
        logger.error(f"Exercise generation failed: {str(e)}")
        if task_id:
            TaskManager._update_db_task(task_id, status="failed", error=str(e))
    finally:
        db.close()
