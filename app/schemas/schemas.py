"""Request/Response schemas"""
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List


# ========== User Schemas ==========
class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    username: str
    password: str


class User(UserBase):
    id: int
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ========== Subject Schemas ==========
class SubjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#3b82f6"


class SubjectCreate(SubjectBase):
    pass


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None


class Subject(SubjectBase):
    id: int
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class SubjectResponse(Subject):
    """Response schema for subject endpoints"""
    pass


# ========== Lecture Schemas ==========
class LectureBase(BaseModel):
    title: str
    subject_id: int


class LectureCreate(LectureBase):
    pass


class Lecture(LectureBase):
    id: int
    file_path: str
    file_type: str
    file_size: int
    file_name: str
    user_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class LectureResponse(Lecture):
    """Response schema for lecture endpoints"""
    pass


# ========== Flashcard Schemas ==========
class FlashcardBase(BaseModel):
    question: str
    answer: str
    difficulty: str = "medium"


class FlashcardCreate(FlashcardBase):
    lecture_id: int


class FlashcardUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    difficulty: Optional[str] = None


class Flashcard(FlashcardBase):
    id: int
    lecture_id: int
    times_reviewed: int
    times_correct: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# ========== Document Schemas ==========
class DocumentBase(BaseModel):
    title: str
    document_type: str


class GeneratedDocument(DocumentBase):
    id: int
    lecture_id: int
    file_path: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# ========== Study Session Schemas ==========
class StudySessionCreate(BaseModel):
    session_type: str
    duration_minutes: int
    questions_attempted: int
    questions_correct: int
    score: Optional[float] = None


class StudySession(StudySessionCreate):
    id: int
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


# ========== Task Schemas ==========
class TaskResponse(BaseModel):
    id: int
    task_type: str
    status: str
    created_at: datetime
    updated_at: datetime
    result: Optional[str] = None
    error_message: Optional[str] = None
    
    class Config:
        from_attributes = True


# ========== Chat Schemas ==========
class ChatMessage(BaseModel):
    lecture_id: int
    message: str


class ChatResponse(BaseModel):
    message: str
    response: str
    sources: Optional[List[str]] = None
