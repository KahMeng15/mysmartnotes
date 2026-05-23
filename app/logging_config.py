import os
import logging.config

LOGS_DIR = os.path.join(os.path.dirname(__file__), "..", "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
            "level": "INFO",
        },
        "all_api": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "2-All-API.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "auth_api": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "3-Auth-API.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "notes_api": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "4-Notes-API.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "summary_api": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "5-Summary-API.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "quiz_api": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "6-Quiz-API.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "pomodoro_api": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "7-Pomodoro-API.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "chat_api": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "8-Chat-API.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "other_api": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "9-Other-API.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "chat_worker": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "10-Chat-Worker.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "upload_worker": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "11-Upload-Worker.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "database_worker": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "12-Database-Worker.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "quiz_worker": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "13-Quiz-Worker.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "pomodoro_worker": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "14-Pomodoro-Worker.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "summary_worker": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "15-Summary-Worker.log"),
            "formatter": "standard",
            "level": "INFO",
        },
    },
    "loggers": {
        # Catch-all for API
        "fastapi": {
            "handlers": ["console", "all_api"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn": {
            "handlers": ["console", "all_api"],
            "level": "INFO",
            "propagate": False,
        },
        "app.routers": {
            "handlers": ["other_api", "all_api"],
            "level": "INFO",
            "propagate": False,
        },
        "app.routers.auth": {
            "handlers": ["auth_api", "all_api"],
            "level": "INFO",
            "propagate": False,
        },
        "app.routers.lectures": {
            "handlers": ["notes_api", "all_api"],
            "level": "INFO",
            "propagate": False,
        },
        "app.routers.summaries": {
            "handlers": ["summary_api", "all_api"],
            "level": "INFO",
            "propagate": False,
        },
        "app.routers.quiz": {
            "handlers": ["quiz_api", "all_api"],
            "level": "INFO",
            "propagate": False,
        },
        "app.routers.study_sessions": {
            "handlers": ["pomodoro_api", "all_api"],
            "level": "INFO",
            "propagate": False,
        },
        "app.routers.chat": {
            "handlers": ["chat_api", "all_api"],
            "level": "INFO",
            "propagate": False,
        },
        # Workers
        "app.worker_main.chat": {
            "handlers": ["console", "chat_worker"],
            "level": "INFO",
            "propagate": False,
        },
        "app.worker_main.upload": {
            "handlers": ["console", "upload_worker"],
            "level": "INFO",
            "propagate": False,
        },
        "app.worker_main.database": {
            "handlers": ["console", "database_worker"],
            "level": "INFO",
            "propagate": False,
        },
        "app.worker_main.quiz": {
            "handlers": ["console", "quiz_worker"],
            "level": "INFO",
            "propagate": False,
        },
        "app.worker_main.pomodoro": {
            "handlers": ["console", "pomodoro_worker"],
            "level": "INFO",
            "propagate": False,
        },
        "app.worker_main.summary": {
            "handlers": ["console", "summary_worker"],
            "level": "INFO",
            "propagate": False,
        },
        # General worker fallback
        "app.worker_main": {
            "handlers": ["console", "database_worker"],
            "level": "INFO",
            "propagate": False,
        },
    },
    "root": {
        "handlers": ["console", "all_api"],
        "level": "INFO",
    }
}

def setup_logging():
    logging.config.dictConfig(LOGGING_CONFIG)
