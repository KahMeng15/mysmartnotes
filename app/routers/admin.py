"""Admin Dashboard Router"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
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

router = APIRouter(prefix="/admin", tags=["admin"])

def get_current_admin_user(current_user: User = Depends(get_current_user)):
    """Dependency to check if current user is an admin"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required"
        )
    return current_user

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
            global_ai_api_key=app_settings.GLOBAL_GEMINI_API_KEY or app_settings.GLOBAL_HUGGINGFACE_TOKEN,
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
            settings.global_ai_api_key = app_settings.GLOBAL_GEMINI_API_KEY or app_settings.GLOBAL_HUGGINGFACE_TOKEN
            updated = True
        
        if updated:
            db.commit()
            db.refresh(settings)
            
    return settings

@router.put("/system-settings", response_model=SystemSettingsSchema)
def update_system_settings(update_data: SystemSettingsSchema, db: Session = Depends(get_db), admin: User = Depends(get_current_admin_user)):
    settings = db.query(SystemSettings).first()
    if not settings:
        settings = SystemSettings()
        db.add(settings)
    
    for key, value in update_data.model_dump().items():
        setattr(settings, key, value)
    
    settings.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(settings)
    return settings

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
    tiers = db.query(TierConfig).all()
    
    # Initialize default tiers if they don't exist
    if not tiers:
        default_tiers = [
            TierConfig(
                id="unlimited",
                display_name="Unlimited",
                max_notes=-1,
                max_subjects=-1,
                max_groups=-1,
                max_conversations=-1,
                max_messages=-1,
                max_storage_gb=-1,
                max_quizzes=-1,
                max_summaries=-1
            ),
            TierConfig(
                id="free",
                display_name="Free",
                max_notes=50,
                max_subjects=10,
                max_groups=5,
                max_conversations=100,
                max_messages=500,
                max_storage_gb=5,
                max_quizzes=20,
                max_summaries=50
            ),
            TierConfig(
                id="pro",
                display_name="Pro",
                max_notes=500,
                max_subjects=100,
                max_groups=50,
                max_conversations=-1,
                max_messages=-1,
                max_storage_gb=100,
                max_quizzes=200,
                max_summaries=500
            )
        ]
        for tier in default_tiers:
            db.add(tier)
        db.commit()
        tiers = default_tiers
    
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
    # Check if user already exists
    existing_user = db.query(User).filter(User.email == invite_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User with this email already exists")

    # Check if invitation already exists
    existing_invite = db.query(UserInvitation).filter(UserInvitation.email == invite_data.email, UserInvitation.is_used == False).first()
    if existing_invite:
        # Update existing invite
        existing_invite.token = secrets.token_urlsafe(32)
        existing_invite.expires_at = datetime.datetime.utcnow() + datetime.timedelta(days=7)
        db.commit()
        db.refresh(existing_invite)
        invite = existing_invite
    else:
        invite = UserInvitation(
            email=invite_data.email,
            token=secrets.token_urlsafe(32),
            invited_by=admin.id,
            tier=invite_data.tier,
            expires_at=datetime.datetime.utcnow() + datetime.timedelta(days=7)
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
    
    # Try to send email
    send_invitation_email(db, invite.email, invitation_link)
    
    response = UserInvitationResponse.model_validate(invite)
    response.invitation_link = invitation_link
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
        resp.invitation_link = f"{domain.rstrip('/')}/signup?token={i.token}"
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
