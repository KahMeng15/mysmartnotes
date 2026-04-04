"""Database utilities and session management"""
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.config import get_settings
from app.models.db import Base
import logging
import uuid

logger = logging.getLogger(__name__)

settings = get_settings()

is_sqlite = "sqlite" in settings.DATABASE_URL


def _get_sqlite_path() -> str:
    """Return the filesystem path for the configured SQLite database."""
    db_url = settings.DATABASE_URL
    if db_url.startswith("sqlite:////"):
        return db_url.replace("sqlite:////", "/", 1)
    if db_url.startswith("sqlite:///"):
        return db_url.replace("sqlite:///", "", 1)
    return db_url


def _ensure_sqlite_directory() -> None:
    """Create the parent directory for a SQLite database if needed."""
    db_path = _get_sqlite_path()
    if db_path == ":memory:":
        return

    parent_dir = Path(db_path).expanduser().resolve().parent
    parent_dir.mkdir(parents=True, exist_ok=True)

# Create engine
engine_kwargs = {
    "echo": settings.DEBUG,
}

if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
    _ensure_sqlite_directory()
else:
    engine_kwargs["pool_size"] = settings.DB_POOL_SIZE
    engine_kwargs["max_overflow"] = settings.DB_MAX_OVERFLOW
    engine_kwargs["pool_timeout"] = settings.DB_POOL_TIMEOUT_SECONDS
    engine_kwargs["pool_recycle"] = settings.DB_POOL_RECYCLE_SECONDS
    engine_kwargs["pool_pre_ping"] = True

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def generate_random_id(db: Session, model, length: int = 8) -> str:
    """Generate a unique hex-based ID with model-specific prefix.
    
    Args:
        db: Database session
        model: SQLAlchemy model class to check for ID uniqueness
        length: Number of hex digits to include (default 8)
    
    Returns:
        A unique prefixed hex ID derived from UUID4
    """
    from app.models.db import SubjectGroup, Subject, Lecture, Summary, Quiz, QuizGroup
    
    prefix = ""
    if model == SubjectGroup:
        prefix = "gp_"
    elif model == Subject:
        prefix = "sj_"
    elif model == Lecture:
        prefix = "nt_"
    elif model == Summary:
        prefix = "sy"
    elif model == Quiz:
        prefix = "qz_"
    elif model == QuizGroup:
        prefix = "qg_"
        
    while True:
        needed_chars = length
        random_chunks = []
        while needed_chars > 0:
            random_chunks.append(uuid.uuid4().hex)
            needed_chars -= 32
        random_part = ''.join(random_chunks)[:length]
        new_id = f"{prefix}{random_part}"
        if not db.query(model).filter(model.id == new_id).first():
            return new_id
        length += 1


def get_db() -> Session:
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database with tables and apply simple migrations"""
    logger.info("Initializing database...")
    Base.metadata.create_all(bind=engine)
    
    # Apply SQLite auto-migrations for missing columns
    if is_sqlite:
        try:
            apply_sqlite_migrations()
        except Exception as e:
            logger.error(f"Failed to apply SQLite migrations: {e}")
            
    logger.info("Database initialized successfully")


def apply_sqlite_migrations():
    """Add missing columns to existing SQLite tables based on models"""
    import sqlite3
    import os
    
    # Extract path from DATABASE_URL: sqlite:///./data/app.db -> ./data/app.db
    db_path = _get_sqlite_path()
    if not os.path.exists(db_path):
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Consolidated list of expected columns across major tables
    migrations = [
        ("users", [
            ("google_oauth_id", "VARCHAR(255) DEFAULT NULL"),
            ("token_version", "INTEGER DEFAULT 0")
        ]),
        ("system_settings", [
            ("session_length", "INTEGER DEFAULT 24"),
            ("session_unit", "TEXT DEFAULT 'hours'"),
            ("session_reset_on_activity", "BOOLEAN DEFAULT 1"),
            ("max_quiz_questions", "INTEGER DEFAULT 500"),
            ("unnecessary_logins_enabled", "BOOLEAN DEFAULT 0"),
            ("footer_text", "TEXT"),
            ("domain_url", "TEXT"),
            ("ai_limit_per_user", "VARCHAR(50) DEFAULT 'unlimited'"),
            ("created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
            ("updated_at", "DATETIME DEFAULT CURRENT_TIMESTAMP")
        ]),
        ("summaries", [
            ("processing_time", "REAL"),
            ("processing_time_ms", "INTEGER"),
            ("split_level", "VARCHAR(10)"),
            ("quickread", "TEXT"),
            ("mode", "VARCHAR(50)"),
            ("output_format", "VARCHAR(50)"),
            ("processing_method", "VARCHAR(50)"),
            ("model", "VARCHAR(100)"),
            ("is_user_edited", "BOOLEAN DEFAULT 0")
        ]),
        ("lectures", [
            ("processing_time_ms", "INTEGER"),
            ("page_count", "INTEGER DEFAULT 0"),
            ("output_pdf_path", "VARCHAR(512)")
        ]),
        ("quizzes", [
            ("group_id", "VARCHAR(16)"),
            ("quiz_group_id", "VARCHAR(16)"),
            ("model", "VARCHAR(100)"),
            ("processing_time_ms", "INTEGER")
        ]),
        ("quiz_questions", [
            ("explanation", "TEXT"),
            ("explanation_mode", "VARCHAR(50)"),
            ("explanation_output", "VARCHAR(50)")
        ]),
        ("quiz_progress", [
            ("last_reviewed_at", "DATETIME DEFAULT CURRENT_TIMESTAMP"),
            ("interval_days", "INTEGER DEFAULT 0"),
            ("ease_factor", "REAL DEFAULT 2.5"),
            ("consecutive_correct", "INTEGER DEFAULT 0")
        ]),
        ("tasks", [
            ("task_id", "VARCHAR(128)"),
            ("progress", "INTEGER DEFAULT 0")
        ])
    ]

    for table_name, columns in migrations:
        # Check if table exists
        cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}';")
        if not cursor.fetchone():
            continue

        # Get existing columns
        cursor.execute(f"PRAGMA table_info({table_name})")
        existing_cols = [row[1] for row in cursor.fetchall()]

        for col_name, col_def in columns:
            if col_name not in existing_cols:
                logger.info(f"Adding column {col_name} to table {table_name}")
                try:
                    cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_def}")
                except sqlite3.OperationalError as e:
                    logger.error(f"Error adding column {col_name} to {table_name}: {e}")
    
    conn.commit()
    conn.close()


def drop_all_tables():
    """Drop all tables (use with caution)"""
    logger.warning("Dropping all database tables...")
    Base.metadata.drop_all(bind=engine)
    logger.warning("All tables dropped")
