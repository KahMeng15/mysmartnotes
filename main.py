"""Main application entry point"""
import sys
import os

# Ensure the current directory is in the path for module resolution
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.config import get_settings
from app.utils.db import init_db
from app.routers import auth, subjects, lectures, chat, summaries, study_sessions, search, analytics, processing, groups, snapshots, templates, admin, quiz

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
        
        # Bootstrap System Settings from .env defaults
        from app.models.db import SystemSettings
        sys_settings = db.query(SystemSettings).first()
        if not sys_settings:
            logger.info("Initializing SystemSettings from .env defaults")
            sys_settings = SystemSettings(
                global_ai_provider=settings.GLOBAL_AI_PROVIDER,
                global_ai_model=settings.GLOBAL_AI_MODEL,
                global_ai_api_key=settings.GLOBAL_GEMINI_API_KEY or settings.GLOBAL_HUGGINGFACE_TOKEN,
                # Note: We prioritize Gemini key if provider is gemini, else HF
            )
            # If specifically huggingface, use that token
            if settings.GLOBAL_AI_PROVIDER == "huggingface":
                sys_settings.global_ai_api_key = settings.GLOBAL_HUGGINGFACE_TOKEN
                
            db.add(sys_settings)
            db.commit()

        # Bootstrap Admin
        if settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD:
            from app.models.db import User
            from app.utils.auth import hash_password
            admin_user = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
            if not admin_user:
                logger.info(f"Creating default admin user: {settings.ADMIN_EMAIL}")
                new_admin = User(
                    username=settings.ADMIN_EMAIL,
                    email=settings.ADMIN_EMAIL,
                    hashed_password=hash_password(settings.ADMIN_PASSWORD),
                    is_admin=True,
                    is_active=True,
                    is_approved=True,
                    full_name="System Administrator",
                    nickname="Admin"
                )
                db.add(new_admin)
                db.commit()
            elif not admin_user.is_admin:
                logger.info(f"Elevating user to admin: {settings.ADMIN_EMAIL}")
                admin_user.is_admin = True
                db.commit()
                
        db.close()
    except Exception as e:
        logger.warning(f"Startup initialization warning: {e}")
    
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

from starlette.requests import Request
from starlette.responses import JSONResponse
from app.models.db import SystemSettings, IPFilter, UserLog
from app.utils.db import SessionLocal

@app.middleware("http")
async def system_settings_middleware(request: Request, call_next):
    # Skip for static files or dependencies that don't need db to avoid overhead on every tiny asset
    if request.url.path.startswith("/styles/") or request.url.path.startswith("/js/") or request.url.path.startswith("/fonts/"):
        return await call_next(request)

    db = SessionLocal()
    try:
        settings = db.query(SystemSettings).first()
        client_ip = request.client.host if request.client else "127.0.0.1"

        if settings:
            # 1. Lockdown Mode: allow local IPs only
            if settings.lockdown_mode:
                if not (client_ip.startswith("127.") or client_ip.startswith("192.168.") or client_ip.startswith("10.") or client_ip == "::1"):
                    return JSONResponse(status_code=403, content={"detail": "System is in Lockdown Mode. Local network access only."})
            
            # 2. Maintenance Mode
            # Allow /admin, /auth, /login, /maintenance, and /static files to bypass
            bypass_paths = ["/admin", "/auth", "/login", "/maintenance", "/styles", "/js", "/fonts", "/favicon.ico"]
            is_bypassed = any(request.url.path.startswith(path) for path in bypass_paths)
            
            if settings.maintenance_mode and not is_bypassed:
                # 2a. Allow admin bypass if authenticated
                is_admin = False
                auth_header = request.headers.get("Authorization")
                if auth_header and auth_header.startswith("Bearer "):
                    token = auth_header.split(" ")[1]
                    try:
                        from app.utils.auth import decode_token
                        payload = decode_token(token)
                        if payload:
                            u_id = payload.get("sub")
                            if u_id:
                                from app.models.db import User
                                user = db.query(User).filter(User.id == int(u_id)).first()
                                if user and user.is_admin:
                                    is_admin = True
                    except Exception as e:
                        logger.error(f"Error verifying admin bypass: {e}")
                
                if not is_admin:
                    # If it's a browser request (HTML), redirect to maintenance page
                    if "text/html" in request.headers.get("accept", ""):
                        from starlette.responses import RedirectResponse
                        return RedirectResponse(url="/maintenance")
                    # Otherwise return 503 JSON
                    return JSONResponse(status_code=503, content={"detail": "System is undergoing maintenance. Only administrators can access."})
            
        # 3. IP Filtering
        filters = db.query(IPFilter).all()
        for f in filters:
            if f.rule_type == "specific_ip" and f.filter_type == "blacklist" and f.value == client_ip:
                return JSONResponse(status_code=403, content={"detail": "Your IP has been blacklisted."})
            # (Country blocking would require geoip database, skipped for simple implementation but model supports it)

        # 4. Log page open
        if request.method == "GET" and ".html" in request.url.path:
            user_agent = request.headers.get("user-agent", "Unknown")
            db.add(UserLog(action="page_access", ip_address=client_ip, device_info=user_agent, details=request.url.path))
            db.commit()

        response = await call_next(request)

        # 5. Sliding Session (Reset timer on activity)
        if settings and settings.session_reset_on_activity:
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
                try:
                    from app.utils.auth import decode_token, create_access_token
                    from datetime import timedelta
                    payload = decode_token(token)
                    if payload:
                        u_id = payload.get("sub")
                        if u_id:
                            # Re-issue token with full duration
                            expire_minutes = 30 # default
                            if settings.session_length:
                                length = settings.session_length
                                unit = settings.session_unit or "hours"
                                if unit == "hours": expire_minutes = length * 60
                                elif unit == "days": expire_minutes = length * 1440
                            
                            new_token = create_access_token(
                                data={"sub": u_id},
                                expires_delta=timedelta(minutes=expire_minutes)
                            )
                            response.headers["X-New-Token"] = new_token
                            response.headers["Access-Control-Expose-Headers"] = "X-New-Token"
                except Exception as e:
                    pass # Silently fail for token re-issue

        return response
    finally:
        db.close()

# Include routers
app.include_router(auth.router)
app.include_router(subjects.router)
app.include_router(lectures.router)
app.include_router(chat.router)
app.include_router(summaries.router)

app.include_router(study_sessions.router)
app.include_router(search.router)
app.include_router(analytics.router)
app.include_router(processing.router)
app.include_router(groups.router)
app.include_router(snapshots.router)
app.include_router(templates.router)
app.include_router(admin.router)
app.include_router(quiz.router)

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

@app.get("/note/{id}/summary")
async def serve_summary_view(id: str):
    return FileResponse(os.path.join(static_dir, "summary.html"))

@app.get("/note/{id}/summary/{summary_id}")
async def serve_summary_version_view(id: str, summary_id: str):
    return FileResponse(os.path.join(static_dir, "summary.html"))

@app.get("/note/{id}/summary/{summary_id}/edit")
async def serve_summary_edit_view(id: str, summary_id: str):
    return FileResponse(os.path.join(static_dir, "summary.html"))

@app.get("/note/{id}/edit")
async def serve_note_edit(id: str):
    return FileResponse(os.path.join(static_dir, "note.html"))

@app.get("/login")
async def serve_login():
    return FileResponse(os.path.join(static_dir, "login.html"))

@app.get("/dashboard")
async def serve_dashboard():
    return FileResponse(os.path.join(static_dir, "dashboard.html"))

@app.get("/mynotes")
async def serve_mynotes():
    return FileResponse(os.path.join(static_dir, "mynotes.html"))

@app.get("/chat")
async def serve_chat():
    return FileResponse(os.path.join(static_dir, "chat.html"))

@app.get("/exporttemplates")
async def serve_export_templates():
    return FileResponse(os.path.join(static_dir, "exporttemplate-selector.html"))

@app.get("/admin")
async def serve_admin():
    return FileResponse(os.path.join(static_dir, "admin.html"))

@app.get("/maintenance")
async def serve_maintenance():
    return FileResponse(os.path.join(static_dir, "maintenance.html"))

@app.get("/exporttemplate/{id}")
async def serve_export_template(id: str):
    return FileResponse(os.path.join(static_dir, "exporttemplate-editor.html"))

@app.get("/pomodoro")
async def serve_pomodoro():
    return FileResponse(os.path.join(static_dir, "pomodoro.html"))

@app.get("/quiz")
async def serve_quiz_dashboard():
    return FileResponse(os.path.join(static_dir, "quiz_dashboard.html"))

@app.get("/quiz/{id}")
async def serve_quiz_view(id: str):
    return FileResponse(os.path.join(static_dir, "quiz_view.html"))

@app.get("/quiz/{id}/{mode}")
async def serve_quiz_mode_view(id: str, mode: str):
    return FileResponse(os.path.join(static_dir, "quiz_view.html"))

@app.get("/pomodoro_popout.html")
async def serve_pomodoro_popout():
    return FileResponse(os.path.join(static_dir, "pomodoro_popout.html"))

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
