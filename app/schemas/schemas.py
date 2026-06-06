"""Request/Response schemas"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from datetime import datetime
from typing import Optional, List, Any, Annotated
import re


# Constants for validation
NICKNAME_REGEX = r"^[a-zA-Z0-9_-]+$"
FULL_NAME_REGEX = r"^[a-zA-Z\s\-\'\.]+$"

# Reusable types with validation
NicknameStr = Annotated[str, Field(min_length=2, max_length=30, pattern=NICKNAME_REGEX)]
FullNameStr = Annotated[str, Field(min_length=2, max_length=100, pattern=FULL_NAME_REGEX)]


# ========== User Schemas ==========
class UserBase(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    full_name: Optional[FullNameStr] = None
    nickname: Optional[NicknameStr] = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    nickname: NicknameStr
    full_name: Optional[FullNameStr] = None
    agree_tos: bool = False
    agree_privacy: bool = False
    agree_fair_use: bool = False


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[FullNameStr] = None
    nickname: Optional[NicknameStr] = None
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    ai_base_url: Optional[str] = None
    ai_api_key: Optional[str] = None # Ignored by backend, but accepted from frontend
    use_global_ai_config: Optional[bool] = None
    nav_sidebar_open: Optional[bool] = None
    action_sidebar_open: Optional[bool] = None


class User(UserBase):
    id: int
    is_active: Optional[bool] = True
    is_admin: bool = False
    is_approved: bool = True
    is_verified: bool = False
    tier: str = "free"
    ai_provider: str = "gemini"
    ai_model: Optional[str] = None
    ai_base_url: Optional[str] = None
    ai_api_key_configured: bool = False
    use_global_ai_config: bool = True
    nav_sidebar_open: bool = True
    action_sidebar_open: bool = True
    created_at: Optional[datetime] = None
    
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
    id: str
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
    group_id: Optional[str] = None


class SubjectCreate(SubjectBase):
    pass


class SubjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    group_id: Optional[str] = None


class Subject(SubjectBase):
    id: str
    user_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class SubjectResponse(Subject):
    """Response schema for subject endpoints"""
    group: Optional[SubjectGroup] = None


class SubjectGroupResponse(SubjectGroup):
    subjects: List[SubjectResponse] = []


# ========== Lecture Schemas ==========
class LectureBase(BaseModel):
    title: str
    subject_id: str


class LectureCreate(LectureBase):
    pass


class Lecture(LectureBase):
    id: str
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
    subject: Optional[SubjectResponse] = None


# ========== Auth Schemas ==========
class SummaryBase(BaseModel):
    title: str
    summary_type: str


class Summary(SummaryBase):
    id: int
    lecture_id: str
    file_path: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# ========== Study Session Schemas ==========
class StudySessionCreate(BaseModel):
    lecture_id: Optional[str] = None
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
    lecture_id: str
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
    lecture_id: str
    user_id: int
    name: str
    content: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# ========== Lecture Content Update ==========
class LectureContentUpdate(BaseModel):
    extracted_text: str


# ========== Export Template Schemas ==========
class TemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    config: Optional[Any] = None


class TemplateDuplicate(BaseModel):
    name: Optional[str] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Any] = None
