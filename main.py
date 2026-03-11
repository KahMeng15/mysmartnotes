"""Main application entry point"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os

from app.config import get_settings
from app.utils.db import init_db
from app.routers import auth, subjects, lectures, chat, documents, flashcards, study_sessions, search, analytics, processing, groups, snapshots, templates

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info(f"Starting {settings.APP_NAME}")
    init_db()
    logger.info("Database initialized")
    
    # Seed default export templates
    from app.utils.db import SessionLocal
    try:
        db = SessionLocal()
        templates.seed_default_templates(db)
        db.close()
    except Exception as e:
        logger.warning(f"Could not seed default templates: {e}")
    
    yield
    # Shutdown
    logger.info("Shutting down application")


# Initialize app
app = FastAPI(
    title=settings.APP_NAME,
    description="Simple AI-powered study assistant",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(subjects.router)
app.include_router(lectures.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(flashcards.router)
app.include_router(study_sessions.router)
app.include_router(search.router)
app.include_router(analytics.router)
app.include_router(processing.router)
app.include_router(groups.router)
app.include_router(snapshots.router)
app.include_router(templates.router)

# Serve generated files (images, PDFs, etc.)
generated_dir = os.path.join(os.path.dirname(__file__), "generated")
if os.path.exists(generated_dir):
    try:
        app.mount("/generated", StaticFiles(directory=generated_dir), name="generated")
        logger.info(f"Generated files mounted from {generated_dir}")
    except Exception as e:
        logger.warning(f"Could not mount generated files: {e}")

# Serve output files (extracted images)
output_dir = os.path.join(os.path.dirname(__file__), "output")
if not os.path.exists(output_dir):
    os.makedirs(output_dir, exist_ok=True)

try:
    app.mount("/output", StaticFiles(directory=output_dir), name="output")
    logger.info(f"Output files mounted from {output_dir}")
except Exception as e:
    logger.warning(f"Could not mount output files: {e}")

static_dir = os.path.join(os.path.dirname(__file__), "app", "static")

# Dynamic routes for Note view/edit explicitly serving static files
@app.get("/note/{id}")
async def serve_note_view(id: str):
    return FileResponse(os.path.join(static_dir, "note.html"))

@app.get("/note/{id}/edit")
async def serve_note_edit(id: str):
    return FileResponse(os.path.join(static_dir, "note.html"))

@app.get("/login")
async def serve_login():
    return FileResponse(os.path.join(static_dir, "login.html"))

@app.get("/dashboard")
async def serve_dashboard():
    return FileResponse(os.path.join(static_dir, "dashboard.html"))

@app.get("/exporttemplates")
async def serve_export_templates():
    return FileResponse(os.path.join(static_dir, "exporttemplates.html"))

@app.get("/exporttemplate/{id}")
async def serve_export_template(id: str):
    return FileResponse(os.path.join(static_dir, "exporttemplate.html"))

@app.get("/")
async def root():
    return RedirectResponse(url="/login")

# Serve static files and templates
if os.path.exists(static_dir):
    try:
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
        logger.info(f"Static files mounted from {static_dir}")
    except Exception as e:
        logger.warning(f"Could not mount static files: {e}")


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


@app.get("/docs")
def docs():
    """OpenAPI documentation"""
    return {"message": "API documentation available at /docs"}


if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
