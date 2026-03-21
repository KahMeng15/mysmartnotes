import json
import logging
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.db import User, Quiz, QuizQuestion, Subject, Lecture, SubjectGroup
from app.processing.ai_client import AIClient

logger = logging.getLogger(__name__)

async def generate_advanced_quiz(
    db: Session,
    user: User,
    ai_client: AIClient,
    title: str,
    scope_type: str,
    scope_id: str,
    question_types: List[str],
    num_questions: int = 5
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
        user_id=user.id,
        title=title,
        scope_type=scope_type,
        group_id=group_id,
        subject_id=subject_id,
        lecture_id=lecture_id,
        model=ai_client.model_name,
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
