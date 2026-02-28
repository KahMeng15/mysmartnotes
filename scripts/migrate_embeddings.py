#!/usr/bin/env python3
"""
Migration script to compute and store embeddings for all existing lectures.
Run this once to backfill the vector database.

Usage:
    python scripts/migrate_embeddings.py
"""

import sys
import os
import logging
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models.db import Lecture, LectureEmbedding, Base
from app.processing.embeddings import compute_and_store_embeddings
from app.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def migrate_embeddings():
    """Compute embeddings for all existing lectures with extracted_text."""
    settings = get_settings()
    
    # Create database connection
    engine = create_engine(
        f"sqlite:///{settings.database_url.replace('sqlite:///', '')}",
        connect_args={"check_same_thread": False}
    )
    
    # Ensure tables exist
    Base.metadata.create_all(engine)
    
    db = Session(engine)
    
    try:
        # Get all lectures with extracted text
        lectures = db.query(Lecture).filter(
            Lecture.extracted_text.isnot(None),
            Lecture.extracted_text != ""
        ).all()
        
        logger.info(f"Found {len(lectures)} lectures with extracted text")
        
        if not lectures:
            logger.warning("No lectures to migrate")
            return
        
        # Count existing embeddings
        existing_embeddings = db.query(LectureEmbedding).count()
        logger.info(f"Existing embeddings: {existing_embeddings}")
        
        # Migrate each lecture
        successful = 0
        failed = 0
        
        for i, lecture in enumerate(lectures, 1):
            try:
                # Check if embeddings already exist
                existing = db.query(LectureEmbedding).filter(
                    LectureEmbedding.lecture_id == lecture.id
                ).count()
                
                if existing > 0:
                    logger.info(f"[{i}/{len(lectures)}] Lecture {lecture.id} ({lecture.title}) - already has {existing} embeddings, skipping")
                    continue
                
                logger.info(f"[{i}/{len(lectures)}] Computing embeddings for lecture {lecture.id} ({lecture.title})")
                
                # Compute and store embeddings
                count = compute_and_store_embeddings(lecture.id, lecture.extracted_text, db)
                
                logger.info(f"  ✓ Stored {count} embeddings")
                successful += 1
                
            except Exception as e:
                logger.error(f"  ✗ Failed: {e}")
                failed += 1
        
        logger.info(f"\nMigration complete: {successful} successful, {failed} failed")
        
        # Summary statistics
        total_embeddings = db.query(LectureEmbedding).count()
        logger.info(f"Total embeddings in database: {total_embeddings}")
        
    finally:
        db.close()
        engine.dispose()


if __name__ == "__main__":
    logger.info("Starting embedding migration...")
    migrate_embeddings()
    logger.info("Migration finished!")
