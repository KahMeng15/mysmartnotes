"""Background task management"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Callable, Any, Optional
import logging
import json

logger = logging.getLogger(__name__)

# Global thread pool for background tasks
task_executor = ThreadPoolExecutor(max_workers=5)

# In-memory task tracking (in production, use database)
tasks_tracking = {}


class TaskManager:
    """Manage background tasks and processing"""
    
    @staticmethod
    def submit_task(
        task_id: str,
        task_func: Callable,
        *args,
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
            
            # Track task
            tasks_tracking[task_id] = {
                "status": "pending",
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "result": None,
                "error": None,
                "progress": 0
            }
            
            # Submit to executor
            future = task_executor.submit(
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
            
            # Execute task
            result = task_func(*args, **kwargs)
            
            # Mark as complete
            tasks_tracking[task_id]["status"] = "completed"
            tasks_tracking[task_id]["result"] = result
            tasks_tracking[task_id]["progress"] = 100
            
            logger.info(f"Task {task_id} completed successfully")
        except Exception as e:
            logger.error(f"Task {task_id} failed: {e}")
            tasks_tracking[task_id]["status"] = "failed"
            tasks_tracking[task_id]["error"] = str(e)
            tasks_tracking[task_id]["progress"] = 0
    
    @staticmethod
    def get_task_status(task_id: str) -> Optional[dict]:
        """Get status of a task"""
        return tasks_tracking.get(task_id)
    
    @staticmethod
    def update_task_progress(task_id: str, progress: int):
        """Update task progress (0-100)"""
        if task_id in tasks_tracking:
            tasks_tracking[task_id]["progress"] = min(100, max(0, progress))
            tasks_tracking[task_id]["updated_at"] = datetime.utcnow().isoformat()


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
