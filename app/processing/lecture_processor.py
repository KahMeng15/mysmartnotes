import os
import json
import logging
import time
from datetime import datetime
from typing import Optional, Callable, Any

from app.models.db import User, Lecture
from app.utils.db import SessionLocal
from app.utils.tasks import TaskManager
from app.utils.storage import StorageManager
from app.processing.ocr import OCRProcessor
from app.processing.smart_pipeline import SmartPipeline

logger = logging.getLogger(__name__)

def get_pipeline_for_user(user: User) -> SmartPipeline:
    """Get a SmartPipeline instance with the appropriate settings for this user."""
    from app.config import get_settings
    app_settings = get_settings()
    
    # Resolve Gemini API key: ALWAYS pull from environment variables for security
    gemini_key = app_settings.GLOBAL_AI_TIER1_API_KEY or app_settings.GEMINI_API_KEY
    gemini_model = app_settings.GLOBAL_AI_TIER1_MODEL

    if not getattr(user, "use_global_ai_config", False):
        if getattr(user, "ai_model", None):
            gemini_model = user.ai_model

    return SmartPipeline(
        use_polish=bool(gemini_key),
        gemini_api_key=gemini_key,
        gemini_model=gemini_model,
    )

def ensure_valid_markdown_result(markdown: str) -> str:
    """
    SmartPipeline returns an error string on failure; treat that as a real failure
    """
    if isinstance(markdown, str) and markdown.startswith("Error:"):
        raise RuntimeError(markdown)
    return markdown

def extract_markdown_for_user(user: User, file_path: str, progress_callback: Optional[Callable] = None) -> str:
    """
    Process a lecture with the configured SmartPipeline.
    """
    pipeline = get_pipeline_for_user(user)
    try:
        return ensure_valid_markdown_result(pipeline.process(file_path, progress_callback=progress_callback))
    except Exception:
        if not getattr(pipeline, "use_polish", False):
            raise

        logger.warning(
            f"Smart pipeline with AI polish failed for {file_path}; retrying with local extraction only",
            exc_info=True,
        )
        fallback_pipeline = SmartPipeline(use_polish=False)
        return ensure_valid_markdown_result(fallback_pipeline.process(file_path, progress_callback=progress_callback))

def markdown_to_segments(markdown: str) -> list:
    """
    Convert Markdown text to structured segments compatible with the existing lecture view UI.
    """
    import re
    segments = []
    page = 1

    for line in markdown.split("\n"):
        stripped = line.strip()
        if not stripped:
            continue

        # Determine content type
        if stripped.startswith("# "):
            content_type = "h1"
            content = stripped[2:]
        elif stripped.startswith("## "):
            content_type = "h2"
            content = stripped[3:]
        elif stripped.startswith("### "):
            content_type = "h3"
            content = stripped[4:]
        elif stripped.startswith("#### "):
            content_type = "h4"
            content = stripped[5:]
        elif stripped.startswith("##### "):
            content_type = "h5"
            content = stripped[6:]
        elif stripped.startswith("- "):
            content_type = "list"
            content = stripped[2:]
        elif re.match(r"^\d+\.\s", stripped):
            content_type = "ordered_list"
            content = re.sub(r"^\d+\.\s", "", stripped)
        elif stripped.startswith("|"):
            content_type = "table_row"
            content = stripped
        elif stripped.startswith("---"):
            continue  # Skip table separators
        else:
            content_type = "body"
            content = stripped

        segments.append({
            "content": content,
            "type": content_type,
            "page": page,
            "confidence": 0.95,
            "metadata": {"source": "smart_pipeline"}
        })

    return segments

def process_lecture_task(lecture_id: str, user_id: int, auto_detect_title: bool = False, **kwargs):
    """Core logic to process a lecture, used by both worker and (optionally) API."""
    task_id = kwargs.get("task_id") or f"ocr_{user_id}_{lecture_id}"
    
    db = SessionLocal()
    try:
        lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
        user = db.query(User).filter(User.id == user_id).first()
        
        if not lecture or not user:
            logger.error(f"Processing failed: Lecture {lecture_id} or User {user_id} not found")
            TaskManager._update_db_task(task_id, status="failed", error="Lecture or User not found")
            return {"status": "error", "message": "Lecture or User not found"}

        def is_cancelled():
            """Check if the task has been marked as failed/cancelled in the DB"""
            try:
                # We need a fresh check from DB
                check_db = SessionLocal()
                t = check_db.query(Task).filter(Task.task_id == task_id).first()
                cancelled = t and (t.status == "failed" or t.status == "cancelled")
                check_db.close()
                return cancelled
            except:
                return False

        if is_cancelled():
            logger.info(f"Task {task_id} aborted before start")
            return {"status": "cancelled"}

        file_path = lecture.file_path
        if not os.path.exists(file_path):
            logger.error(f"Processing failed: File not found at {file_path}")
            TaskManager._update_db_task(task_id, status="failed", error="File not found on disk")
            return {"status": "error", "message": "File not found on disk"}

        def progress_callback(percent, message=None):
            TaskManager.update_task_progress(task_id, percent, message=message)

        start_time = time.time()
        file_ext = os.path.splitext(file_path)[1].lower()

        if file_ext in ('.pdf', '.pptx'):
            logger.info(f"Processing lecture {lecture_id} (SmartPipeline)")
            progress_callback(15, "Initializing AI pipeline...")
            
            # Custom wrapper to pass messages through the pipeline's callback
            def pipeline_callback(p):
                if is_cancelled():
                    raise InterruptedError("Task cancelled by user")
                msg = "Extracting text..."
                if p > 30: msg = "Analyzing document structure..."
                if p > 60: msg = "Polishing with AI..."
                if p > 85: msg = "Finalizing content..."
                progress_callback(p, msg)

            try:
                markdown = extract_markdown_for_user(user, file_path, progress_callback=pipeline_callback)
            except InterruptedError:
                logger.info(f"Task {task_id} halted during smart pipeline")
                return {"status": "cancelled"}

            structured_segments = markdown_to_segments(markdown)
            
            # Save to file storage
            StorageManager.save_lecture_text(lecture.id, markdown)
            StorageManager.save_lecture_json(lecture.id, "structured", structured_segments)
            
            # Auto-title detection from H1
            if auto_detect_title:
                for line in markdown.split('\n'):
                    if line.strip().startswith('# '):
                        detected_title = line.strip()[2:].strip()
                        if detected_title:
                            lecture.title = detected_title
                            break
            
            lecture.processing_time_ms = int((time.time() - start_time) * 1000)
            lecture.updated_at = datetime.utcnow()
            db.commit()
            
            # STEP 4: Compute and store embeddings
            if markdown and markdown.strip():
                if is_cancelled():
                    logger.info(f"Task {task_id} halted before embeddings")
                    return {"status": "cancelled"}
                try:
                    progress_callback(95, "Generating search embeddings...")
                    from app.processing.embeddings import update_lecture_embeddings
                    update_lecture_embeddings(lecture.id, markdown, db)
                except Exception as e:
                    logger.error(f"Error updating embeddings: {e}")

            TaskManager._update_db_task(task_id, status="completed", progress=100, message="Note ready")
            logger.info(f"Processing complete for lecture {lecture_id}")
            return {"status": "success", "lecture_id": lecture_id}

        else:
            # Fallback to OCR for images
            logger.info(f"Processing lecture {lecture_id} (OCR Fallback)")
            if is_cancelled(): return {"status": "cancelled"}
            
            progress_callback(20, "OCR: Analyzing image...")
            ocr_result = OCRProcessor.extract_text(file_path, lecture.file_type, lecture_id=lecture_id)
            
            if is_cancelled(): return {"status": "cancelled"}
            progress_callback(80, "Structuring content...")
            
            raw_text = ocr_result.get("raw_text", "")
            structured_content = ocr_result.get("structured_content", [])
            images_data = ocr_result.get("images", [])
            
            # Save to file storage
            StorageManager.save_lecture_text(lecture.id, raw_text)
            StorageManager.save_lecture_json(lecture.id, "structured", structured_content)
            StorageManager.save_lecture_json(lecture.id, "images", images_data)

            lecture.processing_time_ms = int((time.time() - start_time) * 1000)
            lecture.updated_at = datetime.utcnow()
            db.commit()
            
            if raw_text:
                if is_cancelled(): return {"status": "cancelled"}
                try:
                    progress_callback(95, "Generating search embeddings...")
                    from app.processing.embeddings import update_lecture_embeddings
                    update_lecture_embeddings(lecture.id, raw_text, db)
                except Exception as e:
                    logger.error(f"Error updating embeddings: {e}")

            TaskManager._update_db_task(task_id, status="completed", progress=100, message="Note ready")
            return {"status": "success", "lecture_id": lecture_id}

    except Exception as e:
        if "Task cancelled by user" in str(e):
             logger.info(f"Task {task_id} confirmed cancelled")
             return {"status": "cancelled"}
        logger.error(f"Error in processing: {e}", exc_info=True)
        TaskManager._update_db_task(task_id, status="failed", error=str(e))
        return {"status": "error", "message": str(e)}
    finally:
        db.close()
