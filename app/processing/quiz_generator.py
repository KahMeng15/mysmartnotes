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
    
    # Truncate if too long (25k chars is usually enough for a quiz)
    if len(text) > 25000:
        text = text[:25000] + "... [truncated]"

    system_instruction = "You are an expert educational content extractor."
    
    prompt = f"""Extract and structure all quiz questions from the following text. 

Text to process:
---
{text}
---

Rules:
1. Identify all questions and their corresponding answers (if present).
2. If 'generate_missing_answers' is true, generate accurate answers for any questions that are missing them based on the context.
3. **Preserve Rich Text**: Keep lists (bulleted or numbered), tables, and formatting like **bold** or *italic* in the 'question_text' and 'answer_text'. 
   - Use Markdown for bold/italic/lists.
   - Use simple HTML for tables if encountered.
4. **No Word Squishing**: Ensure all words are separated by proper spaces and punctuation. Do not merge words together.
5. Remove irrelevant fragments like page numbers, headers, or footers.
6. Format the output as a strict JSON object (not an array). Do not use markdown blocks for the JSON itself.
7. The JSON object must have:
   - "suggested_title": A short, descriptive title for the quiz based on the content (e.g., "Intro to Operating Systems").
   - "questions": An array of objects, where each object has:
      - "question_text": The question (with formatting preserved).
      - "answer_text": The answer (with formatting preserved).
      - "question_type": One of "objective", "subjective", "fill_in_the_blank".
      - "options": For "objective", a list of 4 options (including the correct one). null for others.

Generate_missing_answers: {generate_missing_answers}

Respond with ONLY the JSON object.
"""

    import time
    start_time = time.time()
    response = await ai_client.generate_text(prompt, max_tokens=3500)
    processing_time_ms = int((time.time() - start_time) * 1000)
    
    try:
        clean_response = response.strip()
        if clean_response.startswith("```json"):
            clean_response = clean_response[7:-3].strip()
        elif clean_response.startswith("```"):
            clean_response = clean_response[3:-3].strip()
            
        data = json.loads(clean_response)
        
        # Handle both old array format and new object format for robustness
        if isinstance(data, list):
            questions_data = data
            suggested_title = "Imported Quiz"
        else:
            questions_data = data.get("questions", [])
            suggested_title = data.get("suggested_title", "Imported Quiz")
            
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse imported quiz JSON: {response}")
        raise ValueError("AI failed to structure the imported content properly. Please check your input.") from e

    # Create the Quiz
    quiz = Quiz(
        id=generate_random_id(db, Quiz),
        user_id=user.id,
        title=title if title else suggested_title,
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
            answer_text=str(q_data.get("answer_text", "")),
            question_type=q_data.get("question_type", "subjective"),
            options=json.dumps(q_data.get("options")) if q_data.get("options") else None,
            order=idx
        )
        db.add(q)
        
    db.commit()
    db.refresh(quiz)
    
    return quiz
