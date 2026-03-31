import json
import logging
import os
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.db import User, Quiz, QuizQuestion, Subject, Lecture, SubjectGroup
from app.processing.ai_client import AIClient
from app.utils.db import generate_random_id

logger = logging.getLogger(__name__)

async def generate_advanced_quiz(
    db: Session,
    user: User,
    ai_client: AIClient,
    title: str,
    scope_type: str,
    scope_id: str,
    question_types: List[str],
    num_questions: int = 5,
    quiz_group_id: str = None
) -> Quiz:
    """Generate a quiz with specific question types based on scope content."""
    
    # Retrieve content based on scope
    content = ""
    group_id = None
    subject_id = None
    lecture_id = None
    
    if scope_type == "lecture":
        lecture = db.query(Lecture).filter(Lecture.id == scope_id, Lecture.user_id == user.id).first()
        if lecture:
            content = lecture.extracted_text
            lecture_id = lecture.id
            subject_id = lecture.subject_id
            # Also get the group_id if possible
            subject = db.query(Subject).filter(Subject.id == subject_id).first()
            if subject:
                group_id = subject.group_id
    elif scope_type == "subject":
        subject = db.query(Subject).filter(Subject.id == scope_id, Subject.user_id == user.id).first()
        if subject:
            lectures = db.query(Lecture).filter(Lecture.subject_id == subject.id).all()
            content = "\\n\\n".join([l.extracted_text for l in lectures if l.extracted_text])
            subject_id = subject.id
            group_id = subject.group_id
    elif scope_type == "group":
        group = db.query(SubjectGroup).filter(SubjectGroup.id == scope_id, SubjectGroup.user_id == user.id).first()
        if group:
            subjects = db.query(Subject).filter(Subject.group_id == group.id).all()
            subject_ids = [s.id for s in subjects]
            lectures = db.query(Lecture).filter(Lecture.subject_id.in_(subject_ids)).all()
            content = "\\n\\n".join([l.extracted_text for l in lectures if l.extracted_text])
            group_id = group.id
            
    if not content:
        raise ValueError("No content found for the specified scope.")
        
    # Truncate content if too long to save tokens (e.g. 30k chars)
    if len(content) > 30000:
        content = content[:30000] + "... [truncated]"

    # Prepare prompt based on desired question types
    types_str = ", ".join(question_types)
    prompt = f"""Generate exactly {num_questions} quiz questions based on the following content.

The questions MUST be of the following types: {types_str}. 
If "mixed" is specified, provide a relatively even mix of 'objective' (multiple choice), 'subjective' (short answer), and 'fill_in_the_blank'.

Content:
{content}

Format the response as a strict JSON array of objects. Do not wrap it in markdown codeblocks like ```json, just output the raw JSON array.
Each object must have the following keys:
- "question_text": The actual question. For fill in the blank, use "_____" to represent the blank.
- "answer_text": The correct answer (for AI and user reference).
- "question_type": Must be exactly one of: "objective", "subjective", "fill_in_the_blank".
- "options": (ONLY for "objective" type) a list of 4 string options containing the correct answer and 3 distractors. Leave as null for other types.

Respond with ONLY the JSON array.
"""
    
    import time
    start_time = time.time()
    response = await ai_client.generate_text(prompt, max_tokens=3000)
    processing_time_ms = int((time.time() - start_time) * 1000)
    
    # Parse JSON
    try:
        clean_response = response.strip()
        if clean_response.startswith("```json"):
            clean_response = clean_response[7:-3].strip()
        elif clean_response.startswith("```"):
            clean_response = clean_response[3:-3].strip()
            
        questions_data = json.loads(clean_response)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse quiz generation JSON: {response}")
        raise ValueError("Failed to generate valid quiz questions from AI.") from e

    # Create the Quiz
    quiz = Quiz(
        id=generate_random_id(db, Quiz),
        user_id=user.id,
        title=title,
        scope_type=scope_type,
        group_id=group_id,
        subject_id=subject_id,
        lecture_id=lecture_id,
        quiz_group_id=quiz_group_id,
        model=ai_client.ai_model_name or ai_client.provider,
        processing_time_ms=processing_time_ms
    )
    db.add(quiz)
    db.flush() # Get the quiz ID
    
    # Create the Questions
    for idx, q_data in enumerate(questions_data):
        q = QuizQuestion(
            quiz_id=quiz.id,
            question_text=q_data.get("question_text", ""),
            answer_text=str(q_data.get("answer_text", "")),
            question_type=q_data.get("question_type", "subjective"),
            options=q_data.get("options"),
            order=idx
        )
        db.add(q)
        
    db.commit()
    db.refresh(quiz)
    
    return quiz

async def generate_single_question(
    db: Session,
    user: User,
    ai_client: AIClient,
    quiz: Quiz,
    question_type: str = "subjective"
) -> Dict[str, Any]:
    """Generate a single quiz question based on quiz scope."""
    
    # Retrieve content based on quiz scope
    content = ""
    if quiz.lecture_id:
        lecture = db.query(Lecture).filter(Lecture.id == quiz.lecture_id).first()
        if lecture: content = lecture.extracted_text
    elif quiz.subject_id:
        lectures = db.query(Lecture).filter(Lecture.subject_id == quiz.subject_id).all()
        content = "\\n\\n".join([l.extracted_text for l in lectures if l.extracted_text])
    elif quiz.group_id:
        subjects = db.query(Subject).filter(Subject.group_id == quiz.group_id).all()
        subject_ids = [s.id for s in subjects]
        lectures = db.query(Lecture).filter(Lecture.subject_id.in_(subject_ids)).all()
        content = "\\n\\n".join([l.extracted_text for l in lectures if l.extracted_text])
        
    if not content:
        # Fallback to any content if quiz has no scope (shouldn't happen with AI quizzes)
        raise ValueError("No content found for the specified quiz scope.")
        
    if len(content) > 30000:
        content = content[:30000] + "... [truncated]"

    prompt = f"""Generate exactly ONE quiz question based on the following content.

The question MUST be of the type: {question_type}.

Content:
{content}

Format the response as a strict JSON object. Do not wrap it in markdown codeblocks like ```json, just output the raw JSON object.
The object must have the following keys:
- "question_text": The actual question. For fill in the blank, use "_____" to represent the blank.
- "answer_text": The correct answer (for AI and user reference).
- "question_type": Must be exactly: "{question_type}".
- "options": (ONLY for "objective" type) a list of 4 string options containing the correct answer and 3 distractors. Leave as null for other types.

Respond with ONLY the JSON object.
"""
    
    response = await ai_client.generate_text(prompt, max_tokens=1000)
    
    try:
        clean_response = response.strip()
        if clean_response.startswith("```json"):
            clean_response = clean_response[7:-3].strip()
        elif clean_response.startswith("```"):
            clean_response = clean_response[3:-3].strip()
            
        return json.loads(clean_response)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse single question JSON: {response}")
        raise ValueError("Failed to generate valid quiz question from AI.") from e


async def check_semantic_answer(ai_client: AIClient, question_text: str, correct_answer: str, user_answer: str) -> Dict[str, Any]:
    """Check a user's answer semantically against the ground truth answer."""
    prompt = f"""As an AI tutor, grade the student's answer to the question.
    
Question: {question_text}
Correct Answer (Target): {correct_answer}
Student's Answer: {user_answer}

Is the student's answer conceptually correct? It doesn't need to be word-for-word, just semantically carrying the same right knowledge.
Also explain briefly WHY it is correct or incorrect, pointing out any missing nuances.

Output your response as a strict JSON object with two keys:
- "is_correct": boolean (true/false)
- "feedback": string (Your brief explanation of why)

Do not wrap it in markdown block. Just the JSON object.
"""
    response = await ai_client.generate_text(prompt, max_tokens=500)
    
    try:
        clean_response = response.strip()
        if clean_response.startswith("```json"):
            clean_response = clean_response[7:-3].strip()
        elif clean_response.startswith("```"):
            clean_response = clean_response[3:-3].strip()
            
        return json.loads(clean_response)
    except json.JSONDecodeError:
        logger.error(f"Failed to parse semantic check JSON: {response}")
        return {"is_correct": False, "feedback": "Could not determine correctness due to AI parsing error. Please compare your answer manually."}

def extract_text_from_upload(file_path: str) -> str:
    """Extract text from various file formats for quiz import."""
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext == ".txt":
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read()
            
    if ext in (".pdf", ".pptx"):
        from app.processing.smart_pipeline import SmartPipeline
        pipeline = SmartPipeline()
        return pipeline.process(file_path)
        
    if ext == ".docx":
        from docx import Document
        doc = Document(file_path)
        return "\n".join([p.text for p in doc.paragraphs])
        
    raise ValueError(f"Unsupported file format for extraction: {ext}")

async def import_quiz_from_content(
    db: Session,
    user: User,
    ai_client: AIClient,
    title: str,
    text: str,
    quiz_group_id: Optional[str] = None,
    generate_missing_answers: bool = True
) -> Quiz:
    """Parse questions from raw text and create a quiz."""
    import re as _re

    def _looks_like_provider_error(raw_response: str) -> bool:
        if not raw_response:
            return False
        lower = raw_response.strip().lower()
        error_markers = [
            "connection failed",
            "failed after",
            "provider error",
            "timeout",
            "timed out",
            "[gemini]",
            "[huggingface]",
            "[ollama]",
        ]
        return any(marker in lower for marker in error_markers)

    def _normalize_type(raw: str) -> str:
        lower = (raw or "").lower()
        if lower in {"objective", "multiple_choice", "multiple-choice", "mcq"}:
            return "objective"
        if lower in {"fill_in_the_blank", "fill-in-the-blank", "blank"}:
            return "fill_in_the_blank"
        return "subjective"

    def _extract_fallback_questions(raw_text: str) -> List[Dict[str, Any]]:
        """Best-effort extractor used when AI output is unavailable/unparseable.

        Supports common formats:
        - Q: ... / A: ...
        - Question ... / Answer ...
        - Lines ending with '?' followed by next line(s) as answer.
        """
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
            extracted.append(
                {
                    "question_text": q_text,
                    "original_number": None,
                    "answer_text": a_text,
                    "question_type": q_type,
                    "options": None,
                }
            )

        if extracted:
            return extracted

        # Secondary heuristic: question lines ending with '?' and answer in following lines.
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
                    if answer_parts:
                        break
                    j += 1
                    continue
                # stop if next question-like line encountered
                if candidate.endswith("?"):
                    break
                candidate = _re.sub(r"^(?:a(?:nswer)?\s*[:\-]\s*)", "", candidate, flags=_re.IGNORECASE)
                answer_parts.append(candidate)
                j += 1

            answer_text = " ".join(answer_parts).strip() or "Answer not provided in source text."
            q_type = "fill_in_the_blank" if "_____" in question_text else "subjective"
            extracted.append(
                {
                    "question_text": question_text,
                    "original_number": None,
                    "answer_text": answer_text,
                    "question_type": q_type,
                    "options": None,
                }
            )
            i = j if j > i else i + 1

        return extracted

    def _try_parse_import_payload(raw_response: str):
        """Parse AI output that may include code fences or surrounding prose."""
        if not raw_response:
            raise json.JSONDecodeError("Empty response", "", 0)

        candidates = []
        text = raw_response.strip()
        candidates.append(text)

        # Common fenced output: ```json ... ``` or ``` ... ```
        fenced_blocks = _re.findall(r"```(?:json)?\s*([\s\S]*?)\s*```", text, flags=_re.IGNORECASE)
        candidates.extend([block.strip() for block in fenced_blocks if block.strip()])

        # If model added prose, attempt object/array substring extraction.
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

        # Raise with original raw payload context path.
        raise json.JSONDecodeError("Could not parse JSON payload", text, 0)
    
    # Truncate if too long (25k chars is usually enough for a quiz)
    if len(text) > 25000:
        text = text[:25000] + "... [truncated]"
    
    # PRE-PROCESSING: Fix common PDF extraction artifacts before sending to AI
    # 1. Split squished single-line alphabetic lists: "a. Item. b. Item. c. Item."
    #    This is a very common PDF extraction problem.
    text = _re.sub(
        r'(?<=[.!?])\s+(?=[b-z]\.\s)',   # split before "b. " through "z. " after sentence end
        '\n',
        text
    )
    # 2. Also split "(a) item. (b) item." inline letter-paren sequences
    text = _re.sub(
        r'(?<=\.)\s+(?=\([b-z]\)\s)',
        '\n',
        text
    )

    system_instruction = "You are an expert educational content extractor."
    
    prompt = f"""Extract and structure all quiz questions from the following text. 

Text to process:
---
{text}
---

Rules:
1. **Identify Questions and Answers**: Pair each question with its corresponding answer. Questions may start with numbers like "1.1", "Q1:", "a.", etc.
2. **Generate Missing Answers**: If 'generate_missing_answers' is true, generate accurate answers for any questions that are missing them, based on context.
3. **CRITICAL - Rejoin Broken Lines**: The input may be from a PDF or scanned document where sentences are broken mid-line. Rejoin them into complete, coherent sentences. Example: "control of\nI/O devices." → "control of I/O devices."
4. **CRITICAL - No Orphaned Words**: Never leave a word or abbreviation (like "I/O", "e.g.", "etc.") stranded alone at the end of a sentence if it belongs in the middle. Always rejoin it with the rest of its sentence.
5. **CRITICAL - Clean Question Clusters**: The text may have multiple question numbers grouped together (e.g., "1.4 1.5 1.6 writer must be sure..."). These are chapter/section headers, NOT individual question identifiers. Extract the real question text that follows and only use the first number as the `original_number`.
6. **CRITICAL - Remove Non-Content**: Strip out page numbers (standalone digits on a line), chapter titles (e.g., "Chapter 1 Introduction"), "Practice Exercises" headers, and any other structural artifacts.
7. **NO Empty Strings**: Never include empty strings, lone quotes `" "`, or whitespace-only text in any field.
8. **Preserve Rich Formatting**: Keep bullet points, and format inline list enumerations as proper Markdown lists.
   - Bullet points: `•` or `- ` → keep as `- text` (markdown unordered)
   - Inline numbered lists like `(1) item, (2) item, (3) item` → convert EACH item to a SEPARATE LINE: `1. item\n2. item\n3. item`
   - Alphabetic items like `a. item` or `(a) item`: **DO NOT convert to `-`**. Keep them as `a. item` on their own lines.
   - Use Markdown for bold (`**text**`), italic (`*text*`).
   - Use simple HTML for tables.
9. **CRITICAL - Handle Squished Lists**: PDF extraction often puts list items on one line, like:
   `a. Set value of timer. b. Read the clock. c. Clear memory.`
   Split them onto SEPARATE LINES, keeping the original letter prefix:
   ```
   a. Set value of timer.
   b. Read the clock.
   c. Clear memory.
   ```
   NEVER convert `a. / b. / c.` markers to `- `. Preserve the original list style.
10. **Nested Inline Lists**: If a sentence contains an inline list like "purposes are: (1) X, (2) Y, and (3) Z", convert it to:
    ```
    purposes are:
    1. X
    2. Y
    3. Z
    ```
    The introductory clause stays on the first line, each item on its own numbered line.
11. **Question Extraction**: The `original_number` is the question label (e.g., "1.1", "1.6"). The `question_text` must NOT start with the original number. It should be clean question text only.
11. **Format the output as a strict JSON object** (not an array). Do not use markdown code blocks for the JSON itself.
12. **The JSON object must have**:
    - `"suggested_title"`: A short, descriptive title (e.g., "Intro to Operating Systems").
    - `"questions"`: An array of objects, each with:
        - `"question_text"`: Clean question text (no leading number). Preserve formatting and lists.
        - `"original_number"`: The original question label (e.g., "1.1"). `null` if not found.
        - `"answer_text"`: The answer with all formatting and lists preserved.
        - `"question_type"`: One of `"objective"`, `"subjective"`, `"fill_in_the_blank"`.
        - `"options"`: For `"objective"`, an array of 4 options. `null` for others.

Generate_missing_answers: {generate_missing_answers}

Respond with ONLY the JSON object.
"""

    import time
    start_time = time.time()
    response = await ai_client.generate_text(prompt, max_tokens=3500)
    processing_time_ms = int((time.time() - start_time) * 1000)

    provider_failed = _looks_like_provider_error(response)
    suggested_title = None
    questions_data: List[Dict[str, Any]] = []
    
    if not provider_failed:
        try:
            data = _try_parse_import_payload(response)

            # Handle both old array format and new object format for robustness
            if isinstance(data, list):
                questions_data = data
                suggested_title = None  # Legacy array format - no title suggestion
            else:
                questions_data = data.get("questions", [])
                raw_title = data.get("suggested_title")
                # Use the AI title only if it's a non-empty string
                suggested_title = raw_title.strip() if isinstance(raw_title, str) and raw_title.strip() else None

            logger.info(f"[quiz import] AI suggested_title='{suggested_title}', incoming title='{title}'")

        except json.JSONDecodeError:
            logger.error(f"Failed to parse imported quiz JSON: {response}")

    # Fallback parser for provider outages or malformed AI output.
    if not questions_data:
        questions_data = _extract_fallback_questions(text)
        if questions_data:
            logger.warning(
                "[quiz import] using fallback parser",
                extra={
                    "provider_failed": provider_failed,
                    "extracted_questions": len(questions_data),
                },
            )

    if not questions_data:
        if provider_failed:
            raise ValueError(
                "AI provider is currently unavailable, and no Q/A patterns were detected in your import text. "
                "Try again shortly or import content that includes clear 'Q:' and 'A:' pairs."
            )
        raise ValueError("AI failed to structure the imported content properly. Please check your input.")

    # Normalize and sanitize question payload before persistence.
    normalized_questions: List[Dict[str, Any]] = []
    for q_data in questions_data:
        q_text = str(q_data.get("question_text", "")).strip()
        if not q_text:
            continue
        q_type = _normalize_type(str(q_data.get("question_type", "subjective")))
        options = q_data.get("options") if q_type == "objective" else None
        normalized_questions.append(
            {
                "question_text": q_text,
                "original_number": q_data.get("original_number"),
                "answer_text": str(q_data.get("answer_text", "")).strip(),
                "question_type": q_type,
                "options": options,
            }
        )

    if not normalized_questions:
        raise ValueError("No valid questions could be extracted from the provided content.")

    questions_data = normalized_questions

    # Create the Quiz
    quiz = Quiz(
        id=generate_random_id(db, Quiz),
        user_id=user.id,
        title=(title.strip() if title and title.strip() else None) or suggested_title or "Imported Quiz",
        scope_type="import",
        quiz_group_id=quiz_group_id,
        model=ai_client.ai_model_name or ai_client.provider,
        processing_time_ms=processing_time_ms
    )
    db.add(quiz)
    db.flush()
    
    # Create the Questions
    for idx, q_data in enumerate(questions_data):
        q = QuizQuestion(
            quiz_id=quiz.id,
            question_text=q_data.get("question_text", ""),
            original_number=q_data.get("original_number"),
            answer_text=str(q_data.get("answer_text", "")),
            question_type=q_data.get("question_type", "subjective"),
            options=json.dumps(q_data.get("options")) if q_data.get("options") else None,
            order=idx
        )
        db.add(q)
        
    db.commit()
    db.refresh(quiz)
    
    return quiz
