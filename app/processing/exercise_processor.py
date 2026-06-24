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

def _extract_title_from_text(raw_text: str) -> str | None:
    if not raw_text:
        return None
    question_words = {"what", "how", "why", "when", "which", "where", "who", "define", "explain", "list", "name", "describe", "is", "are", "does", "do", "can", "would", "could", "should"}
    lines = raw_text.strip().split("\n")
    best = None
    for line in lines:
        stripped = line.strip().strip("# \t")
        if not stripped or len(stripped) < 4:
            continue
        if stripped.isdigit():
            continue
        first_word = stripped.split()[0].lower().strip("()[].,:;!?")
        if stripped.endswith("?"):
            continue
        if first_word in question_words:
            continue
        if 10 <= len(stripped) <= 80:
            best = stripped
        elif best is None and len(stripped) < 100:
            best = stripped
    return best

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
            
        progress_callback(30, "Loading subject resources...")
        
        subject_resources = db.query(Resource.id, Resource.title).filter(
            Resource.subject_id == exercise.subject_id,
            Resource.user_id == user_id
        ).all()
        resource_titles = [(r.id, r.title) for r in subject_resources]
        title_to_id = {title.strip(): rid for rid, title in resource_titles if title}
        
        if title_to_id:
            resource_context = "The following resources exist in this subject. For each extracted question, identify which resource it likely references:\n"
            for rid, rtitle in resource_titles:
                resource_context += f"- {rtitle}\n"
        else:
            resource_context = ""
        
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

{resource_context}
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
        - `"topic"`: A short 1-4 word description of the specific topic or concept this question covers.
        - `"difficulty"`: Must be "Easy", "Medium", or "Hard".
        - `"resource_title"`: The exact title of the resource (from the list above) that this question likely references. `null` if unclear.
        - `"reference_quote"`: A short excerpt from the extracted text (not from the resource list) that supports the answer. `null` if none.

Generate_missing_answers: True
Respond with ONLY the JSON object.
"""
        
        client = AIClient()
        response = _run_async(
            client.generate_text,
            prompt=prompt,
            system_instruction="You are an expert educational content extractor.",
            max_tokens=8192
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

        still_has_filename_title = (
            exercise.file_name and
            exercise.title == os.path.splitext(exercise.file_name)[0]
        )
        if still_has_filename_title:
            if suggested_title:
                cleaned = suggested_title.strip().strip("# \t")
                if cleaned and not cleaned.isdigit() and len(cleaned) >= 3:
                    exercise.title = cleaned
            if exercise.title == os.path.splitext(exercise.file_name or "")[0] or len(exercise.title) < 3 or exercise.title.isdigit():
                extracted = _extract_title_from_text(raw_text)
                if extracted:
                    exercise.title = extracted
            db.commit()
            
        if not questions_data:
            raise ValueError("AI failed to structure the imported content properly.")

        normalized_questions = []
        for q_data in questions_data:
            if not isinstance(q_data, dict):
                continue
            q_text = str(q_data.get("question_text", "")).strip()
            if not q_text: continue
            q_type = _normalize_type(str(q_data.get("question_type", "subjective")))
            options = q_data.get("options") if q_type == "objective" else None
            
            r_title = q_data.get("resource_title") or ""
            r_title_clean = r_title.strip() if r_title else ""
            mapped_id = None
            if r_title_clean and title_to_id:
                mapped_id = title_to_id.get(r_title_clean)
                if not mapped_id:
                    for t, rid in title_to_id.items():
                        if t.lower() in r_title_clean.lower() or r_title_clean.lower() in t.lower():
                            mapped_id = rid
                            break
            
            normalized_questions.append({
                "question_text": q_text,
                "original_number": q_data.get("original_number"),
                "answer_text": str(q_data.get("answer_text", "")).strip(),
                "question_type": q_type,
                "options": options,
                "topic": q_data.get("topic"),
                "difficulty": q_data.get("difficulty"),
                "reference_resource_id": mapped_id,
                "reference_resource_title": r_title_clean if r_title_clean else None,
                "reference_quote": q_data.get("reference_quote"),
            })

        if not normalized_questions:
            raise ValueError("No valid questions could be extracted.")

        questions_data = normalized_questions

        progress_callback(80, "Mapping references via embeddings fallback...")
        
        subject_resource_ids = [rid for rid, _ in resource_titles]
        
        order = 0
        for q_data in questions_data:
            if subject_resource_ids:
                try:
                    chunks = retrieve_relevant_chunks(q_data.get("question_text", ""), subject_resource_ids, db, top_k=1)
                    if chunks:
                        if not q_data.get("reference_resource_id"):
                            q_data["reference_resource_id"] = chunks[0]["resource_id"]
                        if not q_data.get("reference_resource_title"):
                            for rid, rtitle in resource_titles:
                                if rid == chunks[0]["resource_id"]:
                                    q_data["reference_resource_title"] = rtitle
                                    break
                        if not q_data.get("reference_quote"):
                            q_data["reference_quote"] = chunks[0].get("text", "")[:200]
                        q_data["reference_chunk_position"] = chunks[0].get("position")
                except Exception as e:
                    pass
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
        raise
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

def explain_answer(user: User, question: Dict[str, Any], user_answer: str = None, view_mode: str = "hide") -> str:
    """Generates an explanation for the correct answer
    
    Args:
        user: The user requesting the explanation
        question: The question dict containing question_text and answer_text
        user_answer: Optional user's attempt at the question
        view_mode: The current viewing mode ('hide', 'show', 'interactive', 'exam', 'conversation')
    """
    client = AIClient()
    
    question_text = question.get("question_text", "")
    answer_text = question.get("answer_text", "")
    
    prompt = f"""
Question: {question_text}
Correct Answer: {answer_text}
"""
    # Only include user attempt if they provided one AND we're in an interactive/exam mode
    has_user_answer = user_answer and user_answer.strip()
    is_interactive_mode = view_mode in ("interactive", "exam", "conversation")
    
    if has_user_answer and is_interactive_mode:
        prompt += f"\nUser's Attempt: {user_answer}"
    
    # Tailor system prompt based on view mode
    if is_interactive_mode and has_user_answer:
        # Interactive/exam modes with user answer: provide personalized feedback
        system_prompt = (
            "Evaluate the user's attempt and explain why it is correct or incorrect. "
            "Be concise and directly address the user. State clearly if the answer is right or wrong, "
            "then briefly explain the key concept. Keep response to 1-3 sentences."
        )
    else:
        # View modes (hide, show) or interactive without answer: just explain the answer
        system_prompt = (
            "Explain the correct answer to this question in 1-3 concise sentences. "
            "Address the reader directly. Be extremely brief and straight to the point. "
            "Focus on why this is the correct answer and the key concept."
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
        title_to_id = {}
        for r_id in resource_ids:
            r = db.query(Resource).filter(Resource.id == r_id, Resource.user_id == user_id).first()
            if r:
                r_text = StorageManager.get_resource_text(r.id)
                if r_text:
                    title_to_id[r.title.strip()] = r.id
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
        
        advanced = req_data.get("advanced", False)
        distribution = req_data.get("distribution", {})
        
        all_questions_data = []
        BATCH_SIZE = 20
        remaining_questions = num_questions
        
        rem_dist = dict(distribution) if advanced else {}
        chunk_index = 0
        
        while remaining_questions > 0:
            chunk_size = min(BATCH_SIZE, remaining_questions)
            
            if advanced and rem_dist:
                def get_chunk_dist(keys, size, total):
                    c_dist = {}
                    allocated = 0
                    for k in keys:
                        amount = min(rem_dist.get(k, 0), int(round((rem_dist.get(k, 0) / max(1, total)) * size)))
                        c_dist[k] = amount
                        allocated += amount
                    
                    diff = size - allocated
                    sorted_keys = sorted(keys, key=lambda x: rem_dist.get(x, 0), reverse=True)
                    while diff != 0:
                        for k in sorted_keys:
                            if diff > 0 and rem_dist.get(k, 0) > c_dist[k]:
                                c_dist[k] += 1
                                diff -= 1
                                break
                            elif diff < 0 and c_dist[k] > 0:
                                c_dist[k] -= 1
                                diff += 1
                                break
                        else:
                            break
                    return c_dist
                
                c_diff = get_chunk_dist(['easy', 'medium', 'hard'], chunk_size, remaining_questions)
                c_len = get_chunk_dist(['short', 'medLen', 'long'], chunk_size, remaining_questions)
                c_type = get_chunk_dist(['typeShort', 'typeLong', 'typeObj', 'typeFill'], chunk_size, remaining_questions)
                
                dist_diff = f"{c_diff.get('easy', 0)} Easy, {c_diff.get('medium', 0)} Medium, {c_diff.get('hard', 0)} Hard"
                dist_len = f"{c_len.get('short', 0)} Short, {c_len.get('medLen', 0)} Medium, {c_len.get('long', 0)} Long"
                dist_type = f"{c_type.get('typeShort', 0)} Short Answer, {c_type.get('typeLong', 0)} Long Answer, {c_type.get('typeObj', 0)} Objective (Multiple Choice), {c_type.get('typeFill', 0)} Fill in the blank"
                
                prompt = f"""Generate exactly {chunk_size} quiz questions based on the following content.

Target question types distribution: {dist_type}.
Target question lengths distribution: {dist_len}.
Target question difficulties distribution: {dist_diff}.
"""
            else:
                prompt = f"""Generate exactly {chunk_size} quiz questions based on the following content.

The questions MUST be of the following types: {types_str}. 
Target lengths: {lengths_str}.
Target difficulties: {diff_str}.
If "mixed" is specified, provide a relatively even mix of 'objective' (multiple choice), 'subjective' (short answer), and 'fill_in_the_blank'.
"""
            if all_questions_data:
                previous_questions = "\n".join([f"- {q.get('question_text', '').replace('```', '')}" for q in all_questions_data[-50:]])
                prompt += f"""
IMPORTANT: You have already generated the following questions in previous batches. DO NOT generate duplicate questions or questions covering the exact same specific concept:
{previous_questions}
"""

            prompt += f"""
Content:
{resources_text}

Format the response as a strict JSON array of objects. Do not wrap it in markdown codeblocks like ```json, just output the raw JSON array.
Each object must have the following keys:
- "question_text": The actual question. For fill in the blank, use "_____" to represent the blank.
- "answer_text": The correct answer (for AI and user reference).
- "question_type": Must be exactly one of: "objective", "subjective", "fill_in_the_blank".
- "options": (ONLY for "objective" type) a list of 4 string options containing the correct answer and 3 distractors. Leave as null for other types.
- "topic": A short 1-4 word description of the specific topic or concept this question covers.
- "difficulty": Must be "Easy", "Medium", or "Hard".
- "resource_title": The exact title of the resource (from the --- Title --- headers above) that this question was derived from.
- "reference_quote": A short, exact excerpt or line from the content that supports the answer.

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
                if isinstance(questions_data, list):
                    valid_questions = []
                    for q in questions_data:
                        if isinstance(q, dict) and "question_text" in q:
                            valid_questions.append(q)
                    all_questions_data.extend(valid_questions)
                else:
                    valid_questions = []
                
                if advanced and rem_dist:
                    for k, v in c_diff.items(): rem_dist[k] = max(0, rem_dist[k] - v)
                    for k, v in c_len.items(): rem_dist[k] = max(0, rem_dist[k] - v)
                    for k, v in c_type.items(): rem_dist[k] = max(0, rem_dist[k] - v)
                    
            except json.JSONDecodeError:
                pass
                
            remaining_questions -= chunk_size
            chunk_index += 1
            progress_callback(40 + int((chunk_index * BATCH_SIZE / num_questions) * 40), f"Generated {len(all_questions_data)}/{num_questions} questions...")
            
            if remaining_questions > 0:
                time.sleep(3)
            
        progress_callback(80, "Mapping references to your resources...")
        
        resource_id_to_title = {v: k for k, v in title_to_id.items()}
        
        order = 0
        for q in all_questions_data:
            q["original_number"] = str(q.get("original_number", order + 1))
            q["order"] = order
            q["id"] = str(order + 1)
            
            try:
                chunks = retrieve_relevant_chunks(q.get("question_text", ""), resource_ids, db, top_k=1)
                if chunks:
                    q["reference_resource_id"] = chunks[0]["resource_id"]
                    q["reference_resource_title"] = resource_id_to_title.get(chunks[0]["resource_id"])
                    q["reference_quote"] = chunks[0].get("text", "")[:300]
                    q["reference_chunk_position"] = chunks[0].get("position")
            except Exception as e:
                logger.warning(f"Embedding lookup failed for question {order}: {e}")
            
            order += 1
            
        StorageManager.save_exercise_json(exercise_id, all_questions_data)
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
        raise
    finally:
        db.close()
