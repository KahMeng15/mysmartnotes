"""Request/Response schemas"""
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List


# ========== User Schemas ==========
class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None
    nickname: Optional[str] = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    nickname: str
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    nickname: Optional[str] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    ai_base_url: Optional[str] = None
    ai_api_key: Optional[str] = None
    use_global_ai_config: Optional[bool] = None


class User(UserBase):
    id: int
    is_active: bool
    is_admin: bool = False
    is_approved: bool = True
    tier: str = "free"
    ai_provider: str = "gemini"
    ai_model: Optional[str] = None
    ai_base_url: Optional[str] = None
    ai_api_key: Optional[str] = None
    use_global_ai_config: bool = False
    created_at: datetime
    
    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: User


# ========== Subject Schemas ==========

# ========== Subject Group Schemas ==========
class SubjectGroupBase(BaseModel):
    name: str

class SubjectGroupCreate(SubjectGroupBase):
    pass

class SubjectGroupUpdate(BaseModel):
    name: Optional[str] = None

class SubjectGroup(SubjectGroupBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ========== Subject Schemas ==========
class SubjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#3b82f6"
    group_id: Optional[int] = None


class SubjectCreate(SubjectBase):
    pass


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    group_id: Optional[int] = None


class Subject(SubjectBase):
    id: int
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class SubjectResponse(Subject):
    """Response schema for subject endpoints"""
    pass


class SubjectGroupResponse(SubjectGroup):
    subjects: List[SubjectResponse] = []


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
    page_count: int = 0
    extracted_text: Optional[str] = None
    extracted_content_structured: Optional[str] = None
    extracted_images_metadata: Optional[str] = None
    output_pdf_path: Optional[str] = None
    processing_time_ms: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class LectureResponse(Lecture):
    """Response schema for lecture endpoints"""
    subject: Optional[Subject] = None


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
    lecture_id: Optional[int] = None
    session_type: str
    duration_minutes: int
    questions_attempted: int = 0
    questions_correct: int = 0
    score: Optional[float] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    status: Optional[str] = "completed"


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


# ========== Note Snapshot Schemas ==========
class NoteSnapshotCreate(BaseModel):
    name: str
    content: str


class NoteSnapshotResponse(BaseModel):
    id: int
    lecture_id: int
    user_id: int
    name: str
    content: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# ========== Lecture Content Update ==========
class LectureContentUpdate(BaseModel):
    extracted_text: str
