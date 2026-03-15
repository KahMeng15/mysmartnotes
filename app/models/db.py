"""Database models"""
from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, Table, Float, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()


class User(Base):
    """User accounts"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255))
    nickname = Column(String(100))
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    is_approved = Column(Boolean, default=True) # Manual approval flow
    tier = Column(String(50), default="free") # free, pro, etc.
    ai_provider = Column(String(50), default="gemini") # gemini, chatgpt, claude, huggingface, openrouter, local
    ai_model = Column(String(100), nullable=True)
    ai_base_url = Column(String(255), nullable=True)
    ai_api_key = Column(String(255), nullable=True)
    use_global_ai_config = Column(Boolean, default=False)  # Whether to use global settings instead of personal
    
    # Pomodoro Preferences
    pomo_study_mins = Column(Integer, default=25)
    pomo_break_mins = Column(Integer, default=5)
    pomo_long_break_mins = Column(Integer, default=15)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    subjects = relationship("Subject", back_populates="owner", cascade="all, delete-orphan")
    study_sessions = relationship("StudySession", back_populates="user", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")
    subject_groups = relationship("SubjectGroup", back_populates="user", cascade="all, delete-orphan")


class SubjectGroup(Base):
    """Group of subjects (e.g. Semester 1)"""
    __tablename__ = "subject_groups"
    
    id = Column(String(8), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="subject_groups")
    subjects = relationship("Subject", back_populates="group", cascade="all, delete-orphan")


class Subject(Base):
    """Course/Subject organization"""
    __tablename__ = "subjects"
    
    id = Column(String(8), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    group_id = Column(String(8), ForeignKey("subject_groups.id"), nullable=True)
    name = Column(String(255), nullable=False)
    description = Column(Text)
    color = Column(String(7), default="#3b82f6")  # hex color
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    owner = relationship("User", back_populates="subjects")
    group = relationship("SubjectGroup", back_populates="subjects")
    lectures = relationship("Lecture", back_populates="subject", cascade="all, delete-orphan")


class Lecture(Base):
    """Lecture/Document"""
    __tablename__ = "lectures"
    
    id = Column(String(8), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subject_id = Column(String(8), ForeignKey("subjects.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    file_name = Column(String(255))
    file_type = Column(String(20))  # pdf, pptx, image
    file_size = Column(Integer)
    page_count = Column(Integer, default=0)
    extracted_text = Column(Text)
    extracted_content_structured = Column(Text)  # JSON: structured content segments with headers, types, etc.
    extracted_images_metadata = Column(Text)  # JSON: image extraction metadata
    output_pdf_path = Column(String(512))  # Path to generated OUTPUT.pdf
    processing_time_ms = Column(Integer, nullable=True)  # Processing time in milliseconds
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User")
    subject = relationship("Subject", back_populates="lectures")
    documents = relationship("GeneratedDocument", back_populates="lecture", cascade="all, delete-orphan")
    flashcards = relationship("Flashcard", back_populates="lecture", cascade="all, delete-orphan")
    embeddings = relationship("LectureEmbedding", back_populates="lecture", cascade="all, delete-orphan")


class ExportTemplate(Base):
    """User-defined export templates"""
    __tablename__ = "export_templates"
    
    id = Column(String(8), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # NULL = system default
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_default = Column(Boolean, default=False)
    config = Column(JSON, nullable=False)  # Full template configuration
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User")


class GeneratedDocument(Base):
    """Generated cheat sheets, quizzes, etc."""
    __tablename__ = "generated_documents"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    lecture_id = Column(String(8), ForeignKey("lectures.id"), nullable=False, index=True)
    document_type = Column(String(50))  # cheatsheet, quiz, summary
    title = Column(String(255), nullable=False)
    file_path = Column(String(512), nullable=False)
    content = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    lecture = relationship("Lecture", back_populates="documents")


class LectureEmbedding(Base):
    """Pre-computed embeddings for lecture chunks (vector DB)"""
    __tablename__ = "lecture_embeddings"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    lecture_id = Column(String(8), ForeignKey("lectures.id"), nullable=False, index=True)
    chunk_text = Column(Text, nullable=False)  # Original text of this chunk
    chunk_index = Column(Integer, nullable=False)  # Order of this chunk in lecture
    embedding = Column(JSON, nullable=False)  # Embedding vector as list of floats
    position = Column(Integer)  # Character position in original text
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    lecture = relationship("Lecture", back_populates="embeddings")


class Flashcard(Base):
    """Study flashcards"""
    __tablename__ = "flashcards"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    lecture_id = Column(String(8), ForeignKey("lectures.id"), nullable=False, index=True)
    question = Column(Text, nullable=False)
    answer = Column(Text, nullable=False)
    difficulty = Column(String(20), default="medium")  # easy, medium, hard
    times_reviewed = Column(Integer, default=0)
    times_correct = Column(Integer, default=0)
    last_reviewed = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    lecture = relationship("Lecture", back_populates="flashcards")


class StudySession(Base):
    """Study session tracking"""
    __tablename__ = "study_sessions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    lecture_id = Column(String(8), ForeignKey("lectures.id"), nullable=True, index=True)
    session_type = Column(String(50))  # flashcard, quiz, chat, pomodoro_study, pomodoro_break, stopwatch
    duration_minutes = Column(Integer)
    questions_attempted = Column(Integer, default=0)
    questions_correct = Column(Integer, default=0)
    score = Column(Float)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime)
    status = Column(String(50), default="completed") # completed, interrupted
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="study_sessions")
    lecture = relationship("Lecture")


class Task(Base):
    """Background tasks tracking"""
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    task_type = Column(String(100))  # ocr, embedding, generation
    status = Column(String(50), default="pending")  # pending, processing, completed, failed
    input_data = Column(Text)  # JSON
    result = Column(Text)  # JSON
    error_message = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="tasks")


class ChatMessage(Base):
    """Chat message history"""
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    lecture_id = Column(String(8), ForeignKey("lectures.id"), nullable=True, index=True)
    subject_id = Column(String(8), ForeignKey("subjects.id"), nullable=True, index=True)
    group_id = Column(String(8), ForeignKey("subject_groups.id"), nullable=True, index=True)
    message = Column(Text, nullable=False)
    response = Column(Text, nullable=False)
    sources = Column(Text)  # JSON array of sources
    created_at = Column(DateTime, default=datetime.utcnow)

    # Conversation threading
    conversation_id = Column(String(36), nullable=True, index=True)   # UUID grouping messages into a conversation
    conversation_title = Column(String(255), nullable=True)            # AI-generated or derived title
    reply_to_message_id = Column(Integer, ForeignKey("chat_messages.id"), nullable=True) # ID of the message being replied to
    ai_mode = Column(String(50), nullable=True, default="elaborate")   # Which AI response mode was used
    output_format = Column(String(50), nullable=True, default="sentence") # Output format: sentence, pointform, numbered_list, table
    detailed_sources_json = Column(Text, nullable=True)                # JSON: full detailed source objects for history replay
    ai_model = Column(String(255), nullable=True)                      # e.g. "GEMINI (gemini-1.5-flash)"
    timings_json = Column(Text, nullable=True)                         # JSON: {retrieval_ms, model_ms, total_ms}
    is_pinned = Column(Boolean, default=False)
    is_favourite = Column(Boolean, default=False)
    
    # Relationships
    user = relationship("User")
    lecture = relationship("Lecture")
    subject = relationship("Subject")
    group = relationship("SubjectGroup")


class NoteSnapshot(Base):
    """Named snapshots of lecture notes for version history"""
    __tablename__ = "note_snapshots"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    lecture_id = Column(String(8), ForeignKey("lectures.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User")
    lecture = relationship("Lecture")


class SystemSettings(Base):
    """Global System Configuration"""
    __tablename__ = "system_settings"

    id = Column(Integer, primary_key=True, autoincrement=True) # Usually just 1 row
    lockdown_mode = Column(Boolean, default=False)
    signup_config = Column(String(50), default="open") # open, approval, invite
    maintenance_mode = Column(Boolean, default=False)
    footer_text = Column(String(255), nullable=True)
    domain_url = Column(String(255), nullable=True) # Domain for invitation/reset links
    global_ai_provider = Column(String(50), default="gemini")
    global_ai_model = Column(String(100), nullable=True)
    global_ai_api_key = Column(String(255), nullable=True)
    global_ai_base_url = Column(String(255), nullable=True)
    ai_limit_per_user = Column(String(50), default="unlimited") # sec, min, hour, day, unlimited
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserInvitation(Base):
    """Pending user invitations"""
    __tablename__ = "user_invitations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), nullable=False, unique=True, index=True)
    token = Column(String(100), nullable=False, unique=True, index=True)
    invited_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    tier = Column(String(50), default="free")
    is_used = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    inviter = relationship("User")


class EmailConfig(Base):
    """SMTP Email Configuration"""
    __tablename__ = "email_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    smtp_provider = Column(String(100), nullable=True)
    email_address = Column(String(255), nullable=True)
    sender_name = Column(String(100), nullable=True)
    app_password = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserLog(Base):
    """Audit logs for actions"""
    __tablename__ = "user_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True) # allow null for failed logins/global actions
    action = Column(String(100), nullable=False) # login, signup, page_access, upload, processing, chat, etc.
    ip_address = Column(String(50), nullable=True)
    device_info = Column(Text, nullable=True)
    details = Column(Text, nullable=True) # Extra info (JSON or string)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    user = relationship("User")


class IPFilter(Base):
    """IP Whitelist / Blacklist rules"""
    __tablename__ = "ip_filters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    filter_type = Column(String(20), nullable=False) # whitelist, blacklist
    rule_type = Column(String(20), nullable=False) # country, specific_ip
    value = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class RateLimitConfig(Base):
    """Specific rate limits for different modules"""
    __tablename__ = "rate_limits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    per_user_api = Column(Integer, default=0) # 0 means unlimited
    global_api = Column(Integer, default=0)
    chat_api = Column(Integer, default=0)
    processing_api = Column(Integer, default=0)
    sessions = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
