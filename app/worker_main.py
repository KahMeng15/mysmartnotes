import asyncio
import time
import logging
import json
import traceback
from datetime import datetime

from sqlalchemy import func
from app.models.db import Task, RateLimitConfig
from app.utils.db import SessionLocal
from app.utils.tasks import TaskManager, OCRTask, EmbeddingsTask, QuizTask, SummaryTask, ChatTask

from app.logging_config import setup_logging
setup_logging()
logger = logging.getLogger(__name__)

from app.processing.lecture_processor import process_lecture_task

# Registry of supported tasks (can be sync or async)
TASK_REGISTRY = {
    "ocr": OCRTask.process_file,
    "embedding": EmbeddingsTask.generate_embeddings,
    "lecture_processing": process_lecture_task,
    "quiz_generation": QuizTask.generate,
    "summary_generation": SummaryTask.generate,
    "chat_response": ChatTask.respond,
}

async def process_next_task():
    db = SessionLocal()
    try:
        # Load per-user concurrency limit
        rate_limits = db.query(RateLimitConfig).first()
        max_concurrent = rate_limits.concurrent_tasks_per_user if rate_limits else 1

        # Base query for pending tasks
        pending_query = db.query(Task).filter(Task.status == "pending")

        # Apply per-user concurrency limit if not unlimited (unlimited = 0 or -1)
        if max_concurrent > 0:
            # Find users who have already reached their concurrent task limit
            # These are users with >= max_concurrent tasks in 'running' status
            running_users_subquery = db.query(
                Task.user_id
            ).filter(
                Task.status == "running"
            ).group_by(
                Task.user_id
            ).having(
                func.count(Task.id) >= max_concurrent
            ).subquery()

            pending_query = pending_query.filter(
                ~Task.user_id.in_(db.query(running_users_subquery.c.user_id))
            )

        # Find the oldest eligible pending task
        task = pending_query.order_by(Task.created_at.asc()).first()

        if not task:
            return False

        # Mark as running
        task.status = "running"
        task.updated_at = datetime.utcnow()
        db.commit()

        task_id = task.task_id
        task_type = task.task_type
        input_data = task.input_data

        logger.info(f"Picked up task {task_id} of type {task_type}")

        # Parse kwargs
        kwargs = {}
        if input_data:
            try:
                parsed = json.loads(input_data)
                kwargs = parsed.get("kwargs", {})
            except Exception as e:
                logger.error(f"Failed to parse input data for task {task_id}: {e}")

        # Execute
        handler = TASK_REGISTRY.get(task_type)
        if not handler:
            raise ValueError(f"Unknown task type: {task_type}")

        TaskManager.update_task_progress(task_id, 10)
        
        # Execute task (handle both sync and async)
        if asyncio.iscoroutinefunction(handler):
            result = await handler(**kwargs)
        else:
            result = handler(**kwargs)

        # Mark complete
        TaskManager._update_db_task(task_id, status="completed", result=result, progress=100)
        logger.info(f"Task {task_id} completed successfully")
        return True

    except Exception as e:
        logger.error(f"Task processing failed: {e}")
        logger.error(traceback.format_exc())
        if 'task_id' in locals():
            TaskManager._update_db_task(task_id, status="failed", error=str(e), progress=0)
        db.rollback()
        return False
    finally:
        db.close()

async def main():
    logger.info("Starting background worker (async mode)...")
    while True:
        try:
            processed = await process_next_task()
            if not processed:
                await asyncio.sleep(2)  # Wait before polling again
        except KeyboardInterrupt:
            logger.info("Worker shutting down...")
            break
        except Exception as e:
            logger.error(f"Worker loop error: {e}")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())
