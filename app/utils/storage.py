import os
import json
import logging
from typing import Optional, Union, Dict, Any
from app.utils.cache import get_cache_sync, set_cache_sync, delete_cache_sync

logger = logging.getLogger(__name__)

# Base directory for data - assuming it's in the project root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
NOTES_DIR = os.path.join(DATA_DIR, "notes")
SUMMARY_DIR = os.path.join(DATA_DIR, "summary")

# Ensure directories exist
os.makedirs(NOTES_DIR, exist_ok=True)
os.makedirs(SUMMARY_DIR, exist_ok=True)

class StorageManager:
    """Central manager for file-based storage of large text content with Redis caching"""
    
    @staticmethod
    def _get_note_path(note_id: str, suffix: str = "", extension: str = "md") -> str:
        filename = f"{note_id}{suffix}.{extension}"
        return os.path.join(NOTES_DIR, filename)

    @staticmethod
    def _get_summary_path(summary_id: str, suffix: str = "", extension: str = "md") -> str:
        filename = f"{summary_id}{suffix}.{extension}"
        return os.path.join(SUMMARY_DIR, filename)

    # --- Note Notes Methods ---

    @staticmethod
    def save_note_text(note_id: str, text: str):
        """Save extracted text to a .md file and update cache"""
        if not text:
            return
        path = StorageManager._get_note_path(note_id)
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            logger.debug(f"Saved note text to {path}")
            
            # Update cache
            cache_key = f"note_text:{note_id}"
            set_cache_sync(cache_key, text)
        except Exception as e:
            logger.error(f"Failed to save note text for {note_id}: {e}")

    @staticmethod
    def get_note_text(note_id: str) -> Optional[str]:
        """Read extracted text from cache or .md file"""
        cache_key = f"note_text:{note_id}"
        cached = get_cache_sync(cache_key)
        if cached:
            logger.info(f"Cache hit for note text: {note_id}")
            return cached

        path = StorageManager._get_note_path(note_id)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                # Populate cache
                set_cache_sync(cache_key, content)
                return content
        except Exception as e:
            logger.error(f"Failed to read note text for {note_id}: {e}")
            return None

    @staticmethod
    def save_note_json(note_id: str, suffix: str, data: Union[Dict, Any]):
        """Save structured data (JSON) to a .json file and update cache"""
        if data is None:
            return
        path = StorageManager._get_note_path(note_id, suffix=f"_{suffix}", extension="json")
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            logger.debug(f"Saved note {suffix} to {path}")
            
            # Update cache
            cache_key = f"note_json:{note_id}:{suffix}"
            set_cache_sync(cache_key, data)
        except Exception as e:
            logger.error(f"Failed to save note {suffix} for {note_id}: {e}")

    @staticmethod
    def get_note_json(note_id: str, suffix: str) -> Optional[Union[Dict, Any]]:
        """Read structured data (JSON) from cache or .json file"""
        cache_key = f"note_json:{note_id}:{suffix}"
        cached = get_cache_sync(cache_key)
        if cached:
            logger.info(f"Cache hit for note json: {note_id}:{suffix}")
            return cached

        path = StorageManager._get_note_path(note_id, suffix=f"_{suffix}", extension="json")
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                # Populate cache
                set_cache_sync(cache_key, data)
                return data
        except Exception as e:
            logger.error(f"Failed to read note {suffix} for {note_id}: {e}")
            return None

    # --- Summary Methods ---

    @staticmethod
    def save_summary_text(summary_id: str, text: str, is_quickread: bool = False):
        """Save summary content to a .md file and update cache"""
        if text is None:
            return
        suffix = "_quickread" if is_quickread else ""
        path = StorageManager._get_summary_path(summary_id, suffix=suffix)
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            logger.debug(f"Saved summary {summary_id}{suffix} to {path}")
            
            # Update cache
            cache_key = f"summary_text:{summary_id}{suffix}"
            set_cache_sync(cache_key, text)
        except Exception as e:
            logger.error(f"Failed to save summary {summary_id}: {e}")

    @staticmethod
    def get_summary_text(summary_id: str, is_quickread: bool = False) -> Optional[str]:
        """Read summary content from cache or .md file"""
        suffix = "_quickread" if is_quickread else ""
        cache_key = f"summary_text:{summary_id}{suffix}"
        cached = get_cache_sync(cache_key)
        if cached:
            logger.info(f"Cache hit for summary text: {summary_id}{suffix}")
            return cached

        path = StorageManager._get_summary_path(summary_id, suffix=suffix)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
                # Populate cache
                set_cache_sync(cache_key, content)
                return content
        except Exception as e:
            logger.error(f"Failed to read summary {summary_id}: {e}")
            return None

    # --- Deletion Methods ---

    @staticmethod
    def delete_note_files(note_id: str):
        """Delete all files and cache associated with a note ID"""
        # List of possible suffixes/extensions
        patterns = [
            (StorageManager._get_note_path(note_id), f"note_text:{note_id}"),
            (StorageManager._get_note_path(note_id, suffix="_structured", extension="json"), f"note_json:{note_id}:structured"),
            (StorageManager._get_note_path(note_id, suffix="_images", extension="json"), f"note_json:{note_id}:images")
        ]
        for path, cache_key in patterns:
            # Delete cache
            delete_cache_sync(cache_key)
            
            # Delete file
            if os.path.exists(path):
                try:
                    os.remove(path)
                    logger.info(f"Deleted storage file: {path}")
                except Exception as e:
                    logger.error(f"Failed to delete {path}: {e}")

    @staticmethod
    def delete_summary_files(summary_id: str):
        """Delete all files and cache associated with a summary ID"""
        patterns = [
            (StorageManager._get_summary_path(summary_id), f"summary_text:{summary_id}"),
            (StorageManager._get_summary_path(summary_id, suffix="_quickread"), f"summary_text:{summary_id}_quickread")
        ]
        for path, cache_key in patterns:
            # Delete cache
            delete_cache_sync(cache_key)
            
            # Delete file
            if os.path.exists(path):
                try:
                    os.remove(path)
                    logger.info(f"Deleted storage file: {path}")
                except Exception as e:
                    logger.error(f"Failed to delete {path}: {e}")
