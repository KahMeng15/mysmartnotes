import os
import json
import logging
from typing import Optional, Union, Dict, Any

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
    """Central manager for file-based storage of large text content"""
    
    @staticmethod
    def _get_note_path(lecture_id: str, suffix: str = "", extension: str = "md") -> str:
        filename = f"{lecture_id}{suffix}.{extension}"
        return os.path.join(NOTES_DIR, filename)

    @staticmethod
    def _get_summary_path(summary_id: str, suffix: str = "", extension: str = "md") -> str:
        filename = f"{summary_id}{suffix}.{extension}"
        return os.path.join(SUMMARY_DIR, filename)

    # --- Lecture Notes Methods ---

    @staticmethod
    def save_lecture_text(lecture_id: str, text: str):
        """Save extracted text to a .md file"""
        if not text:
            return
        path = StorageManager._get_note_path(lecture_id)
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            logger.debug(f"Saved lecture text to {path}")
        except Exception as e:
            logger.error(f"Failed to save lecture text for {lecture_id}: {e}")

    @staticmethod
    def get_lecture_text(lecture_id: str) -> Optional[str]:
        """Read extracted text from a .md file"""
        path = StorageManager._get_note_path(lecture_id)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            logger.error(f"Failed to read lecture text for {lecture_id}: {e}")
            return None

    @staticmethod
    def save_lecture_json(lecture_id: str, suffix: str, data: Union[Dict, Any]):
        """Save structured data (JSON) to a .json file"""
        if data is None:
            return
        path = StorageManager._get_note_path(lecture_id, suffix=f"_{suffix}", extension="json")
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            logger.debug(f"Saved lecture {suffix} to {path}")
        except Exception as e:
            logger.error(f"Failed to save lecture {suffix} for {lecture_id}: {e}")

    @staticmethod
    def get_lecture_json(lecture_id: str, suffix: str) -> Optional[Union[Dict, Any]]:
        """Read structured data (JSON) from a .json file"""
        path = StorageManager._get_note_path(lecture_id, suffix=f"_{suffix}", extension="json")
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to read lecture {suffix} for {lecture_id}: {e}")
            return None

    # --- Summary Methods ---

    @staticmethod
    def save_summary_text(summary_id: str, text: str, is_quickread: bool = False):
        """Save summary content to a .md file"""
        if text is None:
            return
        suffix = "_quickread" if is_quickread else ""
        path = StorageManager._get_summary_path(summary_id, suffix=suffix)
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            logger.debug(f"Saved summary {summary_id}{suffix} to {path}")
        except Exception as e:
            logger.error(f"Failed to save summary {summary_id}: {e}")

    @staticmethod
    def get_summary_text(summary_id: str, is_quickread: bool = False) -> Optional[str]:
        """Read summary content from a .md file"""
        suffix = "_quickread" if is_quickread else ""
        path = StorageManager._get_summary_path(summary_id, suffix=suffix)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            logger.error(f"Failed to read summary {summary_id}: {e}")
            return None

    # --- Deletion Methods ---

    @staticmethod
    def delete_lecture_files(lecture_id: str):
        """Delete all files associated with a lecture ID"""
        # List of possible suffixes/extensions
        patterns = [
            StorageManager._get_note_path(lecture_id),
            StorageManager._get_note_path(lecture_id, suffix="_structured", extension="json"),
            StorageManager._get_note_path(lecture_id, suffix="_images", extension="json")
        ]
        for path in patterns:
            if os.path.exists(path):
                try:
                    os.remove(path)
                    logger.info(f"Deleted storage file: {path}")
                except Exception as e:
                    logger.error(f"Failed to delete {path}: {e}")

    @staticmethod
    def delete_summary_files(summary_id: str):
        """Delete all files associated with a summary ID"""
        patterns = [
            StorageManager._get_summary_path(summary_id),
            StorageManager._get_summary_path(summary_id, suffix="_quickread")
        ]
        for path in patterns:
            if os.path.exists(path):
                try:
                    os.remove(path)
                    logger.info(f"Deleted storage file: {path}")
                except Exception as e:
                    logger.error(f"Failed to delete {path}: {e}")
