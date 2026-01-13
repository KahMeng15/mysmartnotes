# 📊 Data Structures

API schemas, data models, and data flow structures for MySmartNotes.

## Overview

This document defines all data structures used across the application:
- **SQLAlchemy Models** - Database ORM models
- **Pydantic Schemas** - API request/response validation
- **Internal Data Structures** - Processing and business logic
- **WebSocket Messages** - Real-time communication formats

---

## SQLAlchemy Models

Located in `/services/shared/models.py`

### User Model

```python
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(255), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255))
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime)
    
    # Relationships
    subjects = relationship("Subject", back_populates="user", cascade="all, delete-orphan")
    study_sessions = relationship("StudySession", back_populates="user")
```

### Subject Model

```python
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

class Subject(Base):
    __tablename__ = "subjects"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    color = Column(String(7))  # Hex color
    icon = Column(String(50))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="subjects")
    lectures = relationship("Lecture", back_populates="subject", cascade="all, delete-orphan")
    
    # Constraints
    __table_args__ = (
        UniqueConstraint('user_id', 'name', name='unique_user_subject'),
    )
```

### Lecture Model

```python
from sqlalchemy import Column, Integer, String, Text, BigInteger, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB

class Lecture(Base):
    __tablename__ = "lectures"
    
    id = Column(Integer, primary_key=True, index=True)
    subject_id = Column(Integer, ForeignKey("subjects.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    file_name = Column(String(512))
    file_path = Column(String(1024))
    file_size = Column(BigInteger)
    file_type = Column(String(50))
    page_count = Column(Integer)
    status = Column(String(50), default="pending")
    error_message = Column(Text)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime)
    processing_time = Column(Integer)
    metadata = Column(JSONB)
    
    # Relationships
    subject = relationship("Subject", back_populates="lectures")
    documents = relationship("GeneratedDocument", back_populates="lecture", cascade="all, delete-orphan")
    flashcards = relationship("Flashcard", back_populates="lecture", cascade="all, delete-orphan")
    share_links = relationship("ShareLink", back_populates="lecture")
```

### GeneratedDocument Model

```python
class GeneratedDocument(Base):
    __tablename__ = "generated_documents"
    
    id = Column(Integer, primary_key=True, index=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False)
    doc_type = Column(String(50), nullable=False)
    file_name = Column(String(512))
    file_path = Column(String(1024))
    file_size = Column(BigInteger)
    format = Column(String(50))
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    metadata = Column(JSONB)
    
    # Relationships
    lecture = relationship("Lecture", back_populates="documents")
    share_links = relationship("ShareLink", back_populates="document")
```

### Flashcard Model

```python
class Flashcard(Base):
    __tablename__ = "flashcards"
    
    id = Column(Integer, primary_key=True, index=True)
    lecture_id = Column(Integer, ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    card_type = Column(String(50), default="basic")
    difficulty = Column(Integer, default=0)
    interval = Column(Integer, default=0)
    repetitions = Column(Integer, default=0)
    ease_factor = Column(Float, default=2.5)
    next_review = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_reviewed = Column(DateTime)
    metadata = Column(JSONB)
    
    # Relationships
    lecture = relationship("Lecture", back_populates="flashcards")
```

---

## Pydantic Schemas

Located in `/services/shared/schemas.py`

### Authentication Schemas

```python
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None

class UserLogin(BaseModel):
    username: str
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: Optional[str]
    is_active: bool
    created_at: datetime
    
    class Config:
        orm_mode = True

class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    user_id: Optional[int] = None
    username: Optional[str] = None
```

### Subject Schemas

```python
class SubjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = Field(None, regex=r'^#[0-9A-Fa-f]{6}$')
    icon: Optional[str] = None

class SubjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    color: Optional[str] = Field(None, regex=r'^#[0-9A-Fa-f]{6}$')
    icon: Optional[str] = None

class SubjectResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: Optional[str]
    icon: Optional[str]
    created_at: datetime
    lecture_count: int = 0
    
    class Config:
        orm_mode = True
```

### Lecture Schemas

```python
from typing import Dict, Any

class LectureUpload(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    subject_id: int

class LectureResponse(BaseModel):
    id: int
    subject_id: int
    name: str
    description: Optional[str]
    file_name: Optional[str]
    file_size: Optional[int]
    file_type: Optional[str]
    page_count: Optional[int]
    status: str
    error_message: Optional[str]
    uploaded_at: datetime
    processed_at: Optional[datetime]
    processing_time: Optional[int]
    metadata: Optional[Dict[str, Any]]
    
    class Config:
        orm_mode = True

class LectureStatusUpdate(BaseModel):
    status: str
    progress: Optional[int] = Field(None, ge=0, le=100)
    error_message: Optional[str] = None
```

### Document Schemas

```python
class DocumentGenerate(BaseModel):
    lecture_id: int
    doc_type: str = Field(..., regex=r'^(cheat_sheet|quiz|flashcards|past_paper)$')
    options: Optional[Dict[str, Any]] = None

class DocumentResponse(BaseModel):
    id: int
    lecture_id: int
    doc_type: str
    file_name: str
    file_path: str
    file_size: int
    format: str
    version: int
    created_at: datetime
    download_url: str
    
    class Config:
        orm_mode = True
```

### Chat Schemas

```python
class ChatMessage(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
    lecture_id: Optional[int] = None
    subject_id: Optional[int] = None
    use_web_search: bool = False

class ChatResponse(BaseModel):
    message: str
    sources: List[Dict[str, Any]] = []
    timestamp: datetime
```

### Task Schemas

```python
class TaskResponse(BaseModel):
    task_id: str
    status: str
    progress: Optional[int] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
```

---

## Internal Data Structures

### OCR Processing Result

```python
from dataclasses import dataclass
from typing import List, Tuple

@dataclass
class BoundingBox:
    x: int
    y: int
    width: int
    height: int
    confidence: float

@dataclass
class Figure:
    page_number: int
    figure_index: int
    bounding_box: BoundingBox
    image_path: str
    caption: Optional[str] = None

@dataclass
class TextRegion:
    page_number: int
    text: str
    bounding_box: BoundingBox
    content_type: str  # heading, paragraph, list, table
    confidence: float

@dataclass
class ProcessedPage:
    page_number: int
    image_path: str
    figures: List[Figure]
    text_regions: List[TextRegion]
    raw_text: str
    
@dataclass
class ProcessingResult:
    lecture_id: int
    pages: List[ProcessedPage]
    total_figures: int
    total_text_length: int
    processing_time: float
    errors: List[str]
```

### Text Chunking

```python
@dataclass
class TextChunk:
    chunk_id: str
    content: str
    page_number: int
    chunk_index: int
    content_type: str
    figures: List[str]  # Figure references
    word_count: int
    
    def to_chroma_document(self) -> Dict:
        return {
            "id": self.chunk_id,
            "content": self.content,
            "metadata": {
                "page_number": self.page_number,
                "chunk_index": self.chunk_index,
                "content_type": self.content_type,
                "figures": self.figures,
                "word_count": self.word_count
            }
        }
```

### RAG Context

```python
@dataclass
class RAGContext:
    query: str
    chunks: List[TextChunk]
    figures: List[Figure]
    web_results: Optional[List[Dict]] = None
    confidence: float = 0.0
    
    def format_for_llm(self) -> str:
        """Format context for LLM prompt"""
        context_parts = []
        
        for chunk in self.chunks:
            context_parts.append(f"[Page {chunk.page_number}]:\n{chunk.content}")
        
        if self.web_results:
            web_text = "\n".join([r['snippet'] for r in self.web_results])
            context_parts.append(f"[Web Search Results]:\n{web_text}")
        
        return "\n\n".join(context_parts)
```

### Document Generation Config

```python
from enum import Enum

class DocumentStyle(str, Enum):
    DENSE = "dense"
    STANDARD = "standard"
    SPACIOUS = "spacious"

@dataclass
class CheatSheetConfig:
    font_name: str = "Arial"
    body_font_size: int = 9
    heading_font_size: int = 11
    margin: float = 0.5  # inches
    columns: int = 2
    line_spacing: float = 1.0
    include_figures: bool = True
    figure_width: float = 3.2  # inches
    style: DocumentStyle = DocumentStyle.DENSE

@dataclass
class QuizConfig:
    num_questions: int = 10
    question_types: List[str] = None  # ['mcq', 'true_false', 'short_answer']
    difficulty: str = "medium"  # easy, medium, hard
    include_answers: bool = True
    include_explanations: bool = True
    
    def __post_init__(self):
        if self.question_types is None:
            self.question_types = ['mcq']
```

---

## WebSocket Message Formats

### Connection Messages

```python
# Client → Server: Connect
{
    "type": "connect",
    "token": "jwt_token_here",
    "user_id": 123
}

# Server → Client: Connected
{
    "type": "connected",
    "user_id": 123,
    "timestamp": "2026-01-13T14:30:22Z"
}
```

### Progress Update Messages

```python
# Server → Client: Task Progress
{
    "type": "task_progress",
    "task_id": "celery-task-uuid",
    "task_type": "ocr_processing",
    "status": "processing",
    "progress": 45,  # 0-100
    "message": "Processing page 9 of 20",
    "lecture_id": 456,
    "timestamp": "2026-01-13T14:30:22Z"
}

# Server → Client: Task Complete
{
    "type": "task_complete",
    "task_id": "celery-task-uuid",
    "task_type": "ocr_processing",
    "status": "completed",
    "result": {
        "lecture_id": 456,
        "page_count": 20,
        "figures_found": 15,
        "processing_time": 125.5
    },
    "timestamp": "2026-01-13T14:32:10Z"
}

# Server → Client: Task Failed
{
    "type": "task_failed",
    "task_id": "celery-task-uuid",
    "task_type": "ocr_processing",
    "status": "failed",
    "error": "Failed to parse PDF: corrupted file",
    "timestamp": "2026-01-13T14:31:05Z"
}
```

### Chat Messages

```python
# Client → Server: Chat Query
{
    "type": "chat_query",
    "message": "What are the main points of photosynthesis?",
    "lecture_id": 456,
    "use_web_search": false
}

# Server → Client: Chat Response (Streaming)
{
    "type": "chat_chunk",
    "chunk": "Photosynthesis is the process by which",
    "timestamp": "2026-01-13T14:30:22Z"
}

# Server → Client: Chat Complete
{
    "type": "chat_complete",
    "full_response": "Photosynthesis is the process...",
    "sources": [
        {
            "page": 5,
            "excerpt": "Photosynthesis converts light energy...",
            "relevance": 0.95
        }
    ],
    "timestamp": "2026-01-13T14:30:25Z"
}
```

### Notification Messages

```python
# Server → Client: Generic Notification
{
    "type": "notification",
    "level": "info",  # info, warning, error, success
    "title": "Document Generated",
    "message": "Your cheat sheet is ready for download",
    "action": {
        "label": "Download",
        "url": "/api/documents/123/download"
    },
    "timestamp": "2026-01-13T14:30:22Z"
}
```

---

## Celery Task Signatures

### Task Result Format

```python
@dataclass
class TaskResult:
    task_id: str
    status: str  # pending, started, success, failure, retry
    result: Optional[Any] = None
    error: Optional[str] = None
    traceback: Optional[str] = None
    meta: Dict[str, Any] = None
    
    def to_dict(self) -> Dict:
        return {
            "task_id": self.task_id,
            "status": self.status,
            "result": self.result,
            "error": self.error,
            "meta": self.meta
        }
```

### Task Metadata

```python
# Stored in Redis during task execution
{
    "task_id": "celery-task-uuid",
    "task_name": "workers.tasks.ocr_tasks.process_lecture",
    "status": "processing",
    "current": 9,
    "total": 20,
    "progress": 45,
    "message": "Processing page 9 of 20",
    "started_at": "2026-01-13T14:29:00Z",
    "updated_at": "2026-01-13T14:30:22Z"
}
```

---

## File Storage Structures

### Upload Directory Structure

```python
@dataclass
class UploadPaths:
    subject_id: int
    lecture_id: int
    base_path: str = "/data/uploads"
    
    @property
    def lecture_dir(self) -> str:
        return f"{self.base_path}/{self.subject_id}/{self.lecture_id}"
    
    @property
    def original_file(self) -> str:
        return f"{self.lecture_dir}/original.pdf"
    
    @property
    def pages_dir(self) -> str:
        return f"{self.lecture_dir}/pages"
    
    @property
    def figures_dir(self) -> str:
        return f"{self.lecture_dir}/figures"
    
    def page_image(self, page_num: int) -> str:
        return f"{self.pages_dir}/page_{page_num:03d}.png"
    
    def figure_image(self, page_num: int, fig_num: int) -> str:
        return f"{self.figures_dir}/slide_{page_num:02d}_fig_{fig_num:02d}.png"
```

### Generated Document Paths

```python
@dataclass
class DocumentPaths:
    subject_id: int
    lecture_id: int
    doc_type: str
    base_path: str = "/data/generated"
    
    @property
    def output_dir(self) -> str:
        return f"{self.base_path}/{self.subject_id}/{self.lecture_id}"
    
    def document_path(self, version: int = 1, ext: str = "docx") -> str:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        return f"{self.output_dir}/{self.doc_type}_v{version}_{timestamp}.{ext}"
```

---

## Validation Rules

### File Upload Validation

```python
class FileValidation:
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    ALLOWED_EXTENSIONS = {'.pdf', '.pptx'}
    ALLOWED_MIME_TYPES = {
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    }
    
    @staticmethod
    def validate_file(file_path: str, file_size: int, mime_type: str) -> Tuple[bool, Optional[str]]:
        """Returns (is_valid, error_message)"""
        if file_size > FileValidation.MAX_FILE_SIZE:
            return False, f"File too large. Maximum size: {FileValidation.MAX_FILE_SIZE / 1024 / 1024}MB"
        
        if mime_type not in FileValidation.ALLOWED_MIME_TYPES:
            return False, f"Invalid file type. Allowed: {', '.join(FileValidation.ALLOWED_EXTENSIONS)}"
        
        return True, None
```

### Input Sanitization

```python
import re

class InputSanitizer:
    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """Remove dangerous characters from filename"""
        # Remove path separators and null bytes
        filename = re.sub(r'[/\\:\0]', '', filename)
        # Remove leading dots
        filename = filename.lstrip('.')
        # Limit length
        if len(filename) > 255:
            name, ext = os.path.splitext(filename)
            filename = name[:255-len(ext)] + ext
        return filename
    
    @staticmethod
    def sanitize_subject_name(name: str) -> str:
        """Sanitize subject name"""
        # Remove leading/trailing whitespace
        name = name.strip()
        # Collapse multiple spaces
        name = re.sub(r'\s+', ' ', name)
        return name
```

---

## Error Response Format

```python
class ErrorResponse(BaseModel):
    error: str
    message: str
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    request_id: Optional[str] = None

# Example usage
{
    "error": "ValidationError",
    "message": "Invalid subject name",
    "details": {
        "field": "name",
        "constraint": "min_length",
        "provided": ""
    },
    "timestamp": "2026-01-13T14:30:22Z",
    "request_id": "req_abc123"
}
```
