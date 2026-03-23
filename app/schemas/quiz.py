from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime

class QuizQuestionBase(BaseModel):
    question_text: str
    answer_text: str
    question_type: str = "subjective"
    options: Optional[Any] = None
    order: int = 0
    explanation: Optional[str] = None

class QuizQuestionCreate(QuizQuestionBase):
    pass

class QuizQuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    answer_text: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[Any] = None
    order: Optional[int] = None
    explanation: Optional[str] = None

class QuizQuestionResponse(QuizQuestionBase):
    id: int
    quiz_id: str

    class Config:
        from_attributes = True

class QuizBase(BaseModel):
    title: str
    scope_type: str
    group_id: Optional[str] = None
    subject_id: Optional[str] = None
    lecture_id: Optional[str] = None
    quiz_group_id: Optional[str] = None
    model: Optional[str] = None
    processing_time_ms: Optional[int] = None

class QuizCreate(QuizBase):
    pass

class QuizUpdate(BaseModel):
    title: Optional[str] = None
    quiz_group_id: Optional[str] = None
    scope_type: Optional[str] = None
    group_id: Optional[str] = None
    subject_id: Optional[str] = None
    lecture_id: Optional[str] = None

class QuizResponse(QuizBase):
    id: str
    created_at: datetime
    updated_at: datetime
    questions: List[QuizQuestionResponse] = []

    class Config:
        from_attributes = True

class QuizGroupBase(BaseModel):
    name: str

class QuizGroupCreate(QuizGroupBase):
    pass

class QuizGroupResponse(QuizGroupBase):
    id: str
    user_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class QuizGenerateRequest(BaseModel):
    title: str
    scope_type: str
    scope_id: str
    question_types: List[str] = ["mixed"] # "objective", "subjective", "fill_in_the_blank", "mixed"
    number_of_questions: int = Field(default=5, ge=1, le=500)
    quiz_group_id: Optional[str] = None

class QuizCheckRequest(BaseModel):
    user_answer: str

class QuizCheckResponse(BaseModel):
    is_correct: bool
    feedback: str
    correct_answer: str

class SingleQuestionGenerateRequest(BaseModel):
    question_type: str = "subjective" # objective, subjective, fill_in_the_blank

class QuizExplainRequest(BaseModel):
    scope: str = "source" # source, web, both
    ai_mode: str = "elaborate"
    output_format: str = "sentence"

class BulkQuizQuestionUpdate(BaseModel):
    id: int
    question_text: str
    answer_text: str
    question_type: str
    options: Optional[Any] = None
    order: int
    explanation: Optional[str] = None

class BulkQuizUpdate(BaseModel):
    questions: List[BulkQuizQuestionUpdate]
