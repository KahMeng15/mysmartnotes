"""Admin Dashboard Router"""
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from app.utils.quotas import ensure_default_tier_configs
import datetime
import secrets

from app.models.db import User, SystemSettings, EmailConfig, IPFilter, RateLimitConfig, UserLog, Lecture, Subject, SubjectGroup, ChatMessage, StudySession, UserInvitation, TierConfig
from app.schemas.admin import (
    SystemSettingsSchema, EmailConfigSchema, IPFilterSchema, IPFilterCreate, RateLimitConfigSchema, UserLogSchema, UserAdminResponse, UserActionRequest,
    UserInvitationCreate, UserInvitationResponse, TierConfigSchema
)
from app.utils.db import get_db
from app.routers.auth import get_current_user
from app.utils.auth import hash_password
from app.utils.email import send_invitation_email
from app.utils.invitation_utils import build_link_only_email, is_link_only_email
from app.utils.crypto import encrypt_secret, decrypt_secret
from app.utils.observability import get_runtime_metrics_snapshot

router = APIRouter(prefix="/admin", tags=["admin"])


def _prepare_system_settings_response(settings: SystemSettings) -> dict:
    return {
        "lockdown_mode": settings.lockdown_mode,
        "signup_config": settings.signup_config,
        "maintenance_mode": settings.maintenance_mode,
        "footer_text": settings.footer_text,
        "domain_url": settings.domain_url,
        "global_ai_provider": settings.global_ai_provider,
        "global_ai_model": settings.global_ai_model,
        "global_ai_api_key": decrypt_secret(settings.global_ai_api_key),
        "global_ai_base_url": settings.global_ai_base_url,
        "ai_limit_per_user": settings.ai_limit_per_user,
        "session_length": settings.session_length,
        "session_unit": settings.session_unit,
        "session_reset_on_activity": settings.session_reset_on_activity,
        "max_quiz_questions": settings.max_quiz_questions,
        "unnecessary_logins_enabled": settings.unnecessary_logins_enabled,
    }

def get_current_admin_user(current_user: User = Depends(get_current_user)):
    """Dependency to check if current user is an admin"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user


@router.get("/runtime-metrics")
def get_runtime_metrics(admin: User = Depends(get_current_admin_user)):
    """Get lightweight runtime metrics for production diagnostics."""
    return get_runtime_metrics_snapshot()

# --- System Settings ---
@router.get("/system-settings", response_model=SystemSettingsSchema)
def get_system_settings(db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    from app.config import get_settings
    app_settings = get_settings()
    
    settings = db.query(SystemSettings).first()
    if not settings:
        settings = SystemSettings(
            global_ai_provider=app_settings.GLOBAL_AI_PROVIDER,
            global_ai_model=app_settings.GLOBAL_AI_MODEL,
            global_ai_api_key=encrypt_secret(app_settings.GLOBAL_GEMINI_API_KEY or app_settings.GLOBAL_HUGGINGFACE_TOKEN),
        )
        db.add(settings)
        db.commit()
        db.refresh(settings)
    else:
        # Prefill empty fields from .env if they are null/empty in DB
        updated = False
        if not settings.global_ai_provider:
            settings.global_ai_provider = app_settings.GLOBAL_AI_PROVIDER
            updated = True
        if not settings.global_ai_model:
            settings.global_ai_model = app_settings.GLOBAL_AI_MODEL
            updated = True
        if not settings.global_ai_api_key:
            settings.global_ai_api_key = encrypt_secret(app_settings.GLOBAL_GEMINI_API_KEY or app_settings.GLOBAL_HUGGINGFACE_TOKEN)
            updated = True
        
        if updated:
            db.commit()
            db.refresh(settings)
            
    return _prepare_system_settings_response(settings)

@router.put("/system-settings", response_model=SystemSettingsSchema)
def update_system_settings(update_data: SystemSettingsSchema, db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    settings = db.query(SystemSettings).first()
    if not settings:
        settings = SystemSettings()
        db.add(settings)
    
    for key, value in update_data.model_dump().items():
        if key == "global_ai_api_key":
            setattr(settings, key, encrypt_secret(value))
        else:
            setattr(settings, key, value)
    
    settings.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(settings)
    return _prepare_system_settings_response(settings)

# --- Email Config ---
@router.get("/email-config", response_model=EmailConfigSchema)
def get_email_config(db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    config = db.query(EmailConfig).first()
    if not config:
        config = EmailConfig()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

@router.put("/email-config", response_model=EmailConfigSchema)
def update_email_config(update_data: EmailConfigSchema, db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    config = db.query(EmailConfig).first()
    if not config:
        config = EmailConfig()
        db.add(config)
    
    for key, value in update_data.model_dump().items():
        setattr(config, key, value)
    
    config.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(config)
    return config

@router.post("/email-config/test")
def test_email_config(request_body: dict, request: Request, db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    """Send a test email to verify email configuration is working"""
    from app.utils.email import send_email
    from pydantic import BaseModel, validator
    
    class TestEmailRequest(BaseModel):
        test_email: str
        
        @validator('test_email')
        def validate_email(cls, v):
            if not v or '@' not in v:
                raise ValueError('Invalid email address')
            return v.lower().strip()
    
    # Validate request
    try:
        validated = TestEmailRequest(**request_body)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid email: {str(e)}")
    
    # Get email config
    config = db.query(EmailConfig).first()
    if not config or not config.smtp_provider or not config.email_address or not config.app_password:
        raise HTTPException(
            status_code=400, 
            detail="Email configuration is incomplete. Please configure SMTP settings first."
        )
    
    # Send test email
    test_subject = "MySmartNotes Email Configuration Test"
    test_body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #3b82f6;">Email Configuration Test</h2>
            <p>This is a test email from MySmartNotes to verify your SMTP configuration is working correctly.</p>
            <div style="background-color: #f0f9ff; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6; margin: 20px 0;">
                <p style="margin: 0;"><strong>✓ Good news!</strong> Your email configuration is working properly.</p>
            </div>
            <p style="font-size: 12px; color: #666; margin-top: 30px;">
                If you received this email, your system can now send:
                <ul style="margin: 10px 0;">
                    <li>User invitations</li>
                    <li>Password reset links</li>
                    <li>System notifications</li>
                </ul>
            </p>
            <p style="font-size: 11px; color: #999; margin-top: 20px;">
                Sent at {datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")} UTC
            </p>
        </body>
    </html>
    """
    
    success = send_email(db, validated.test_email, test_subject, test_body, is_html=True)
    
    if success:
        # Log action
        ip_address = request.client.host if request.client else None
        db.add(UserLog(
            user_id=admin.id,
            action="email_test",
            ip_address=ip_address,
            device_info=request.headers.get("user-agent", "Unknown"),
            details=f"Test email sent to {validated.test_email}"
        ))
        db.commit()
        
        return {
            "success": True,
            "message": f"Test email sent successfully to {validated.test_email}. Please check your inbox."
        }
    else:
        raise HTTPException(
            status_code=500,
            detail="Failed to send test email. Check your SMTP configuration and try again."
        )

# --- Rate Limit Config ---
@router.get("/rate-limits", response_model=RateLimitConfigSchema)
def get_rate_limits(db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    limits = db.query(RateLimitConfig).first()
    if not limits:
        limits = RateLimitConfig()
        db.add(limits)
        db.commit()
        db.refresh(limits)
    return limits

@router.put("/rate-limits", response_model=RateLimitConfigSchema)
def update_rate_limits(update_data: RateLimitConfigSchema, db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    limits = db.query(RateLimitConfig).first()
    if not limits:
        limits = RateLimitConfig()
        db.add(limits)
    
    for key, value in update_data.model_dump().items():
        setattr(limits, key, value)
    
    limits.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(limits)
    return limits

# --- Tier Configurations ---
@router.get("/tiers", response_model=List[TierConfigSchema])
def get_all_tiers(db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    """Get all tier configurations"""
    ensure_default_tier_configs(db)
    tiers = db.query(TierConfig).all()
    return tiers

@router.get("/tiers/{tier_id}", response_model=TierConfigSchema)
def get_tier(tier_id: str, db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    """Get a specific tier configuration"""
    tier = db.query(TierConfig).filter(TierConfig.id == tier_id).first()
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")
    return tier

@router.put("/tiers/{tier_id}", response_model=TierConfigSchema)
def update_tier(tier_id: str, update_data: TierConfigSchema, db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    """Update a tier configuration"""
    tier = db.query(TierConfig).filter(TierConfig.id == tier_id).first()
    if not tier:
        raise HTTPException(status_code=404, detail="Tier not found")
    
    for key, value in update_data.model_dump(exclude={"created_at", "updated_at"}).items():
        if value is not None:
            setattr(tier, key, value)
    
    tier.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(tier)
    return tier

# --- IP Filters ---
@router.get("/ip-filters", response_model=List[IPFilterSchema])
def get_ip_filters(db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    return db.query(IPFilter).all()

@router.post("/ip-filters", response_model=IPFilterSchema)
def create_ip_filter(filter_data: IPFilterCreate, db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    new_filter = IPFilter(**filter_data.model_dump())
    db.add(new_filter)
    db.commit()
    db.refresh(new_filter)
    return new_filter

@router.delete("/ip-filters/{filter_id}")
def delete_ip_filter(filter_id: int, db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    db_filter = db.query(IPFilter).filter(IPFilter.id == filter_id).first()
    if not db_filter:
        raise HTTPException(status_code=404, detail="Filter not found")
    db.delete(db_filter)
    db.commit()
    return {"message": "Filter deleted"}

# --- Users Management ---
@router.get("/users", response_model=List[UserAdminResponse])
def get_all_users(db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    users = db.query(User).all()
    results = []
    
    # Compute stats for each user
    for u in users:
        notes_count = db.query(func.count(Lecture.id)).filter(Lecture.user_id == u.id).scalar() or 0
        subjects_count = db.query(func.count(Subject.id)).filter(Subject.user_id == u.id).scalar() or 0
        groups_count = db.query(func.count(SubjectGroup.id)).filter(SubjectGroup.user_id == u.id).scalar() or 0
        conv_count = db.query(func.count(ChatMessage.id)).filter(ChatMessage.user_id == u.id).scalar() or 0
        
        # Calculate storage used
        storage_bytes = db.query(func.sum(Lecture.file_size)).filter(Lecture.user_id == u.id).scalar() or 0
        storage_mb = round(storage_bytes / (1024 * 1024), 2)
        
        total_logins = db.query(func.count(UserLog.id)).filter(UserLog.user_id == u.id, UserLog.action == 'login').scalar() or 0
        # Calculate roughly sum of study sessions durations (or approximate)
        total_time_mins = db.query(func.sum(StudySession.duration_minutes)).filter(StudySession.user_id == u.id).scalar() or 0
        
        user_dict = u.__dict__.copy()
        user_dict["ai_api_key"] = None
        user_dict["ai_api_key_configured"] = bool(u.ai_api_key)
        user_dict.update({
            "notes_count": notes_count,
            "subjects_count": subjects_count,
            "groups_count": groups_count,
            "conversations_count": conv_count,
            "questions_count": conv_count, # roughly same as conv count in this context
            "storage_used": f"{storage_mb} MB",
            "total_logins": total_logins,
            "total_online_time": total_time_mins,
        })
        results.append(UserAdminResponse(**user_dict))
    
    return results

@router.post("/users/action")
def user_action(request: UserActionRequest, db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if request.action == "deactivate":
        user.is_active = False
    elif request.action == "activate":
        user.is_active = True
    elif request.action == "delete":
        db.delete(user)
    elif request.action == "reset_password":
        if not request.value:
            raise HTTPException(status_code=400, detail="New password required")
        user.hashed_password = hash_password(request.value)
        user.token_version = int(user.token_version or 0) + 1
    elif request.action == "tier":
        if not request.value:
            raise HTTPException(status_code=400, detail="Tier value required")
        user.tier = request.value
    elif request.action == "admin":
        user.is_admin = request.value.lower() == "true" if request.value else True
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
        
    db.commit()
    return {"message": "Action completed successfully"}

# --- Invitations ---
@router.post("/invitations", response_model=UserInvitationResponse)
def create_invitation(invite_data: UserInvitationCreate, db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    send_email = invite_data.send_email
    requested_email = invite_data.email.lower().strip() if invite_data.email else None
    target_email = requested_email if send_email else None

    # Targeted invites have existing users and invitations tied to the email address
    existing_invite = None
    if target_email:
        existing_user = db.query(User).filter(func.lower(User.email) == func.lower(target_email)).first()
        if existing_user:
            raise HTTPException(status_code=400, detail="User with this email already exists")

        existing_invite = db.query(UserInvitation).filter(func.lower(UserInvitation.email) == func.lower(target_email), UserInvitation.is_used == False).first()

    expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=7)
    token = secrets.token_urlsafe(32)
    email_value = target_email or build_link_only_email(token)

    if existing_invite:
        existing_invite.token = token
        existing_invite.expires_at = expires_at
        existing_invite.tier = invite_data.tier
        existing_invite.email = email_value
        db.commit()
        db.refresh(existing_invite)
        invite = existing_invite
    else:
        invite = UserInvitation(
            email=email_value,
            token=token,
            invited_by=admin.id,
            tier=invite_data.tier,
            expires_at=expires_at
        )
        db.add(invite)
        db.commit()
        db.refresh(invite)

    # Generate link
    settings = db.query(SystemSettings).first()
    domain = settings.domain_url if settings and settings.domain_url else "http://localhost:8000"
    if not domain.startswith("http"):
        domain = f"http://{domain}"
    
    invitation_link = f"{domain.rstrip('/')}/signup?token={invite.token}"
    
    # Send email only when requested
    if send_email and target_email:
        send_invitation_email(db, target_email, invitation_link)
    
    response = UserInvitationResponse.model_validate(invite)
    response.invitation_link = invitation_link
    response.send_email = send_email
    return response

@router.get("/invitations", response_model=List[UserInvitationResponse])
def get_invitations(db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    invites = db.query(UserInvitation).order_by(desc(UserInvitation.created_at)).all()
    results = []
    
    settings = db.query(SystemSettings).first()
    domain = settings.domain_url if settings and settings.domain_url else "http://localhost:8000"
    if not domain.startswith("http"):
        domain = f"http://{domain}"
        
    for i in invites:
        resp = UserInvitationResponse.model_validate(i)
        resp.send_email = not is_link_only_email(i.email)
        resp.invitation_link = f"{domain.rstrip('/')}/signup?token={i.token}"
        
        # Get accepted user info if invitation was used
        if i.used_by:
            accepted_user = db.query(User).filter(User.id == i.used_by).first()
            if accepted_user:
                resp.accepted_by_email = accepted_user.email
                resp.accepted_by_name = accepted_user.full_name or accepted_user.nickname or "N/A"
        
        results.append(resp)
        
    return results

# --- User Logs ---
@router.get("/logs", response_model=List[UserLogSchema])
def get_user_logs(
    user_id: Optional[int] = None,
    action: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    query = db.query(UserLog)
    if user_id:
        query = query.filter(UserLog.user_id == user_id)
    if action:
        query = query.filter(UserLog.action == action)
        
    logs = query.order_by(desc(UserLog.timestamp)).offset(offset).limit(limit).all()
    return logs

# --- Database Inspection ---
@router.get("/db/tables")
def list_db_tables(admin: User = Depends(get_current_admin_user)):
    """List all available tables in the database"""
    from app.models.db import Base
    return sorted(list(Base.metadata.tables.keys()))

@router.get("/db/table/{table_name}")
def get_table_data(
    table_name: str,
    limit: int = 100,
    offset: int = 0,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin_user)
):
    """Fetch raw data from a specific table"""
    from app.models.db import Base
    from sqlalchemy import text
    
    if table_name not in Base.metadata.tables:
        raise HTTPException(status_code=404, detail="Table not found")
    
    # Use raw SQL to fetch data for any table generically
    query = text(f"SELECT * FROM {table_name} LIMIT :limit OFFSET :offset")
    result = db.execute(query, {"limit": limit, "offset": offset})
    
    # Get column names
    columns = result.keys()
    
    # Convert rows to list of dicts
    data = []
    for row in result:
        row_dict = {}
        for i, col in enumerate(columns):
            val = row[i]
            # Convert datetime and other non-serializable types to string
            if isinstance(val, (datetime.datetime, datetime.date)):
                val = val.isoformat()
            elif isinstance(val, bytes):
                val = f"<binary data: {len(val)} bytes>"
            row_dict[col] = val
        data.append(row_dict)
        
    return {
        "table": table_name,
        "columns": list(columns),
        "data": data,
        "count": len(data)
    }


# --- HTTP Status Codes Diagnostics ---
@router.get("/http-status-codes")
def get_http_status_codes(admin: User = Depends(get_current_admin_user)):
    """Get a list of common HTTP status codes for the diagnostics page"""
    status_codes = {
        "1xx Informational": [
            {"code": 100, "text": "Continue", "description": "Request received, proceeding with upload"},
            {"code": 101, "text": "Switching Protocols", "description": "Switching to a different protocol"},
        ],
        "2xx Success": [
            {"code": 200, "text": "OK", "description": "Request succeeded"},
            {"code": 201, "text": "Created", "description": "Resource created successfully"},
            {"code": 202, "text": "Accepted", "description": "Request accepted for processing"},
            {"code": 204, "text": "No Content", "description": "Request succeeded with no content"},
        ],
        "3xx Redirection": [
            {"code": 300, "text": "Multiple Choices", "description": "Multiple options for the requested resource"},
            {"code": 301, "text": "Moved Permanently", "description": "Resource permanently moved"},
            {"code": 302, "text": "Found", "description": "Resource temporarily moved"},
            {"code": 304, "text": "Not Modified", "description": "Cached resource is still valid"},
        ],
        "4xx Client Error": [
            {"code": 400, "text": "Bad Request", "description": "Invalid request syntax"},
            {"code": 401, "text": "Unauthorized", "description": "Authentication required"},
            {"code": 403, "text": "Forbidden", "description": "Access denied"},
            {"code": 404, "text": "Not Found", "description": "Resource not found"},
            {"code": 409, "text": "Conflict", "description": "Request conflicts with current state"},
            {"code": 429, "text": "Too Many Requests", "description": "Rate limit exceeded"},
        ],
        "5xx Server Error": [
            {"code": 500, "text": "Internal Server Error", "description": "Server encountered an error"},
            {"code": 501, "text": "Not Implemented", "description": "Server doesn't support the functionality"},
            {"code": 502, "text": "Bad Gateway", "description": "Invalid response from upstream server"},
            {"code": 503, "text": "Service Unavailable", "description": "Server temporarily unavailable"},
        ],
    }
    return status_codes

