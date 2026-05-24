"""Database utilities and session management"""
import os
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.config import get_settings
from app.models.db import Base
import logging
import uuid

logger = logging.getLogger(__name__)

settings = get_settings()

is_sqlite = "sqlite" in settings.DATABASE_URL


def _project_root() -> Path:
    """Return the application root directory."""
    return Path(__file__).resolve().parents[2]


def _get_sqlite_path() -> str:
    """Return the filesystem path for the configured SQLite database."""
    db_url = settings.DATABASE_URL
    if db_url.startswith("sqlite:////"):
        return db_url.replace("sqlite:////", "/", 1)
    if db_url.startswith("sqlite:///"):
        raw_path = db_url.replace("sqlite:///", "", 1)
        if raw_path == ":memory:":
            return raw_path
        if raw_path.startswith("/"):
            return raw_path
        return str((_project_root() / raw_path).resolve())
    return db_url


def _normalize_database_url() -> str:
    """Convert a relative SQLite URL to an absolute one."""
    if not is_sqlite:
        return settings.DATABASE_URL

    db_path = _get_sqlite_path()
    if db_path == ":memory:":
        return settings.DATABASE_URL
    return f"sqlite:////{db_path.lstrip('/')}"


def _ensure_sqlite_directory() -> None:
    """Create the parent directory for the SQLite database."""
    db_path = _get_sqlite_path()
    
    if db_path == ":memory:":
        logger.info("Using in-memory SQLite database")
        return

    db_path_obj = Path(db_path).expanduser().resolve()
    parent_dir = db_path_obj.parent
    
    try:
        parent_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Parent directory created/verified")
    except Exception as e:
        logger.error(f"Failed to create parent directory {parent_dir}: {e}")
        raise

# Create engine
engine_kwargs = {
    "echo": os.getenv("SQL_ECHO", "false").lower() == "true",
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

normalized_url = _normalize_database_url()
logger.info(f"Creating SQLAlchemy engine with URL: {normalized_url}")
engine = create_engine(normalized_url, **engine_kwargs)

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
    from app.models.db import SubjectGroup, Subject, Lecture, Summary, Quiz, QuizGroup, ChatMessage
    
    prefix = ""
    if model == SubjectGroup:
        prefix = "gp_"
    elif model == Subject:
        prefix = "sj_"
    elif model == Lecture:
        prefix = "nt_"
    elif model == Summary:
        prefix = "sy_"
    elif model == Quiz:
        prefix = "qz_"
    elif model == QuizGroup:
        prefix = "qg_"
    elif model == ChatMessage:
        prefix = "mg_"
        
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


def generate_conversation_id(db: Session, length: int = 8) -> str:
    """Generate a unique conversation ID with 'cv_' prefix.
    
    Checks against ChatMessage.conversation_id for uniqueness.
    """
    from app.models.db import ChatMessage
    prefix = "cv_"
    
    while True:
        needed_chars = length
        random_chunks = []
        while needed_chars > 0:
            random_chunks.append(uuid.uuid4().hex)
            needed_chars -= 32
        random_part = ''.join(random_chunks)[:length]
        new_id = f"{prefix}{random_part}"
        # Check uniqueness against conversation_id column
        if not db.query(ChatMessage).filter(ChatMessage.conversation_id == new_id).first():
            return new_id
        length += 1


def get_db() -> Generator[Session, None, None]:
    """Dependency for getting database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database with tables and apply simple migrations"""
    logger.info("Initializing database...")
    logger.info(f"Engine URL: {engine.url}")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created/verified")
    except Exception as e:
        logger.error(f"Failed to create database tables: {e}", exc_info=True)
        raise

    # Apply migrations for type changes (e.g. ChatMessage ID change)
    if not is_sqlite:
        try:
            apply_postgresql_migrations()
        except Exception as e:
            logger.error(f"Failed to apply PostgreSQL migrations: {e}")
    else:
        try:
            apply_sqlite_migrations()
        except Exception as e:
            logger.error(f"Failed to apply SQLite migrations: {e}")

    logger.info("Database initialized successfully")


def apply_postgresql_migrations():
    """Apply migrations specific to PostgreSQL (e.g. changing column types)"""
    from sqlalchemy import text
    try:
        # Check first without a heavy transaction
        with engine.connect() as conn:
            res = conn.execute(text("""
                SELECT data_type 
                FROM information_schema.columns 
                WHERE table_name = 'chat_messages' AND column_name = 'id'
            """)).fetchone()
            
            needs_migration = res and res[0].lower() in ('integer', 'bigint', 'numeric')

        if needs_migration:
            logger.info(f"Migrating chat_messages table to use string IDs (current type: {res[0]})...")
            
            # Now run migration in a proper transaction
            with engine.begin() as conn:
                # Find and drop all foreign keys pointing TO or FROM chat_messages
                fk_res = conn.execute(text("""
                    SELECT conname, r.relname 
                    FROM pg_constraint c 
                    JOIN pg_class r ON c.conrelid = r.oid 
                    WHERE r.relname = 'chat_messages' AND c.contype = 'f'
                """)).all()
                
                for row in fk_res:
                    logger.info(f"Dropping constraint {row[0]} on {row[1]}")
                    conn.execute(text(f'ALTER TABLE "{row[1]}" DROP CONSTRAINT IF EXISTS "{row[0]}"'))
                
                fk_ref_res = conn.execute(text("""
                    SELECT conname, r.relname 
                    FROM pg_constraint c 
                    JOIN pg_class r ON c.conrelid = r.oid 
                    JOIN pg_class t ON c.confrelid = t.oid
                    WHERE t.relname = 'chat_messages' AND c.contype = 'f'
                """)).all()
                
                for row in fk_ref_res:
                    logger.info(f"Dropping external constraint {row[0]} on {row[1]}")
                    conn.execute(text(f'ALTER TABLE "{row[1]}" DROP CONSTRAINT IF EXISTS "{row[0]}"'))

                # Change column types with explicit casting
                logger.info("Altering column types...")
                conn.execute(text('ALTER TABLE chat_messages ALTER COLUMN id TYPE VARCHAR(16) USING id::varchar'))
                conn.execute(text('ALTER TABLE chat_messages ALTER COLUMN reply_to_message_id TYPE VARCHAR(16) USING reply_to_message_id::varchar'))
                conn.execute(text('ALTER TABLE chat_messages ALTER COLUMN conversation_id TYPE VARCHAR(64) USING conversation_id::varchar'))
                
                # Remove default nextval (sequence)
                conn.execute(text("ALTER TABLE chat_messages ALTER COLUMN id DROP DEFAULT"))
                
                # Restore constraints
                logger.info("Restoring constraints...")
                conn.execute(text('ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_reply_to_message_id_fkey FOREIGN KEY (reply_to_message_id) REFERENCES chat_messages(id)'))
                conn.execute(text('ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id)'))
                conn.execute(text('ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_lecture_id_fkey FOREIGN KEY (lecture_id) REFERENCES lectures(id)'))
                conn.execute(text('ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_subject_id_fkey FOREIGN KEY (subject_id) REFERENCES subjects(id)'))
                conn.execute(text('ALTER TABLE chat_messages ADD CONSTRAINT chat_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES subject_groups(id)'))
                
            logger.info("Successfully migrated chat_messages to string IDs")
    except Exception as e:
        logger.error(f"PostgreSQL migration failed: {e}", exc_info=True)
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
            ("token_version", "INTEGER DEFAULT 0"),
            ("note_processing_mode", "VARCHAR(50) DEFAULT 'smart'")
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
        cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}';")  # nosec - table_name from hardcoded migrations list
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
