import functools
import json
import logging
import os
from typing import Any

from app.utils.cache import delete_cache_sync, get_cache_sync, set_cache_sync
from app.utils.db import SessionLocal

logger = logging.getLogger(__name__)

# Base directory for data - assuming it's in the project root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
USERS_DIR = os.path.join(DATA_DIR, "users")

# Helper to find user ID for an entity
@functools.lru_cache(maxsize=10000)
def _get_user_id_for_entity(entity_id: str) -> str:
    """Find the user ID associated with a resource, note, or exercise."""
    # Prefix mapping
    if entity_id.startswith("rs_"):
        model_name = "Resource"
    elif entity_id.startswith("nt_"):
        model_name = "Note"
    elif entity_id.startswith("ex_"):
        model_name = "Exercise"
    else:
        return "unowned"

    try:
        # Import models locally to avoid circular dependencies
        from app.models.db import Exercise, Note, Resource
        model_class = {"Resource": Resource, "Note": Note, "Exercise": Exercise}[model_name]

        with SessionLocal() as db:
            entity = db.query(model_class).filter(model_class.id == entity_id).first()
            if entity:
                # Notes and Exercises might need to look up their parent Resource
                if model_name in ["Note", "Exercise"]:
                    resource = db.query(Resource).filter(Resource.id == entity.resource_id).first()
                    if resource:
                        return str(resource.user_id)
                else:
                    return str(entity.user_id)
    except Exception as e:
        logger.error(f"Error fetching user_id for {entity_id}: {e}")

    return "unowned"

def _ensure_dir(path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path

class StorageManager:
    """Central manager for file-based storage of large text content with Redis caching"""

    @staticmethod
    def _get_resource_path(resource_id: str, suffix: str = "", extension: str = "md") -> str:
        user_id = _get_user_id_for_entity(resource_id)
        filename = f"{resource_id}{suffix}.{extension}"
        return _ensure_dir(os.path.join(USERS_DIR, user_id, "resources", filename))

    @staticmethod
    def _get_note_path(note_id: str, suffix: str = "", extension: str = "md") -> str:
        user_id = _get_user_id_for_entity(note_id)
        filename = f"{note_id}{suffix}.{extension}"
        return _ensure_dir(os.path.join(USERS_DIR, user_id, "notes", filename))

    @staticmethod
    def _get_exercise_path(exercise_id: str, suffix: str = "", extension: str = "json") -> str:
        user_id = _get_user_id_for_entity(exercise_id)
        filename = f"{exercise_id}{'_' + suffix if suffix else ''}.{extension}"
        return _ensure_dir(os.path.join(USERS_DIR, user_id, "exercises", filename))

    # --- Resource Content Methods ---

    @staticmethod
    def save_resource_text(resource_id: str, text: str):
        """Save extracted text to a .md file and update cache"""
        if not text:
            return
        path = StorageManager._get_resource_path(resource_id)
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            logger.debug(f"Saved resource text to {path}")

            # Update cache
            cache_key = f"resource_text:{resource_id}"
            set_cache_sync(cache_key, text)
        except Exception as e:
            logger.error(f"Failed to save resource text for {resource_id}: {e}")

    @staticmethod
    def get_resource_text(resource_id: str) -> str | None:
        """Read extracted text from cache or .md file"""
        cache_key = f"resource_text:{resource_id}"
        cached = get_cache_sync(cache_key)
        if cached:
            logger.info(f"Cache hit for resource text: {resource_id}")
            return cached

        path = StorageManager._get_resource_path(resource_id)
        if not os.path.exists(path):
            return None
        try:
            with open(path, encoding="utf-8") as f:
                content = f.read()
                # Populate cache
                set_cache_sync(cache_key, content)
                return content
        except Exception as e:
            logger.error(f"Failed to read resource text for {resource_id}: {e}")
            return None

    @staticmethod
    def save_resource_json(resource_id: str, suffix: str, data: dict | Any):
        """Save structured data (JSON) to a .json file and update cache"""
        if data is None:
            return
        path = StorageManager._get_resource_path(resource_id, suffix=f"_{suffix}", extension="json")
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            logger.debug(f"Saved resource {suffix} to {path}")

            # Update cache
            cache_key = f"resource_json:{resource_id}:{suffix}"
            set_cache_sync(cache_key, data)
        except Exception as e:
            logger.error(f"Failed to save resource {suffix} for {resource_id}: {e}")

    @staticmethod
    def get_resource_json(resource_id: str, suffix: str) -> dict | Any | None:
        """Read structured data (JSON) from cache or .json file"""
        cache_key = f"resource_json:{resource_id}:{suffix}"
        cached = get_cache_sync(cache_key)
        if cached:
            logger.info(f"Cache hit for resource json: {resource_id}:{suffix}")
            return cached

        path = StorageManager._get_resource_path(resource_id, suffix=f"_{suffix}", extension="json")
        if not os.path.exists(path):
            return None
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
                # Populate cache
                set_cache_sync(cache_key, data)
                return data
        except Exception as e:
            logger.error(f"Failed to read resource {suffix} for {resource_id}: {e}")
            return None

    # --- Note Methods ---

    @staticmethod
    def save_note_text(note_id: str, text: str, is_quickread: bool = False):
        """Save note content to a .md file and update cache"""
        if text is None:
            return
        suffix = "_quickread" if is_quickread else ""
        path = StorageManager._get_note_path(note_id, suffix=suffix)
        try:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            logger.debug(f"Saved note {note_id}{suffix} to {path}")

            # Update cache
            cache_key = f"note_text:{note_id}{suffix}"
            set_cache_sync(cache_key, text)
        except Exception as e:
            logger.error(f"Failed to save note {note_id}: {e}")

    @staticmethod
    def get_note_text(note_id: str, is_quickread: bool = False) -> str | None:
        """Read note content from cache or .md file"""
        suffix = "_quickread" if is_quickread else ""
        cache_key = f"note_text:{note_id}{suffix}"
        cached = get_cache_sync(cache_key)
        if cached:
            logger.info(f"Cache hit for note text: {note_id}{suffix}")
            return cached

        path = StorageManager._get_note_path(note_id, suffix=suffix)
        if not os.path.exists(path):
            return None
        try:
            with open(path, encoding="utf-8") as f:
                content = f.read()
                # Populate cache
                set_cache_sync(cache_key, content)
                return content
        except Exception as e:
            logger.error(f"Failed to read note {note_id}: {e}")
            return None

    # --- Deletion Methods ---

    @staticmethod
    def delete_resource_files(resource_id: str):
        """Delete all files and cache associated with a resource ID"""
        # List of possible suffixes/extensions
        patterns = [
            (StorageManager._get_resource_path(resource_id), f"resource_text:{resource_id}"),
            (
                StorageManager._get_resource_path(
                    resource_id, suffix="_structured", extension="json"
                ),
                f"resource_json:{resource_id}:structured",
            ),
            (
                StorageManager._get_resource_path(resource_id, suffix="_images", extension="json"),
                f"resource_json:{resource_id}:images",
            ),
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
    def delete_note_files(note_id: str):
        """Delete all files and cache associated with a note ID"""
        patterns = [
            (StorageManager._get_note_path(note_id), f"note_text:{note_id}"),
            (
                StorageManager._get_note_path(note_id, suffix="_quickread"),
                f"note_text:{note_id}_quickread",
            ),
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
    def save_exercise_json(exercise_id: str, data: dict | Any, suffix: str = ""):
        """Save structured JSON data for an exercise (like questions)"""
        path = StorageManager._get_exercise_path(exercise_id, suffix=suffix, extension="json")
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to write JSON for exercise {exercise_id}: {e}")
            raise e

    @staticmethod
    def get_exercise_json(exercise_id: str, suffix: str = "") -> dict | Any | None:
        """Retrieve JSON data for an exercise"""
        path = StorageManager._get_exercise_path(exercise_id, suffix=suffix, extension="json")
        if not os.path.exists(path):
            return None
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to read JSON for exercise {exercise_id}: {e}")
            return None

    @staticmethod
    def delete_exercise_files(exercise_id: str):
        """Delete all generated files associated with an exercise"""
        user_id = _get_user_id_for_entity(exercise_id)
        exercises_dir = os.path.join(USERS_DIR, user_id, "exercises")
        if not os.path.exists(exercises_dir):
            return

        for filename in os.listdir(exercises_dir):
            if filename.startswith(f"{exercise_id}"):
                file_path = os.path.join(exercises_dir, filename)
                try:
                    os.remove(file_path)
                    logger.info(f"Deleted exercise file: {file_path}")
                except Exception as e:
                    logger.error(f"Failed to delete {file_path}: {e}")
