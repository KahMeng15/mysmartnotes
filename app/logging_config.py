import logging.config
import os

LOGS_DIR = os.path.join(os.path.dirname(__file__), "..", "logs")
os.makedirs(LOGS_DIR, exist_ok=True)

LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {"format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
            "level": "INFO",
        },
        "backend_file": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "backend.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "worker_file": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "worker.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "processing_file": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "processing.log"),
            "formatter": "standard",
            "level": "INFO",
        },
        "error_file": {
            "class": "logging.FileHandler",
            "filename": os.path.join(LOGS_DIR, "errors.log"),
            "formatter": "standard",
            "level": "ERROR",
        },
    },
    "loggers": {
        "app": {
            "handlers": ["console", "backend_file", "error_file"],
            "level": "INFO",
            "propagate": False,
        },
        "app.processing": {
            "handlers": ["console", "processing_file", "error_file"],
            "level": "INFO",
            "propagate": False,
        },
        "app.worker_main": {
            "handlers": ["console", "worker_file", "error_file"],
            "level": "INFO",
            "propagate": False,
        },
        "__main__": {
            "handlers": ["console", "worker_file", "error_file"],
            "level": "INFO",
            "propagate": False,
        },
        "fastapi": {
            "handlers": ["console", "backend_file", "error_file"],
            "level": "INFO",
            "propagate": False,
        },
        "uvicorn": {
            "handlers": ["console", "backend_file", "error_file"],
            "level": "INFO",
            "propagate": False,
        },
    },
    "root": {
        "handlers": ["console", "backend_file", "error_file"],
        "level": "INFO",
    },
}


def setup_logging():
    logging.config.dictConfig(LOGGING_CONFIG)
