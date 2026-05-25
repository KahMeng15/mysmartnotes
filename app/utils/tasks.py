"""Background task management"""
from datetime import datetime, timedelta
from typing import Any, Optional
import logging
import json

from app.models.db import Task
from app.utils.db import SessionLocal
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

def _serialize_result(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        return json.dumps(value)
    except TypeError:
        return json.dumps({"value": str(value)})

def _deserialize_result(value: Optional[str]) -> Any:
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return value

class TaskManager:
    """Manage background tasks and processing"""
    
    @staticmethod
    def submit_task(
        task_id: str,
        task_type: str,
        user_id: int,
        **kwargs
    ) -> str:
        """
        Submit a background task for processing (stored in DB for worker to pick up)
        """
        try:
            logger.info(f"Submitting task {task_id} of type {task_type}")

            db = SessionLocal()
            try:
                task = db.query(Task).filter(Task.task_id == task_id).first()
                if not task:
                    task = Task(
                        task_id=task_id,
                        user_id=user_id,
                        task_type=task_type,
                        status="pending",
                        progress=0,
                        input_data=_serialize_result({"kwargs": {**kwargs, "user_id": user_id}}),
                    )
                    db.add(task)
                else:
                    task.user_id = user_id
                    task.task_type = task_type
                    task.status = "pending"
                    task.progress = 0
                    task.input_data = _serialize_result({"kwargs": {**kwargs, "user_id": user_id}})
                    task.result = None
                    task.error_message = None
                    task.updated_at = datetime.utcnow()
                db.commit()
            finally:
                db.close()
            
            return task_id
        except Exception as e:
            logger.error(f"Error submitting task {task_id}: {e}")
            raise

    @staticmethod
    def _update_db_task(
        task_id: str,
        status: Optional[str] = None,
        result: Any = None,
        error: Optional[str] = None,
        progress: Optional[int] = None,
    ) -> None:
        db = SessionLocal()
        try:
            db_task = db.query(Task).filter(Task.task_id == task_id).first()
            if not db_task:
                return

            if status is not None:
                db_task.status = status
            if result is not None:
                db_task.result = _serialize_result(result)
            if error is not None:
                db_task.error_message = error
            if progress is not None:
                db_task.progress = min(100, max(0, progress))
            db_task.updated_at = datetime.utcnow()
            db.commit()
        except Exception as exc:
            logger.error(f"Failed to update DB task {task_id}: {exc}")
        finally:
            db.close()
    
    @staticmethod
    def get_task_status(task_id: str, user_id: Optional[int] = None) -> Optional[dict]:
        """Get status of a task"""
        db = SessionLocal()
        try:
            query = db.query(Task).filter(Task.task_id == task_id)
            if user_id is not None:
                query = query.filter(Task.user_id == user_id)
            db_task = query.first()

            if db_task:
                return {
                    "task_id": db_task.task_id,
                    "status": db_task.status,
                    "progress": db_task.progress or 0,
                    "created_at": db_task.created_at.isoformat() if db_task.created_at else None,
                    "updated_at": db_task.updated_at.isoformat() if db_task.updated_at else None,
                    "result": _deserialize_result(db_task.result),
                    "error": db_task.error_message,
                    "task_type": db_task.task_type,
                }
        except Exception as exc:
            logger.error(f"Failed to load task {task_id} from DB: {exc}")
        finally:
            db.close()

        return None
    
    @staticmethod
    def update_task_progress(task_id: str, progress: int):
        """Update task progress (0-100)"""
        bounded = min(100, max(0, progress))
        TaskManager._update_db_task(task_id, progress=bounded)

    @staticmethod
    def cleanup_old_tasks(retention_days: Optional[int] = None) -> int:
        """Delete completed/failed tasks older than retention period."""
        days = retention_days if retention_days is not None else settings.TASK_RETENTION_DAYS
        if days <= 0:
            return 0

        cutoff = datetime.utcnow() - timedelta(days=days)
        db = SessionLocal()
        try:
            old_tasks = db.query(Task).filter(
                Task.updated_at < cutoff,
                Task.status.in_(["completed", "failed"])
            )
            deleted_count = old_tasks.count()
            old_tasks.delete(synchronize_session=False)
            db.commit()
            return deleted_count
        except Exception as exc:
            db.rollback()
            logger.error(f"Failed task cleanup: {exc}")
            return 0
        finally:
            db.close()

class OCRTask:
    """OCR processing task"""
    @staticmethod
    def process_file(file_path: str) -> dict:
        from app.processing.ocr import OCRProcessor
        try:
            logger.info(f"Processing file for OCR: {file_path}")
            if file_path.endswith(".pdf"):
                file_type = "application/pdf"
            elif file_path.endswith(".pptx"):
                file_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            elif file_path.lower().endswith((".png", ".jpg", ".jpeg")):
                file_type = "image/jpeg"
            else:
                raise ValueError(f"Unsupported file type: {file_path}")
            extracted_text = OCRProcessor.extract_text(file_path, file_type)
            chunks = OCRProcessor.chunk_text(extracted_text)
            return {"extracted_text": extracted_text, "chunks": chunks, "chunk_count": len(chunks)}
        except Exception as e:
            logger.error(f"Error processing file: {e}")
            raise

class EmbeddingsTask:
    """Embeddings generation task"""
    @staticmethod
    def generate_embeddings(text_chunks: list) -> dict:
        from app.processing.search import EmbeddingsManager
        try:
            logger.info(f"Generating embeddings for {len(text_chunks)} chunks")
            embeddings_mgr = EmbeddingsManager()
            embeddings = embeddings_mgr.embed_texts(text_chunks)
            return {"embeddings": embeddings.tolist(), "chunks": text_chunks, "embedding_count": len(embeddings)}
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            raise
