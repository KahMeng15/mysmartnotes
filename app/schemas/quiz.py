from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime

class QuizQuestionBase(BaseModel):
    question_text: str
    answer_text: str
    question_type: str = "subjective"
    options: Optional[Any] = None
    order: int = 0

class QuizQuestionCreate(QuizQuestionBase):
    pass

class QuizQuestionResponse(QuizQuestionBase):
    id: int
    quiz_id: int

    class Config:
        from_attributes = True

class QuizBase(BaseModel):
    title: str
    scope_type: str
    group_id: Optional[str] = None
    subject_id: Optional[str] = None
    lecture_id: Optional[str] = None
    model: Optional[str] = None
    processing_time_ms: Optional[int] = None

class QuizCreate(QuizBase):
    pass

class QuizResponse(QuizBase):
    id: int
    created_at: datetime
    updated_at: datetime
    questions: List[QuizQuestionResponse] = []

    class Config:
        from_attributes = True

class QuizGenerateRequest(BaseModel):
    title: str
    scope_type: str
    scope_id: str
    question_types: List[str] = ["mixed"] # "objective", "subjective", "fill_in_the_blank", "mixed"
    number_of_questions: int = 5

class QuizCheckRequest(BaseModel):
    user_answer: str

class QuizCheckResponse(BaseModel):
    is_correct: bool
    feedback: str
    correct_answer: str
