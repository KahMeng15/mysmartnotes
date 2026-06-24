from pydantic import BaseModel, Field
from typing import List, Optional, Any
from datetime import datetime
from app.schemas.schemas import SubjectResponse

class ExerciseQuestionBase(BaseModel):
    question_text: str
    answer_text: str
    question_type: str = "subjective"
    options: Optional[Any] = None
    order: int = 0
    explanation: Optional[str] = None

class ExerciseQuestionCreate(ExerciseQuestionBase):
    pass

class ExerciseQuestionUpdate(BaseModel):
    question_text: Optional[str] = None
    answer_text: Optional[str] = None
    question_type: Optional[str] = None
    options: Optional[Any] = None
    order: Optional[int] = None
    explanation: Optional[str] = None

class ExerciseQuestionResponse(ExerciseQuestionBase):
    id: int
    exercise_id: str
    reference_resource_id: Optional[str] = None

    class Config:
        from_attributes = True

class ExerciseBase(BaseModel):
    title: str
    group_id: Optional[str] = None
    subject_id: Optional[str] = None
    resource_id: Optional[str] = None
    file_path: Optional[str] = None
    file_name: Optional[str] = None
    model: Optional[str] = None
    processing_time_ms: Optional[int] = None
    parameters: Optional[Any] = None

class ExerciseCreate(ExerciseBase):
    pass

class ExerciseUpdate(BaseModel):
    title: Optional[str] = None
    group_id: Optional[str] = None
    subject_id: Optional[str] = None
    resource_id: Optional[str] = None

class ExerciseResponse(ExerciseBase):
    id: str
    created_at: datetime
    updated_at: datetime
    questions: List[ExerciseQuestionResponse] = []
    subject: Optional[SubjectResponse] = None

    class Config:
        from_attributes = True

class ExerciseCheckRequest(BaseModel):
    user_answer: str

class ExerciseCheckResponse(BaseModel):
    is_correct: bool
    feedback: str
    correct_answer: str

class ExerciseExplainRequest(BaseModel):
    scope: str = "source" # source, web, both
    ai_mode: str = "elaborate"
    output_format: str = "sentence"
    user_answer: Optional[str] = None

class BulkExerciseQuestionUpdate(BaseModel):
    id: int
    question_text: str
    answer_text: str
    question_type: str
    options: Optional[Any] = None
    order: int
    explanation: Optional[str] = None

class BulkExerciseUpdate(BaseModel):
    questions: List[BulkExerciseQuestionUpdate]

class ExerciseGenerateRequest(BaseModel):
    subject_id: str
    resource_ids: List[str]
    title: Optional[str] = None
    question_types: List[str] = ["Short answer", "Long answer", "Objective", "Fill in the blank"]
    lengths: List[str] = ["Short", "Medium", "Long"]
    difficulties: List[str] = ["Easy", "Medium", "Hard"]
    num_questions: int = 10
