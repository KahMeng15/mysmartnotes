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
                        input_data=_serialize_result({"kwargs": {**kwargs, "user_id": user_id, "task_id": task_id}}),
                    )
                    db.add(task)
                else:
                    task.user_id = user_id
                    task.task_type = task_type
                    task.status = "pending"
                    task.progress = 0
                    task.input_data = _serialize_result({"kwargs": {**kwargs, "user_id": user_id, "task_id": task_id}})
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

            # Publish WebSocket update
            from app.utils.websocket import manager
            payload = {
                "task_id": task_id,
                "status": db_task.status,
                "result": result if status == "completed" else None,
                "error": error if status == "failed" else None,
                "progress": db_task.progress or 0
            }
            manager.publish_update(db_task.user_id, payload)

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
    def get_active_tasks(user_id: int) -> list:
        """Get all pending/processing tasks for a user, including recently finished ones"""
        db = SessionLocal()
        try:
            # Include tasks that are pending, processing, or running
            # Also include tasks that finished in the last 5 minutes so they show up in the UI
            five_minutes_ago = datetime.utcnow() - timedelta(minutes=5)
            tasks = db.query(Task).filter(
                Task.user_id == user_id,
                (Task.status.in_(["pending", "processing", "running"])) |
                (Task.updated_at >= five_minutes_ago)
            ).order_by(Task.updated_at.desc()).all()

            return [{
                "task_id": t.task_id,
                "task_type": t.task_type,
                "status": t.status,
                "progress": t.progress or 0,
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
                "input_data": _deserialize_result(t.input_data),
                "error": t.error_message
            } for t in tasks]
        except Exception as exc:
            logger.error(f"Failed to load active tasks for user {user_id}: {exc}")
            return []
        finally:
            db.close()

    @staticmethod
    def cancel_task(task_id: str, user_id: int) -> bool:
        """Cancel a pending/processing task"""
        db = SessionLocal()
        try:
            task = db.query(Task).filter(
                Task.task_id == task_id,
                Task.user_id == user_id
            ).first()
            if not task:
                return False
            
            if task.status in ["completed", "failed", "cancelled"]:
                return False

            task.status = "failed"
            task.error_message = "Cancelled by user"
            task.updated_at = datetime.utcnow()
            db.commit()

            # Notify UI
            from app.utils.websocket import manager
            manager.publish_update(user_id, {
                "task_id": task_id,
                "status": "failed",
                "error": "Cancelled by user",
                "progress": task.progress
            })
            return True
        except Exception as exc:
            logger.error(f"Failed to cancel task {task_id}: {exc}")
            return False
        finally:
            db.close()

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

class QuizTask:
    """Quiz generation task"""
    @staticmethod
    async def generate(**kwargs) -> dict:
        from app.processing.quiz_generator import generate_advanced_quiz
        from app.processing.ai_client import get_ai_client
        from app.models.db import User
        
        db = SessionLocal()
        try:
            user_id = kwargs.get("user_id")
            user = db.query(User).filter(User.id == user_id).first()
            ai_client = get_ai_client(user=user, db=db)
            
            quiz = await generate_advanced_quiz(
                db=db,
                user=user,
                ai_client=ai_client,
                title=kwargs.get("title"),
                scope_type=kwargs.get("scope_type"),
                scope_id=kwargs.get("scope_id"),
                question_types=kwargs.get("question_types"),
                num_questions=kwargs.get("num_questions"),
                quiz_group_id=kwargs.get("quiz_group_id")
            )
            # Quiz model to dict (simplified for result)
            return {"quiz_id": quiz.id, "title": quiz.title}
        finally:
            db.close()

class SummaryTask:
    """Summary generation task"""
    @staticmethod
    async def generate(**kwargs) -> dict:
        from app.processing.ai_client import AIClient
        from app.models.db import User, Lecture, Summary
        from app.utils.storage import StorageManager
        from app.utils.db import generate_random_id
        from sqlalchemy import func
        import time

        db = SessionLocal()
        try:
            user_id = kwargs.get("user_id")
            lecture_id = kwargs.get("lecture_id")
            mode = kwargs.get("mode", "elaborate")
            output_format = kwargs.get("output_format", "sentence")
            processing_method = kwargs.get("processing_method", "whole")
            split_level = kwargs.get("split_level", "h2")
            
            user = db.query(User).filter(User.id == user_id).first()
            lecture = db.query(Lecture).filter(Lecture.id == lecture_id).first()
            
            lecture_content = StorageManager.get_lecture_text(lecture_id) or ""
            ai_client = AIClient(user, db=db)
            
            start_time = time.time()
            task_id = kwargs.get("task_id")
            
            def progress_callback(percent):
                if task_id:
                    TaskManager.update_task_progress(task_id, percent)

            summary_content = await ai_client.generate_summary(
                content=lecture_content,
                mode=mode,
                output_format=output_format,
                processing_method=processing_method,
                split_level=split_level,
                progress_callback=progress_callback
            )
            
            processing_time = time.time() - start_time
            
            # Versioning
            max_version = db.query(func.max(Summary.version)).filter(
                Summary.lecture_id == lecture_id
            ).scalar() or 0
            next_version = max_version + 1

            doc_id = generate_random_id(db, Summary)
            doc = Summary(
                id=doc_id,
                version=next_version,
                lecture_id=lecture_id,
                title=f"Summary - {lecture.title}",
                summary_type="summary",
                file_path=f"summary_{lecture.id}_{next_version}.md",
                mode=mode,
                output_format=output_format,
                processing_method=processing_method,
                split_level=split_level,
                processing_time=processing_time,
                processing_time_ms=int(processing_time * 1000),
                model=f"{ai_client.provider.capitalize()} ({ai_client.ai_model_name})" if ai_client.ai_model_name else ai_client.provider.capitalize()
            )
            db.add(doc)
            db.commit()
            
            StorageManager.save_summary_text(doc_id, summary_content)
            
            if task_id:
                TaskManager.update_task_progress(task_id, 100)
            
            return {
                "id": doc_id,
                "lecture_id": lecture_id,
                "title": doc.title,
                "content": summary_content,
                "mode": mode,
                "output_format": output_format,
                "processing_time": processing_time,
                "processing_time_ms": int(processing_time * 1000),
                "model": doc.model,
                "version": next_version,
                "status": "completed"
            }
        finally:
            db.close()

class ChatTask:
    """Chat response task"""
    @staticmethod
    async def respond(**kwargs) -> dict:
        # This will be more complex as it needs to duplicate most of chat.py logic
        # For now, let's keep it minimal or plan to refactor chat.py to be more modular
        from app.routers.chat import ask_question_logic
        return await ask_question_logic(**kwargs)

class OCRTask:
    """OCR processing task"""
    @staticmethod
    def process_file(file_path: str, **kwargs) -> dict:
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
    def generate_embeddings(text_chunks: list, **kwargs) -> dict:
        from app.processing.search import EmbeddingsManager
        try:
            logger.info(f"Generating embeddings for {len(text_chunks)} chunks")
            embeddings_mgr = EmbeddingsManager()
            embeddings = embeddings_mgr.embed_texts(text_chunks)
            return {"embeddings": embeddings.tolist(), "chunks": text_chunks, "embedding_count": len(embeddings)}
        except Exception as e:
            logger.error(f"Error generating embeddings: {e}")
            raise
