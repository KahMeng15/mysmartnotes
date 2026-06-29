import logging
import os
import time
from collections.abc import Callable
from datetime import datetime

from app.models.db import Resource, User
from app.processing.smart_pipeline import SmartPipeline
from app.processing.unified_processor import UnifiedContentProcessor
from app.utils.cache import clear_cache_pattern_sync
from app.utils.db import SessionLocal
from app.utils.storage import StorageManager
from app.utils.tasks import TaskManager

logger = logging.getLogger(__name__)


def get_pipeline_for_user(user: User) -> SmartPipeline:
    """Get a SmartPipeline instance with the appropriate settings for this user."""
    from app.config import get_settings

    app_settings = get_settings()

    # Determine whether we have any AI tier available for the polish pass.
    # We only pass a gemini_api_key if the configured Tier 1 provider is actually Gemini
    # so that smart_pipeline.py does not try to use a Groq/HF key as a Gemini credential.
    tier1_provider = getattr(app_settings, "GLOBAL_AI_TIER1_PROVIDER", "gemini").lower()
    tier1_api_key = getattr(app_settings, "GLOBAL_AI_TIER1_API_KEY", None)

    # Gemini-specific key (for the SmartPipeline's gemini_api_key parameter)
    gemini_key = None
    if tier1_provider == "gemini":
        gemini_key = tier1_api_key or app_settings.GEMINI_API_KEY
    else:
        # Fall back to explicit GEMINI_API_KEY if set separately
        gemini_key = getattr(app_settings, "GEMINI_API_KEY", None) or None

    gemini_model = app_settings.GLOBAL_AI_TIER1_MODEL

    if not getattr(user, "use_global_ai_config", False):
        if getattr(user, "ai_model", None):
            gemini_model = user.ai_model

    # Enable polish if any tier key is present (Gemini, Groq, etc.)
    has_any_ai_key = bool(tier1_api_key) or bool(gemini_key)

    return SmartPipeline(
        use_polish=has_any_ai_key,
        gemini_api_key=gemini_key,  # May be None for non-Gemini providers — polish still works via AIClient tiers
        gemini_model=gemini_model,
    )


def get_unified_processor_for_user(user: User) -> UnifiedContentProcessor:
    """Get a UnifiedContentProcessor with the appropriate settings for this user."""
    from app.config import get_settings
    app_settings = get_settings()

    tier1_provider = getattr(app_settings, "GLOBAL_AI_TIER1_PROVIDER", "gemini").lower()
    tier1_api_key = getattr(app_settings, "GLOBAL_AI_TIER1_API_KEY", None)
    gemini_key = None
    if tier1_provider == "gemini":
        gemini_key = tier1_api_key or app_settings.GEMINI_API_KEY
    else:
        gemini_key = getattr(app_settings, "GEMINI_API_KEY", None) or None
    gemini_model = app_settings.GLOBAL_AI_TIER1_MODEL

    if not getattr(user, "use_global_ai_config", False):
        if getattr(user, "ai_model", None):
            gemini_model = user.ai_model

    has_any_ai_key = bool(tier1_api_key) or bool(gemini_key)
    return UnifiedContentProcessor(
        use_polish=has_any_ai_key,
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


def extract_markdown_for_user(
    user: User, file_path: str, progress_callback: Callable | None = None
) -> tuple:
    """
    Process a resource with the configured SmartPipeline.
    """
    pipeline = get_pipeline_for_user(user)
    try:
        markdown = ensure_valid_markdown_result(
            pipeline.process(file_path, progress_callback=progress_callback)
        )
        return markdown, getattr(pipeline, "timings", {})
    except Exception:
        if not getattr(pipeline, "use_polish", False):
            raise

        logger.warning(
            f"Smart pipeline with AI polish failed for {file_path}; retrying with local extraction only",
            exc_info=True,
        )
        fallback_pipeline = SmartPipeline(use_polish=False)
        markdown = ensure_valid_markdown_result(
            fallback_pipeline.process(file_path, progress_callback=progress_callback)
        )
        return markdown, getattr(fallback_pipeline, "timings", {})


def markdown_to_segments(markdown: str) -> list:
    """
    Convert Markdown text to structured segments compatible with the existing resource view UI.
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

        segments.append(
            {
                "content": content,
                "type": content_type,
                "page": page,
                "confidence": 0.95,
                "metadata": {"source": "smart_pipeline"},
            }
        )

    return segments


def process_resource_task(
    resource_id: str, user_id: int, auto_detect_title: bool = False, **kwargs
):
    """Core logic to process a resource, used by both worker and (optionally) API."""
    task_id = kwargs.get("task_id") or f"ocr_{user_id}_{resource_id}"

    db = SessionLocal()
    try:
        resource = db.query(Resource).filter(Resource.id == resource_id).first()
        user = db.query(User).filter(User.id == user_id).first()

        if not resource or not user:
            logger.error(f"Processing failed: Resource {resource_id} or User {user_id} not found")
            TaskManager._update_db_task(
                task_id, status="failed", error="Resource or User not found"
            )
            return {"status": "error", "message": "Resource or User not found"}

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

        file_path = resource.file_path
        if not os.path.exists(file_path):
            logger.error(f"Processing failed: File not found at {file_path}")
            TaskManager._update_db_task(task_id, status="failed", error="File not found on disk")
            return {"status": "error", "message": "File not found on disk"}

        def progress_callback(percent, message=None):
            TaskManager.update_task_progress(task_id, percent, message=message)

        start_time = time.time()

        def pipeline_callback(p):
            if is_cancelled():
                raise InterruptedError("Task cancelled by user")
            msg = "Extracting text..."
            if p > 30:
                msg = "Analyzing document structure..."
            if p > 60:
                msg = "Polishing with AI..."
            if p > 85:
                msg = "Finalizing content..."
            progress_callback(p, msg)

        try:
            processor = get_unified_processor_for_user(user)
            bundle = processor.extract(
                file_path, resource_id=resource.id, progress_callback=pipeline_callback
            )
        except InterruptedError:
            logger.info(f"Task {task_id} halted during processing")
            return {"status": "cancelled"}

        markdown = bundle.markdown
        structured_segments = markdown_to_segments(markdown)

        StorageManager.save_resource_text(resource.id, markdown)
        StorageManager.save_resource_json(resource.id, "structured", structured_segments)
        StorageManager.save_resource_json(resource.id, "timings", bundle.timings)
        if bundle.images:
            images_data = [img.to_dict() if hasattr(img, "to_dict") else img for img in bundle.images]
            StorageManager.save_resource_json(resource.id, "images", images_data)
            StorageManager.save_resource_json(resource.id, "image_map", bundle.image_map)

        if bundle.warnings:
            logger.warning(f"Resource {resource_id} warnings: {bundle.warnings}")

        if auto_detect_title:
            for line in markdown.split("\n"):
                if line.strip().startswith("# "):
                    detected_title = line.strip()[2:].strip()
                    if detected_title:
                        resource.title = detected_title
                        break

        resource.processing_time_ms = int((time.time() - start_time) * 1000)
        resource.updated_at = datetime.utcnow()
        db.commit()

        if markdown and markdown.strip():
            if is_cancelled():
                logger.info(f"Task {task_id} halted before embeddings")
                return {"status": "cancelled"}
            try:
                progress_callback(95, "Generating search embeddings...")
                from app.processing.embeddings import update_resource_embeddings
                update_resource_embeddings(resource.id, markdown, db)
            except Exception as e:
                logger.error(f"Error updating embeddings: {e}")

        TaskManager._update_db_task(
            task_id, status="completed", progress=100, message="Completed"
        )
        logger.info(f"Processing complete for resource {resource_id}")
        clear_cache_pattern_sync(f"cache_resp:/resources*:u{user.id}*")
        return {"status": "success", "resource_id": resource_id}

    except Exception as e:
        if "Task cancelled by user" in str(e):
            logger.info(f"Task {task_id} confirmed cancelled")
            return {"status": "cancelled"}
        logger.error(f"Error in processing: {e}", exc_info=True)
        TaskManager._update_db_task(task_id, status="failed", error=str(e))
        return {"status": "error", "message": str(e)}
    finally:
        db.close()
