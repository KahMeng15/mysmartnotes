from pydantic import BaseModel, EmailStr
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.schemas.schemas import User

class SystemSettingsSchema(BaseModel):
    lockdown_mode: bool
    signup_config: str
    maintenance_mode: bool
    footer_text: Optional[str] = None
    global_ai_provider: str
    global_ai_model: Optional[str] = None
    global_ai_api_key: Optional[str] = None
    global_ai_base_url: Optional[str] = None
    ai_limit_per_user: str

    class Config:
        from_attributes = True


class EmailConfigSchema(BaseModel):
    smtp_provider: Optional[str] = None
    email_address: Optional[str] = None
    sender_name: Optional[str] = None
    app_password: Optional[str] = None

    class Config:
        from_attributes = True


class IPFilterSchema(BaseModel):
    id: int
    filter_type: str
    rule_type: str
    value: str
    created_at: datetime

    class Config:
        from_attributes = True

class IPFilterCreate(BaseModel):
    filter_type: str
    rule_type: str
    value: str

class RateLimitConfigSchema(BaseModel):
    per_user_api: int
    global_api: int
    chat_api: int
    processing_api: int
    sessions: int

    class Config:
        from_attributes = True


class UserLogSchema(BaseModel):
    id: int
    user_id: Optional[int]
    action: str
    ip_address: Optional[str]
    device_info: Optional[str]
    details: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True

class UserAdminResponse(User):
    # Extending User with extra stats
    notes_count: int = 0
    subjects_count: int = 0
    groups_count: int = 0
    conversations_count: int = 0
    questions_count: int = 0
    storage_used: str = "0 MB"
    total_logins: int = 0
    total_online_time: int = 0

class UserActionRequest(BaseModel):
    user_id: int
    action: str  # deactivate, delete, reset_password, tier
    value: Optional[str] = None
