"""Authentication router"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta

from app.models.db import User
from app.schemas.schemas import UserCreate, UserLogin, User as UserSchema, TokenResponse, UserUpdate
from app.utils.db import get_db
from app.utils.auth import hash_password, verify_password, create_access_token, get_current_user as get_current_user_from_token
from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


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


@router.get("/me", response_model=UserSchema)
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
