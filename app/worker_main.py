import time
import logging
import json
import traceback
from datetime import datetime

from app.models.db import Task
from app.utils.db import SessionLocal
from app.utils.tasks import TaskManager, OCRTask, EmbeddingsTask

from app.logging_config import setup_logging
setup_logging()
logger = logging.getLogger(__name__)

# Registry of supported tasks
TASK_REGISTRY = {
    "ocr": OCRTask.process_file,
    "embedding": EmbeddingsTask.generate_embeddings,
    # Add other task handlers as needed
}

def process_next_task():
    db = SessionLocal()
    try:
        # Use simple locking/polling. For Postgres, row-level locking would be better:
        # task = db.query(Task).filter(Task.status == "pending").with_for_update(skip_locked=True).first()
        # But to be safe across SQLite/Postgres compatibility we do a simple lock approach for now
        # or rely on Postgres row locking if we detect it.
        
        # We will attempt to find a pending task
        task = db.query(Task).filter(Task.status == "pending").first()
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
        
        # Execute task
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

def main():
    logger.info("Starting background worker...")
    while True:
        try:
            processed = process_next_task()
            if not processed:
                time.sleep(2)  # Wait before polling again
        except KeyboardInterrupt:
            logger.info("Worker shutting down...")
            break
        except Exception as e:
            logger.error(f"Worker loop error: {e}")
            time.sleep(5)

if __name__ == "__main__":
    main()
