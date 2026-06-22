from pydantic import BaseModel, EmailStr, model_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from app.schemas.schemas import User

class SystemSettingsSchema(BaseModel):
    lockdown_mode: bool
    signup_config: str
    maintenance_mode: bool
    footer_text: Optional[str] = None
    domain_url: Optional[str] = None
    global_ai_provider: str
    global_ai_model: Optional[str] = None
    global_ai_base_url: Optional[str] = None
    ai_limit_per_user: str
    session_length: int = 24
    session_unit: str = "hours"
    session_reset_on_activity: bool = True
    max_exercise_questions: int = 500
    unnecessary_logins_enabled: bool = False

    class Config:
        from_attributes = True

class GlobalPromptBase(BaseModel):
    name: str
    content: str
    icon: Optional[str] = "IconFileText"

class GlobalPromptCreate(GlobalPromptBase):
    pass

class GlobalPromptUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    icon: Optional[str] = None

class GlobalPromptSchema(GlobalPromptBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class UserInvitationCreate(BaseModel):
    email: Optional[EmailStr] = None
    tier: str = "free"
    send_email: bool = True

    @model_validator(mode="after")
    def ensure_email_when_sending(cls, values):
        if values.send_email and not values.email:
            raise ValueError("Email is required when sending an invitation email.")
        return values

class UserInvitationResponse(BaseModel):
    id: int
    email: str
    token: str
    invited_by: int
    tier: str
    is_used: bool
    used_by: Optional[int] = None
    accepted_by_email: Optional[str] = None
    accepted_by_name: Optional[str] = None
    expires_at: datetime
    created_at: datetime
    send_email: bool = False
    invitation_link: Optional[str] = None

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
    concurrent_tasks_per_user: int
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
    # Overriding fields to plain str to allow viewing users with invalid data formats in admin
    username: Optional[str] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    nickname: Optional[str] = None
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


class TierConfigSchema(BaseModel):
    id: str  # unlimited, free, pro
    display_name: str
    max_notes: int = -1
    max_subjects: int = -1
    max_groups: int = -1
    max_conversations: int = -1
    max_messages: int = -1
    max_storage_gb: int = -1
    max_exercises: int = -1
    max_summaries: int = -1
    # Reset periods: "week", "month", or None for cumulative
    conversations_reset_period: Optional[str] = None
    messages_reset_period: Optional[str] = None
    summaries_reset_period: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
