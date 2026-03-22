"""Database utilities and session management"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.config import get_settings
from app.models.db import Base
import logging
import random
import string

logger = logging.getLogger(__name__)

settings = get_settings()

# Create engine
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {},
    echo=settings.DEBUG,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def generate_random_id(db: Session, model, length: int = 8) -> str:
    """Generate a unique case-sensitive alphanumeric ID with model-specific prefix.
    
    Args:
        db: Database session
        model: SQLAlchemy model class to check for ID uniqueness
        length: Length of the random part of the ID (default 8)
    
    Returns:
        A unique prefixed random alphanumeric ID (case-sensitive)
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
        random_part = ''.join(random.choices(string.ascii_letters + string.digits, k=length))
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
    """Initialize database with tables"""
    logger.info("Initializing database...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database initialized successfully")


def drop_all_tables():
    """Drop all tables (use with caution)"""
    logger.warning("Dropping all database tables...")
    Base.metadata.drop_all(bind=engine)
    logger.warning("All tables dropped")
