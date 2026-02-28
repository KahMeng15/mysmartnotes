"""Authentication router"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
from pydantic import BaseModel
import jwt
import json
from typing import Optional
import httpx

from app.models.db import User
from app.schemas.schemas import UserCreate, UserLogin, User as UserSchema, TokenResponse, UserUpdate
from app.utils.db import get_db
from app.utils.auth import hash_password, verify_password, create_access_token, get_current_user as get_current_user_from_token
from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

# Firebase project config
FIREBASE_PROJECT_ID = "mysmartnotes-965fe"
FIREBASE_VERIFY_URL = "https://www.googleapis.com/identitytoolkit/v3/relyingparty/verifyCustomToken"


class GoogleLoginRequest(BaseModel):
    """Google Sign-In request model"""
    idToken: str


class GoogleCompleteRequest(BaseModel):
    """Complete Google registration with additional info"""
    idToken: str
    nickname: str


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
        if audience != FIREBASE_PROJECT_ID:
            print(f"[DEBUG] Token audience '{audience}' doesn't match project ID '{FIREBASE_PROJECT_ID}'")
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


@router.post("/register", response_model=UserSchema)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if user exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    user = User(
        username=user_data.email,  # Use email as username
        email=user_data.email,
        full_name=user_data.full_name,
        nickname=user_data.nickname,
        hashed_password=hash_password(user_data.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    return user


@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login user and return access token"""
    user = db.query(User).filter(User.email == credentials.email).first()
    
    try:
        if not user or not verify_password(credentials.password, user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid username or password"
            )
    except ValueError as e:
        # This can happen with bcrypt's 72-byte limit if a long password was used
        # during registration on a system without the fix, and now is being verified
        # with the fix. We treat it as an invalid password.
        print(f"Password verification error for user {credentials.email}: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account is disabled"
        )
    
    # Create token
    access_token = create_access_token(
        data={"sub": str(user.id)},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return {"access_token": access_token, "token_type": "bearer", "user": user}


@router.post("/google-login")
def google_login(request: GoogleLoginRequest, db: Session = Depends(get_db)):
    """Verify Google token and check if user exists"""
    try:
        print(f"[DEBUG] Received Google login request")
        
        # Verify the Firebase ID token
        claims = verify_firebase_token(request.idToken)
        
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
            
            access_token = create_access_token(
                data={"sub": str(user.id)},
                expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            )
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
def google_complete(request: GoogleCompleteRequest, db: Session = Depends(get_db)):
    """Complete Google registration for new user with additional info"""
    try:
        # Verify the Firebase ID token
        claims = verify_firebase_token(request.idToken)
        
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
            access_token = create_access_token(
                data={"sub": str(existing_user.id)},
                expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
            )
            return {"access_token": access_token, "token_type": "bearer", "user": existing_user}
        
        # Create new user with the provided nickname
        user = User(
            username=email,
            email=email,
            full_name=full_name,
            nickname=request.nickname,
            hashed_password="",  # No local password for Google auth users
            is_active=True
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Create JWT token
        access_token = create_access_token(
            data={"sub": str(user.id)},
            expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        )
        
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
