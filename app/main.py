"""Main application entry point"""
import sys
import os
import time
import uuid
from collections import defaultdict, deque
from threading import Lock

# Ensure the current directory is in the path for module resolution
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.config import get_settings
from app.utils.db import init_db
from app.utils.crypto import encrypt_secret
from app.utils.observability import record_request
from app.routers import auth, subjects, lectures, chat, summaries, study_sessions, search, analytics, processing, groups, snapshots, templates, admin, quiz, support

# Configure logging
from app.logging_config import setup_logging
setup_logging()
logger = logging.getLogger(__name__)

settings = get_settings()


def _is_production() -> bool:
    return settings.ENVIRONMENT.lower() == "production"


def _parse_cors_origins() -> list[str]:
    origins = [origin.strip() for origin in settings.CORS_ALLOWED_ORIGINS.split(",") if origin.strip()]
    if not origins:
        return ["http://localhost:8000", "http://127.0.0.1:8000"]
    return origins


def _validate_production_settings() -> None:
    if not _is_production():
        return

    if not settings.SECRET_KEY or len(settings.SECRET_KEY) < 32:
        raise RuntimeError("Production startup blocked: SECRET_KEY must be set to at least 32 characters")

    if "sqlite" in settings.DATABASE_URL and not settings.ALLOW_SQLITE_IN_PRODUCTION:
        raise RuntimeError("Production startup blocked: sqlite is not allowed. Set a production database URL or explicitly enable ALLOW_SQLITE_IN_PRODUCTION=true")

    if "*" in _parse_cors_origins():
        raise RuntimeError("Production startup blocked: wildcard CORS origin is not allowed")


# Lifespan context manager for startup/shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    _validate_production_settings()
    logger.info(f"Starting {settings.APP_NAME}")
    init_db()
    logger.info("Database initialized")

    try:
        from app.utils.tasks import TaskManager
        deleted = TaskManager.cleanup_old_tasks()
        if deleted:
            logger.info(f"Cleaned up {deleted} old task records")
    except Exception as e:
        logger.warning(f"Task cleanup startup warning: {e}")
    
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
                global_ai_api_key=encrypt_secret(settings.GLOBAL_GEMINI_API_KEY or settings.GLOBAL_HUGGINGFACE_TOKEN),
                # Note: We prioritize Gemini key if provider is gemini, else HF
            )
            # If specifically huggingface, use that token
            if settings.GLOBAL_AI_PROVIDER == "huggingface":
                sys_settings.global_ai_api_key = encrypt_secret(settings.GLOBAL_HUGGINGFACE_TOKEN)
                
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

_rate_limit_lock = Lock()
_rate_limit_buckets = defaultdict(deque)

# Endpoint-level burst controls for abuse-prone routes.
_RATE_LIMIT_POLICY = {
    "/auth/login": (10, 60),
    "/auth/google-login": (20, 60),
    "/auth/password-reset-request": (5, 3600),
    "/processing/smart-extract": (6, 60),
    "/processing/smart-extract/download": (6, 60),
}

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=_parse_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-CSRF-Token"],
)

from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from app.models.db import SystemSettings, IPFilter, UserLog
from app.utils.db import SessionLocal


# Custom exception handlers for HTTP status codes
@app.exception_handler(404)
async def not_found_exception_handler(request: Request, exc):
    return FileResponse(os.path.join(static_dir, "error-404.html"), media_type="text/html")


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code == 404:
        return FileResponse(os.path.join(static_dir, "error-404.html"), media_type="text/html", status_code=404)
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
    )


@app.exception_handler(500)
async def internal_error_exception_handler(request: Request, exc):
    logger.error(f"Internal server error: {exc}", exc_info=True)
    return FileResponse(os.path.join(static_dir, "error-500.html"), media_type="text/html", status_code=500)


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return FileResponse(os.path.join(static_dir, "error-500.html"), media_type="text/html", status_code=500)


@app.middleware("http")
async def request_observability_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    started_at = time.time()

    response = await call_next(request)
    duration_ms = int((time.time() - started_at) * 1000)

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline' https://www.gstatic.com https://www.googleapis.com https://apis.google.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.jsdelivr.net; font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net; frame-src https://mysmartnotes-965fe.firebaseapp.com https://accounts.google.com; connect-src 'self' https://www.googleapis.com https://apis.google.com https://identitytoolkit.googleapis.com https://mysmartnotes-965fe.firebaseapp.com"

    if _is_production():
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    logger.info(
        "request.completed",
        extra={
            "request_id": request_id,
            "path": request.url.path,
            "method": request.method,
            "status_code": response.status_code,
            "duration_ms": duration_ms,
        },
    )
    record_request(request.url.path, response.status_code, duration_ms)
    return response


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    policy = _RATE_LIMIT_POLICY.get(request.url.path)
    if not policy:
        return await call_next(request)

    max_requests, window_seconds = policy
    client_ip = request.client.host if request.client else "unknown"
    key = f"{client_ip}:{request.url.path}"
    now = time.time()

    with _rate_limit_lock:
        bucket = _rate_limit_buckets[key]
        while bucket and bucket[0] <= now - window_seconds:
            bucket.popleft()

        if len(bucket) >= max_requests:
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Please retry later."},
            )

        bucket.append(now)

    return await call_next(request)


@app.middleware("http")
async def csrf_protection_middleware(request: Request, call_next):
    if request.method in {"GET", "HEAD", "OPTIONS", "TRACE"}:
        return await call_next(request)

    csrf_exempt_paths = {
        "/auth/login",
        "/auth/google-login",
        "/auth/google-complete",
        "/auth/register",
        "/auth/password-reset-request",
        "/auth/password-reset",
    }
    if request.url.path in csrf_exempt_paths:
        return await call_next(request)

    cookie_token = request.cookies.get("access_token")
    # Enforce CSRF only for cookie-authenticated browser sessions.
    if not cookie_token:
        return await call_next(request)

    csrf_cookie = request.cookies.get(settings.CSRF_COOKIE_NAME)
    csrf_header = request.headers.get(settings.CSRF_HEADER_NAME)
    if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
        return JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})

    return await call_next(request)

@app.middleware("http")
async def system_settings_middleware(request: Request, call_next):
    # Skip for static files or dependencies that don't need db to avoid overhead on every tiny asset
    if request.url.path.startswith("/styles/") or request.url.path.startswith("/js/") or request.url.path.startswith("/fonts/"):
        return await call_next(request)

    db = SessionLocal()
    try:
        sys_settings = db.query(SystemSettings).first()
        client_ip = request.client.host if request.client else "127.0.0.1"

        if sys_settings:
            # 1. Lockdown Mode: allow local IPs only
            if sys_settings.lockdown_mode:
                if not (client_ip.startswith("127.") or client_ip.startswith("192.168.") or client_ip.startswith("10.") or client_ip == "::1"):
                    return JSONResponse(status_code=403, content={"detail": "System is in Lockdown Mode. Local network access only."})
            
            # 2. Maintenance Mode
            # Allow /admin, /auth, /login, /maintenance, and /static files to bypass
            bypass_paths = ["/admin", "/auth", "/login", "/maintenance", "/styles", "/js", "/fonts", "/favicon.ico"]
            is_bypassed = any(request.url.path.startswith(path) for path in bypass_paths)
            
            if sys_settings.maintenance_mode and not is_bypassed:
                # 2a. Allow admin bypass if authenticated
                is_admin = False
                auth_header = request.headers.get("Authorization")
                cookie_token = request.cookies.get("access_token")
                token = None
                if auth_header and auth_header.startswith("Bearer "):
                    token = auth_header.split(" ")[1]
                elif cookie_token:
                    token = cookie_token

                if token:
                    try:
                        from app.utils.auth import decode_token, token_version_matches_user
                        payload = decode_token(token)
                        if payload:
                            u_id = payload.get("sub")
                            if u_id:
                                from app.models.db import User
                                user = db.query(User).filter(User.id == int(u_id)).first()
                                if user and user.is_admin and token_version_matches_user(payload, user):
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
        if sys_settings and sys_settings.session_reset_on_activity and request.url.path != "/auth/logout":
            auth_header = request.headers.get("Authorization")
            cookie_token = request.cookies.get("access_token")
            token = None
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ")[1]
            elif cookie_token:
                token = cookie_token

            if token:
                try:
                    from app.utils.auth import decode_token, create_access_token, token_version_matches_user
                    from datetime import timedelta
                    payload = decode_token(token)
                    if payload:
                        u_id = payload.get("sub")
                        if u_id:
                            from app.models.db import User
                            user = db.query(User).filter(User.id == int(u_id)).first()
                            if not user or not token_version_matches_user(payload, user):
                                return response

                            # Re-issue token with full duration
                            expire_minutes = 30 # default
                            if sys_settings.session_length:
                                length = sys_settings.session_length
                                unit = sys_settings.session_unit or "hours"
                                if unit == "hours": expire_minutes = length * 60
                                elif unit == "days": expire_minutes = length * 1440
                            
                            new_token = create_access_token(
                                data={"sub": str(u_id), "tv": int(user.token_version or 0)},
                                expires_delta=timedelta(minutes=expire_minutes)
                            )
                            response.headers["X-New-Token"] = new_token
                            response.headers["Access-Control-Expose-Headers"] = "X-New-Token"
                            response.set_cookie(
                                key="access_token",
                                value=new_token,
                                httponly=True,
                                secure=settings.COOKIE_SECURE,
                                samesite=settings.COOKIE_SAMESITE,
                                max_age=expire_minutes * 60,
                                path="/",
                            )
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
app.include_router(support.router)

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

static_dir = os.path.join(os.path.dirname(__file__), "static")

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

@app.get("/reset-password")
async def serve_reset_password():
    return FileResponse(os.path.join(static_dir, "reset-password.html"))

@app.get("/signup")
async def serve_signup():
    # Serve login.html (signup panel inside) with invitation token if provided
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

@app.get("/admin/diagnostics")
async def serve_diagnostics():
    return FileResponse(os.path.join(static_dir, "http-status-diagnostics.html"))

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

@app.get("/settings")
async def serve_settings():
    return FileResponse(os.path.join(static_dir, "settings.html"))

@app.get("/upload")
async def serve_upload():
    return FileResponse(os.path.join(static_dir, "upload.html"))

@app.get("/settings.html")
async def redirect_settings_html():
    return RedirectResponse(url="/settings", status_code=307)

@app.get("/upload.html")
async def redirect_upload_html():
    return RedirectResponse(url="/upload", status_code=307)

@app.get("/pomodoro_popout.html")
async def serve_pomodoro_popout():
    return FileResponse(os.path.join(static_dir, "pomodoro_popout.html"))

@app.get("/")
async def root():
        # Decide landing page based on client-side auth token state.
        # Tokens are stored in localStorage, so server cannot reliably inspect auth on this request.
        return HTMLResponse(
                """
<!DOCTYPE html>
<html lang=\"en\">
<head>
    <meta charset=\"UTF-8\" />
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
    <title>Redirecting...</title>
</head>
<body>
    <script>
        (async function () {
            const token = localStorage.getItem('token');
            if (!token) {
                window.location.replace('/login');
                return;
            }

            try {
                const res = await fetch('/auth/me', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    window.location.replace('/dashboard');
                    return;
                }
            } catch (e) {
                // Network issue or transient error, fall through to login.
            }

            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.replace('/login');
        })();
    </script>
</body>
</html>
                """
        )

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
