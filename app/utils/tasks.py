"""Background task management"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from typing import Callable, Any, Optional
import logging
import json

from app.models.db import Task
from app.utils.db import SessionLocal
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# Global thread pool for background tasks
task_executor = ThreadPoolExecutor(max_workers=5)

# In-memory fallback task tracking (primary tracking is in database)
tasks_tracking = {}


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
        task_func: Callable,
        *args,
        user_id: Optional[int] = None,
        task_type: str = "generic",
        **kwargs
    ) -> str:
        """
        Submit a background task for processing
        
        Args:
            task_id: Unique identifier for task
            task_func: Function to execute
            *args: Positional arguments for function
            **kwargs: Keyword arguments for function
            
        Returns:
            Task ID
        """
        try:
            logger.info(f"Submitting task {task_id}")

            # Keep compatibility fallback for existing task-status callers.
            tasks_tracking[task_id] = {
                "status": "pending",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "result": None,
                "error": None,
                "progress": 0
            }

            if user_id is not None:
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
                            input_data=_serialize_result({"args": args, "kwargs": kwargs}),
                        )
                        db.add(task)
                    else:
                        task.user_id = user_id
                        task.task_type = task_type
                        task.status = "pending"
                        task.progress = 0
                        task.input_data = _serialize_result({"args": args, "kwargs": kwargs})
                        task.result = None
                        task.error_message = None
                        task.updated_at = datetime.utcnow()
                    db.commit()
                finally:
                    db.close()
            
            # Submit to executor
            task_executor.submit(
                TaskManager._execute_task,
                task_id,
                task_func,
                *args,
                **kwargs
            )
            
            return task_id
        except Exception as e:
            logger.error(f"Error submitting task {task_id}: {e}")
            raise
    
    @staticmethod
    def _execute_task(
        task_id: str,
        task_func: Callable,
        *args,
        **kwargs
    ):
        """Execute a task and track its status"""
        try:
            logger.info(f"Starting task {task_id}")
            tasks_tracking[task_id]["status"] = "running"
            tasks_tracking[task_id]["updated_at"] = datetime.utcnow().isoformat()

            TaskManager._update_db_task(task_id, status="running", progress=10)
            
            # Execute task
            result = task_func(*args, **kwargs)
            
            # Mark as complete
            tasks_tracking[task_id]["status"] = "completed"
            tasks_tracking[task_id]["result"] = result
            tasks_tracking[task_id]["progress"] = 100
            tasks_tracking[task_id]["updated_at"] = datetime.utcnow().isoformat()

            TaskManager._update_db_task(task_id, status="completed", result=result, progress=100)
            
            logger.info(f"Task {task_id} completed successfully")
        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")
            tasks_tracking[task_id]["status"] = "failed"
            tasks_tracking[task_id]["error"] = str(e)
            tasks_tracking[task_id]["progress"] = 0
            tasks_tracking[task_id]["updated_at"] = datetime.utcnow().isoformat()
            TaskManager._update_db_task(task_id, status="failed", error=str(e), progress=0)

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

        return tasks_tracking.get(task_id)
    
    @staticmethod
    def update_task_progress(task_id: str, progress: int):
        """Update task progress (0-100)"""
        bounded = min(100, max(0, progress))
        if task_id in tasks_tracking:
            tasks_tracking[task_id]["progress"] = min(100, max(0, progress))
            tasks_tracking[task_id]["updated_at"] = datetime.utcnow().isoformat()

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
        """
        Process a file for OCR
        Returns: {"extracted_text": str, "chunks": list}
        """
        from app.processing.ocr import OCRProcessor
        
        try:
            logger.info(f"Processing file for OCR: {file_path}")
            
            # Determine file type from path
            if file_path.endswith(".pdf"):
                file_type = "application/pdf"
            elif file_path.endswith(".pptx"):
                file_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            elif file_path.lower().endswith((".png", ".jpg", ".jpeg")):
                file_type = "image/jpeg"
            else:
                raise ValueError(f"Unsupported file type: {file_path}")
            
            # Extract text
            extracted_text = OCRProcessor.extract_text(file_path, file_type)
            
            # Chunk text
            chunks = OCRProcessor.chunk_text(extracted_text)
            
            return {
                "extracted_text": extracted_text,
                "chunks": chunks,
                "chunk_count": len(chunks)
            }
        except Exception as e:
            logger.error(f"Error processing file: {e}")
            raise


class EmbeddingsTask:
    """Embeddings generation task"""
    
    @staticmethod
    def generate_embeddings(text_chunks: list) -> dict:
        """
        Generate embeddings for text chunks
        Returns: {"embeddings": list, "metadata": dict}
        """
        from app.processing.search import EmbeddingsManager
        
        try:
            logger.info(f"Generating embeddings for {len(text_chunks)} chunks")
            
            embeddings_mgr = EmbeddingsManager()
            embeddings = embeddings_mgr.embed_texts(text_chunks)
            
            return {
                "embeddings": embeddings.tolist(),  # Convert numpy to list
                "chunks": text_chunks,
                "embedding_count": len(embeddings)
            }
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            raise
