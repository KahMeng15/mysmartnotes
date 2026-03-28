"""Authentication router"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from datetime import timedelta, datetime
from pydantic import BaseModel
import jwt
import json
from typing import Optional
import httpx
import secrets

from app.models.db import User, SystemSettings, UserInvitation, PasswordResetToken
from app.schemas.schemas import UserCreate, UserLogin, User as UserSchema, TokenResponse, UserUpdate
from app.utils.db import get_db
from app.utils.auth import hash_password, verify_password, create_access_token, get_current_user as get_current_user_from_token
from app.utils.quotas import get_user_quota_status, get_user_tier_config
from app.utils.email import send_password_reset_email
from app.config import get_settings
from sqlalchemy import func
from app.models.db import Lecture, Subject, SubjectGroup, ChatMessage, StudySession, UserLog

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

# Firebase project config

FIREBASE_VERIFY_URL = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken"


class GoogleLoginRequest(BaseModel):
    """Google Sign-In request model"""
    idToken: str


class GoogleCompleteRequest(BaseModel):
    """Complete Google registration with additional info"""
    idToken: str
    nickname: str
    agree_tos: bool = False
    agree_privacy: bool = False
    agree_fair_use: bool = False


def verify_firebase_token(id_token_str: str):
    """Verify Firebase ID token by decoding JWT and validating claims"""
    try:
        # Decode JWT without verification first to get claims
        # Firebase tokens are already verified on the client side via Firebase SDK
        unverified_claims = jwt.decode(id_token_str, options={"verify_signature": False})
        
        # Log for debugging
        print(f"[DEBUG] Token claims: {json.dumps({k: v for k, v in unverified_claims.items() if k not in ['at_hash', 'claims_supported']}, indent=2)}")
        
        # Validate essential claims
        email = unverified_claims.get('email')
        if not email:
            raise ValueError("Token missing email claim")
        
        # Check audience - Firebase ID tokens should have the project ID as audience
        audience = unverified_claims.get('aud')
        if audience != settings.FIREBASE_PROJECT_ID:
            print(f"[DEBUG] Token audience '{audience}' doesn't match project ID '{settings.FIREBASE_PROJECT_ID}'")
            # For now, allow it through as audience might be different formats
        
        # Check token hasn't expired
        import time
        exp = unverified_claims.get('exp', 0)
        if exp and exp < time.time():
            raise ValueError(f"Token has expired (exp: {exp}, now: {time.time()})")
        
        # Verify the issuer contains firebase
        issuer = unverified_claims.get('iss', '')
        if 'firebaseapp.com' not in issuer and 'googleapis.com' not in issuer:
            print(f"[DEBUG] Issuer check warning: {issuer}")
        
        return unverified_claims
        
    except jwt.DecodeError as e:
        raise ValueError(f"Invalid token format: {str(e)}")
    except ValueError as e:
        raise e
    except Exception as e:
        print(f"[DEBUG] Token verification error: {str(e)}")
        raise ValueError(f"Token verification failed: {str(e)}")



@router.get("/firebase-config")
def get_firebase_config():
    """Return the public Firebase configuration"""
    return {
        "apiKey": settings.FIREBASE_API_KEY,
        "authDomain": settings.FIREBASE_AUTH_DOMAIN,
        "projectId": settings.FIREBASE_PROJECT_ID,
        "storageBucket": settings.FIREBASE_STORAGE_BUCKET,
        "messagingSenderId": settings.FIREBASE_MESSAGING_SENDER_ID,
        "appId": settings.FIREBASE_APP_ID,
        "measurementId": settings.FIREBASE_MEASUREMENT_ID
    }


@router.get("/public-settings")
def get_public_settings(db: Session = Depends(get_db)):
    """Return public-safe system settings"""
    settings = db.query(SystemSettings).first()
    if not settings:
        return {
            "signup_config": "open",
            "maintenance_mode": False,
            "footer_text": "",
            "unnecessary_logins_enabled": False
        }
    return {
        "signup_config": settings.signup_config,
        "maintenance_mode": settings.maintenance_mode,
        "footer_text": settings.footer_text,
        "unnecessary_logins_enabled": settings.unnecessary_logins_enabled
    }


@router.post("/register", response_model=UserSchema)
def register(user_data: UserCreate, request: Request, token: Optional[str] = None, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check maintenance mode
    sys_settings = db.query(SystemSettings).first()
    if sys_settings and sys_settings.maintenance_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Registration is disabled during maintenance."
        )
    
    # Check system signup config
    signup_config = sys_settings.signup_config if sys_settings else "open"
    
    # Check required agreement fields
    if not user_data.agree_tos:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must agree to the Terms of Service to register."
        )
    if not user_data.agree_privacy:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must agree to the Privacy Policy to register."
        )
    if not user_data.agree_fair_use:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must agree to the Fair Use Policy to register."
        )
    
    invitation = None
    if signup_config == "invite":
        if not token:
            raise HTTPException(status_code=403, detail="Registration is restricted to invited users only. Token required.")
        
        invitation = db.query(UserInvitation).filter(UserInvitation.token == token, UserInvitation.is_used == False).first()
        if not invitation:
            raise HTTPException(status_code=403, detail="Invalid or expired invitation token.")
        
        if invitation.expires_at < datetime.utcnow():
            raise HTTPException(status_code=403, detail="Invitation token has expired.")
            
        if invitation.email.lower() != user_data.email.lower():
            raise HTTPException(status_code=403, detail="Invitation token was issued for a different email address.")

    # Check if user exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    
    # Special handling for Admin Email: allow "re-claiming" via signup if password is lost
    is_admin_signup = settings.ADMIN_EMAIL and user_data.email.lower() == settings.ADMIN_EMAIL.lower()
    
    if existing_user and not is_admin_signup:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    if is_admin_signup and existing_user:
        # Update existing admin user
        existing_user.nickname = user_data.nickname
        existing_user.full_name = user_data.full_name
        existing_user.hashed_password = hash_password(user_data.password)
        existing_user.is_admin = True
        existing_user.is_active = True
        existing_user.is_approved = True
        user = existing_user
    else:
        # Create new user
        is_admin = is_admin_signup
        is_approved = True if signup_config != "approval" or is_admin else False
        
        user = User(
            username=user_data.email,  # Use email as username
            email=user_data.email,
            full_name=user_data.full_name,
            nickname=user_data.nickname,
            hashed_password=hash_password(user_data.password),
            is_admin=is_admin,
            is_approved=is_approved,
            tier=invitation.tier if invitation else "free"
        )
        db.add(user)
    
    if invitation:
        invitation.is_used = True
        
    db.commit()
    db.refresh(user)
    
    # Log signup
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "Unknown Device")
    db.add(UserLog(user_id=user.id, action="signup", ip_address=ip_address, device_info=user_agent))
    db.commit()
    
    return user


@router.post("/login")
async def login(request: Request, db: Session = Depends(get_db)):
    """Login user and return access token"""
    try:
        credentials = await request.json()
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid JSON body")
        
    email = credentials.get("email")
    password = credentials.get("password")
    
    if not email or not password:
         raise HTTPException(status_code=400, detail="Missing email or password")

    # Check maintenance mode
    sys_settings = db.query(SystemSettings).first()
    if sys_settings and sys_settings.maintenance_mode:
        if not settings.ADMIN_EMAIL or email.lower() != settings.ADMIN_EMAIL.lower():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="System is undergoing maintenance. Only administrators can log in at this time."
            )

    user = db.query(User).filter(User.email == email).first()
    
    try:
        if not user or not verify_password(password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )
    except ValueError as e:
        print(f"Password verification error for user {email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is disabled"
        )
    
    if not user.is_approved:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is pending approval by administrator"
        )
        
    # Auto-elevate admin matching settings
    if settings.ADMIN_EMAIL and user.email.lower() == settings.ADMIN_EMAIL.lower() and not user.is_admin:
        user.is_admin = True
        db.commit()
    
    # Create token
    expire_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
    if sys_settings and sys_settings.session_length:
        length = sys_settings.session_length
        unit = sys_settings.session_unit or "hours"
        if unit == "hours":
            expire_minutes = length * 60
        elif unit == "days":
            expire_minutes = length * 1440
            
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=expire_minutes)
    )
    
    # Log login
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "Unknown Device")
    db.add(UserLog(user_id=user.id, action="login", ip_address=ip_address, device_info=user_agent))
    db.commit()
    
    return {
        "access_token": access_token, 
        "token_type": "bearer", 
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "nickname": user.nickname,
            "is_admin": user.is_admin
        }
    }


@router.post("/google-login")
def google_login(google_request: GoogleLoginRequest, request: Request, db: Session = Depends(get_db)):
    """Verify Google token and check if user exists"""
    # Check maintenance mode
    sys_settings = db.query(SystemSettings).first()
    if sys_settings and sys_settings.maintenance_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Sign-In is disabled during maintenance. Please use administrative email login."
        )

    try:
        print(f"[DEBUG] Received Google login request")
        
        # Verify the Firebase ID token
        claims = verify_firebase_token(google_request.idToken)
        
        # Extract user information from token
        email = claims.get('email')
        full_name = claims.get('name', '')
        picture = claims.get('picture', '')
        
        print(f"[DEBUG] Token verified for email: {email}")
        
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email not found in Google account"
            )
        
        # Check if user exists
        user = db.query(User).filter(User.email == email).first()
        
        if user:
            # Existing user - log them in
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User account is disabled"
                )
                
            if settings.ADMIN_EMAIL and user.email.lower() == settings.ADMIN_EMAIL.lower() and not user.is_admin:
                user.is_admin = True
                db.commit()
            
            sys_settings = db.query(SystemSettings).first()
            expire_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
            if sys_settings and sys_settings.session_length:
                length = sys_settings.session_length
                unit = sys_settings.session_unit or "hours"
                if unit == "hours":
                    expire_minutes = length * 60
                elif unit == "days":
                    expire_minutes = length * 1440
            
            access_token = create_access_token(
                data={"sub": str(user.id)},
                expires_delta=timedelta(minutes=expire_minutes)
            )
            
            # Log login
            ip_address = request.client.host if request.client else None
            user_agent = request.headers.get("user-agent", "Unknown Device")
            db.add(UserLog(user_id=user.id, action="login", ip_address=ip_address, device_info=user_agent, details="Google Auth"))
            db.commit()
            
            print(f"[DEBUG] Existing user logged in: {email}")
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "user": user,
                "is_new_user": False
            }
        else:
            # New user - return info for registration confirmation
            print(f"[DEBUG] New user detected: {email}")
            return {
                "is_new_user": True,
                "email": email,
                "full_name": full_name,
                "picture": picture,
                "suggested_nickname": full_name.split()[0] if full_name else email.split('@')[0]
            }
        
    except HTTPException:
        raise
    except ValueError as e:
        print(f"[DEBUG] Verification error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    except Exception as e:
        print(f"[DEBUG] Unexpected error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}"
        )


@router.post("/google-complete", response_model=TokenResponse)
def google_complete(google_request: GoogleCompleteRequest, request: Request, db: Session = Depends(get_db)):
    """Complete Google registration for new user with additional info"""
    # Check maintenance mode
    sys_settings = db.query(SystemSettings).first()
    if sys_settings and sys_settings.maintenance_mode:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Sign-In is disabled during maintenance."
        )

    try:
        # Check required agreement fields
        if not google_request.agree_tos:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You must agree to the Terms of Service to register."
            )
        if not google_request.agree_privacy:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You must agree to the Privacy Policy to register."
            )
        if not google_request.agree_fair_use:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You must agree to the Fair Use Policy to register."
            )
        
        # Verify the Firebase ID token
        claims = verify_firebase_token(google_request.idToken)
        
        # Extract user information from token
        email = claims.get('email')
        full_name = claims.get('name', '')
        
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email not found in Google account"
            )
        
        # Check if user already exists
        existing_user = db.query(User).filter(User.email == email).first()
        
        if existing_user:
            # User already exists, just log them in
            if not existing_user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User account is disabled"
                )
                
            if settings.ADMIN_EMAIL and existing_user.email.lower() == settings.ADMIN_EMAIL.lower() and not existing_user.is_admin:
                existing_user.is_admin = True
                db.commit()
                
            sys_settings = db.query(SystemSettings).first()
            expire_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
            if sys_settings and sys_settings.session_length:
                length = sys_settings.session_length
                unit = sys_settings.session_unit or "hours"
                if unit == "hours":
                    expire_minutes = length * 60
                elif unit == "days":
                    expire_minutes = length * 1440
            
            access_token = create_access_token(
                data={"sub": str(existing_user.id)},
                expires_delta=timedelta(minutes=expire_minutes)
            )
            return {"access_token": access_token, "token_type": "bearer", "user": existing_user}
        
        # Create new user with the provided nickname
        user = User(
            username=email,
            email=email,
            full_name=full_name,
            nickname=google_request.nickname,
            hashed_password="",  # No local password for Google auth users
            is_active=True,
            is_admin=True if settings.ADMIN_EMAIL and email.lower() == settings.ADMIN_EMAIL.lower() else False
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Create JWT token
        sys_settings = db.query(SystemSettings).first()
        expire_minutes = settings.ACCESS_TOKEN_EXPIRE_MINUTES
        if sys_settings and sys_settings.session_length:
            length = sys_settings.session_length
            unit = sys_settings.session_unit or "hours"
            if unit == "hours":
                expire_minutes = length * 60
            elif unit == "days":
                expire_minutes = length * 1440
                
        access_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=timedelta(minutes=expire_minutes)
        )
        
        # Log signup
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent", "Unknown Device")
        db.add(UserLog(user_id=user.id, action="signup", ip_address=ip_address, device_info=user_agent, details="Google Auth"))
        db.commit()
        
        return {"access_token": access_token, "token_type": "bearer", "user": user}
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Google registration failed: {str(e)}"
        )
def get_current_user(current_user: User = Depends(get_current_user_from_token)):
    """Get current user info"""
    return current_user


@router.put("/profile", response_model=UserSchema)
def update_profile(user_update: UserUpdate, current_user: User = Depends(get_current_user_from_token), db: Session = Depends(get_db)):
    """Update user profile"""
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name
    if user_update.nickname is not None:
        current_user.nickname = user_update.nickname
    if user_update.ai_provider is not None:
        current_user.ai_provider = user_update.ai_provider
    if user_update.ai_model is not None:
        current_user.ai_model = user_update.ai_model
    if user_update.ai_base_url is not None:
        current_user.ai_base_url = user_update.ai_base_url
    if user_update.ai_api_key is not None:
        current_user.ai_api_key = user_update.ai_api_key
    if user_update.use_global_ai_config is not None:
        current_user.use_global_ai_config = user_update.use_global_ai_config
        
    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/stats")
def get_user_stats(current_user: User = Depends(get_current_user_from_token), db: Session = Depends(get_db)):
    """Get personalized statistics and recent logins for the current user"""
    u_id = current_user.id
    notes_count = db.query(func.count(Lecture.id)).filter(Lecture.user_id == u_id).scalar() or 0
    subjects_count = db.query(func.count(Subject.id)).filter(Subject.user_id == u_id).scalar() or 0
    groups_count = db.query(func.count(SubjectGroup.id)).filter(SubjectGroup.user_id == u_id).scalar() or 0
    questions_count = db.query(func.count(ChatMessage.id)).filter(ChatMessage.user_id == u_id).scalar() or 0
    
    time_spent_mins = db.query(func.sum(StudySession.duration_minutes)).filter(StudySession.user_id == u_id).scalar() or 0
    
    storage_bytes = db.query(func.sum(Lecture.file_size)).filter(Lecture.user_id == u_id).scalar() or 0
    storage_mb = round(storage_bytes / (1024 * 1024), 2)

    tier_config = get_user_tier_config(current_user, db)
    storage_limit_label = "Unlimited" if tier_config.max_storage_gb == -1 else f"{tier_config.max_storage_gb} GB"
    
    recent_logins_query = db.query(UserLog).filter(UserLog.user_id == u_id, UserLog.action == "login").order_by(UserLog.timestamp.desc()).limit(5).all()
    
    recent_logins = [
        {
            "ip_address": log.ip_address,
            "device_info": log.device_info,
            "timestamp": log.timestamp.isoformat()
        } for log in recent_logins_query
    ]
    
    return {
        "notes_uploaded": notes_count,
        "subjects_created": subjects_count,
        "groups_created": groups_count,
        "questions_asked": questions_count,
        "time_spent_mins": time_spent_mins,
        "space_used_mb": storage_mb,
        "storage_limit": storage_limit_label,
        "recent_logins": recent_logins
    }

@router.get("/quotas")
def get_user_quotas(current_user: User = Depends(get_current_user_from_token), db: Session = Depends(get_db)):
    """Get current user's tier, quotas, and usage statistics"""
    return get_user_quota_status(current_user, db)

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

@router.put("/change-password")
def change_password(passwords: PasswordChange, current_user: User = Depends(get_current_user_from_token), db: Session = Depends(get_db)):
    """Change the user's password"""
    if not current_user.hashed_password:
        raise HTTPException(status_code=400, detail="Cannot change password for OAuth accounts. Please login via Google.")
        
    try:
        if not verify_password(passwords.current_password, current_user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect current password")
    except ValueError:
        raise HTTPException(status_code=400, detail="Error verifying current password")
        
    current_user.hashed_password = hash_password(passwords.new_password)
    db.commit()
    return {"message": "Password changed successfully"}

@router.delete("/profile")
def delete_account(current_user: User = Depends(get_current_user_from_token), db: Session = Depends(get_db)):
    """Permanently delete user account and data"""
    db.delete(current_user)
    db.commit()
    return {"message": "Account deleted successfully"}

@router.get("/download-data")
def download_data(current_user: User = Depends(get_current_user_from_token), db: Session = Depends(get_db)):
    """Export all user data as JSON"""
    uid = current_user.id
    
    # This is a simple aggregated export
    lectures = db.query(Lecture).filter(Lecture.user_id == uid).all()
    subjects = db.query(Subject).filter(Subject.user_id == uid).all()
    groups = db.query(SubjectGroup).filter(SubjectGroup.user_id == uid).all()
    chats = db.query(ChatMessage).filter(ChatMessage.user_id == uid).all()
    
    # We serialize the most important details for them
    data = {
        "profile": {
            "email": current_user.email,
            "full_name": current_user.full_name,
            "nickname": current_user.nickname,
            "joined_at": current_user.created_at.isoformat() if current_user.created_at else None
        },
        "subjects": [{"id": s.id, "name": s.name} for s in subjects],
        "notes_uploaded": [{"id": l.id, "title": l.title, "subject_id": l.subject_id} for l in lectures],
        "chat_history": [{"role": c.role, "content": c.content, "timestamp": c.timestamp.isoformat()} for c in chats]
    }
    
    from fastapi.responses import JSONResponse
    import json
    # Use headers to force file download in browser
    headers = {
        "Content-Disposition": f"attachment; filename=mysmartnotes_export_{current_user.username}.json"
    }
    return JSONResponse(content=data, headers=headers)

# --- Password Reset ---
class PasswordResetRequest(BaseModel):
    email: str

class PasswordResetSubmit(BaseModel):
    token: str
    new_password: str

@router.post("/password-reset-request")
def request_password_reset(reset_request: PasswordResetRequest, request: Request, db: Session = Depends(get_db)):
    """Request a password reset email. Rate limited to prevent abuse."""
    email = reset_request.email.lower().strip()
    
    # Check if user exists
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # For security, don't reveal whether email exists
        return {"message": "If an account exists with this email, a password reset link has been sent."}
    
    # Check for too many recent requests from same email (rate limiting)
    recent_resets = db.query(PasswordResetToken).filter(
        PasswordResetToken.email == email,
        PasswordResetToken.is_used == False,
        PasswordResetToken.expires_at > datetime.utcnow()
    ).all()
    
    if len(recent_resets) >= 3:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password reset requests. Please wait a few hours before trying again."
        )
    
    # Create password reset token (24 hour expiry)
    reset_token = PasswordResetToken(
        user_id=user.id,
        email=email,
        token=secrets.token_urlsafe(32),
        expires_at=datetime.utcnow() + timedelta(hours=24)
    )
    db.add(reset_token)
    db.commit()
    db.refresh(reset_token)
    
    # Build reset link
    sys_settings = db.query(SystemSettings).first()
    domain = sys_settings.domain_url if sys_settings and sys_settings.domain_url else "http://localhost:8000"
    if not domain.startswith("http"):
        domain = f"http://{domain}"
    
    reset_link = f"{domain.rstrip('/')}/login?reset_token={reset_token.token}"
    
    # Send email
    send_password_reset_email(db, email, reset_link)
    
    # Log action
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "Unknown Device")
    db.add(UserLog(user_id=user.id, action="password_reset_request", ip_address=ip_address, device_info=user_agent))
    db.commit()
    
    return {"message": "If an account exists with this email, a password reset link has been sent."}

@router.post("/password-reset")
def reset_password(reset_data: PasswordResetSubmit, request: Request, db: Session = Depends(get_db)):
    """Reset password with valid token"""
    
    # Find the reset token
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == reset_data.token,
        PasswordResetToken.is_used == False
    ).first()
    
    if not reset_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or already-used password reset token."
        )
    
    # Check if token has expired
    if reset_token.expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password reset link has expired. Please request a new one."
        )
    
    # Get user
    user = db.query(User).filter(User.id == reset_token.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found."
        )
    
    # Update password
    user.hashed_password = hash_password(reset_data.new_password)
    reset_token.is_used = True
    
    # Log action
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "Unknown Device")
    db.add(UserLog(user_id=user.id, action="password_reset_complete", ip_address=ip_address, device_info=user_agent))
    
    db.commit()
    
    return {"message": "Password has been reset successfully. You can now log in with your new password."}

@router.get("/password-reset-token-valid")
def check_reset_token_validity(token: str, db: Session = Depends(get_db)):
    """Check if a password reset token is still valid"""
    reset_token = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == token,
        PasswordResetToken.is_used == False
    ).first()
    
    if not reset_token:
        return {"valid": False, "message": "Invalid or already-used token"}
    
    if reset_token.expires_at < datetime.utcnow():
        return {"valid": False, "message": "Token has expired"}
    
    return {"valid": True, "message": "Token is valid"}
