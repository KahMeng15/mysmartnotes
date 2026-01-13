# 🔒 Security Guide

Comprehensive security practices and configurations for MySmartNotes.

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [API Security](#api-security)
3. [Data Protection](#data-protection)
4. [Network Security](#network-security)
5. [Secrets Management](#secrets-management)
6. [Security Monitoring](#security-monitoring)
7. [Compliance](#compliance)

---

## Authentication & Authorization

### JWT Implementation

**Token Structure:**

```python
# services/api_gateway/auth/jwt_manager.py
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class JWTManager:
    def __init__(self, secret_key: str, algorithm: str = "HS256"):
        self.secret_key = secret_key
        self.algorithm = algorithm
    
    def create_access_token(self, data: dict, expires_delta: timedelta = None):
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=15)
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "access"
        })
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
    
    def create_refresh_token(self, data: dict):
        to_encode = data.copy()
        expire = datetime.utcnow() + timedelta(days=7)
        to_encode.update({
            "exp": expire,
            "iat": datetime.utcnow(),
            "type": "refresh"
        })
        return jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
    
    def verify_token(self, token: str) -> dict:
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return payload
        except JWTError:
            return None
    
    def hash_password(self, password: str) -> str:
        return pwd_context.hash(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return pwd_context.verify(plain_password, hashed_password)
```

**Authentication Endpoints:**

```python
# services/api_gateway/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

router = APIRouter()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

@router.post("/register")
async def register(
    username: str,
    email: str,
    password: str,
    db: Session = Depends(get_db)
):
    # Check if user exists
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    hashed_password = jwt_manager.hash_password(password)
    user = User(
        username=username,
        email=email,
        password_hash=hashed_password
    )
    db.add(user)
    db.commit()
    
    return {"message": "User created successfully"}

@router.post("/token")
async def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    # Verify credentials
    user = db.query(User).filter(User.email == form_data.username).first()
    if not user or not jwt_manager.verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    # Generate tokens
    access_token = jwt_manager.create_access_token(data={"sub": user.id})
    refresh_token = jwt_manager.create_refresh_token(data={"sub": user.id})
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }

@router.post("/refresh")
async def refresh_token(refresh_token: str):
    payload = jwt_manager.verify_token(refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    
    new_access_token = jwt_manager.create_access_token(data={"sub": payload["sub"]})
    return {"access_token": new_access_token, "token_type": "bearer"}

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    payload = jwt_manager.verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user
```

### Role-Based Access Control (RBAC)

```python
# models/user.py
from enum import Enum

class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"
    GUEST = "guest"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True)
    role = Column(Enum(UserRole), default=UserRole.USER)
    is_active = Column(Boolean, default=True)

# Dependency for role checking
def require_role(required_role: UserRole):
    def role_checker(current_user: User = Depends(get_current_user)):
        if current_user.role != required_role and current_user.role != UserRole.ADMIN:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return role_checker

# Usage in routes
@router.delete("/lectures/{lecture_id}")
async def delete_lecture(
    lecture_id: int,
    current_user: User = Depends(require_role(UserRole.ADMIN))
):
    # Only admins can delete
    pass
```

### Session Management

```python
# Store refresh tokens in database
class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    token_hash = Column(String, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)
    revoked = Column(Boolean, default=False)
    
    user = relationship("User", back_populates="refresh_tokens")

# Revoke token on logout
@router.post("/logout")
async def logout(refresh_token: str, db: Session = Depends(get_db)):
    token_hash = hashlib.sha256(refresh_token.encode()).hexdigest()
    db.query(RefreshToken).filter(
        RefreshToken.token_hash == token_hash
    ).update({"revoked": True})
    db.commit()
    return {"message": "Logged out successfully"}
```

---

## API Security

### Rate Limiting

**Redis-based rate limiting:**

```python
# services/api_gateway/middleware/rate_limit.py
from fastapi import Request, HTTPException
from redis import Redis
import time

class RateLimiter:
    def __init__(self, redis_client: Redis):
        self.redis = redis_client
    
    def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> bool:
        current = time.time()
        window_start = current - window_seconds
        
        # Remove old entries
        self.redis.zremrangebyscore(key, 0, window_start)
        
        # Count requests in window
        request_count = self.redis.zcard(key)
        
        if request_count >= max_requests:
            return False
        
        # Add current request
        self.redis.zadd(key, {str(current): current})
        self.redis.expire(key, window_seconds)
        
        return True

# Middleware
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    # Get user identifier
    user_id = getattr(request.state, "user_id", request.client.host)
    
    # Check rate limit
    key = f"rate_limit:{user_id}"
    if not rate_limiter.check_rate_limit(key, max_requests=60, window_seconds=60):
        raise HTTPException(status_code=429, detail="Too many requests")
    
    return await call_next(request)
```

### CORS Configuration

```python
# services/api_gateway/main.py
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://yourdomain.com",
        "https://www.yourdomain.com",
        "https://app.yourdomain.com"
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=3600
)
```

### Input Validation

```python
# schemas/validation.py
from pydantic import BaseModel, validator, EmailStr, Field
import re

class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)
    
    @validator('username')
    def username_alphanumeric(cls, v):
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username must be alphanumeric')
        return v
    
    @validator('password')
    def password_strength(cls, v):
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain digit')
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', v):
            raise ValueError('Password must contain special character')
        return v

class LectureUpload(BaseModel):
    subject_id: int
    title: str = Field(..., min_length=1, max_length=200)
    
    @validator('title')
    def sanitize_title(cls, v):
        # Remove potentially dangerous characters
        return re.sub(r'[<>&"\']', '', v)
```

### SQL Injection Prevention

**Always use SQLAlchemy ORM or parameterized queries:**

```python
# ✅ SAFE - Using ORM
lectures = db.query(Lecture).filter(Lecture.user_id == user_id).all()

# ✅ SAFE - Parameterized query
result = db.execute(
    text("SELECT * FROM lectures WHERE user_id = :user_id"),
    {"user_id": user_id}
)

# ❌ UNSAFE - String concatenation
# NEVER DO THIS
query = f"SELECT * FROM lectures WHERE user_id = {user_id}"
```

### File Upload Security

```python
# services/api_gateway/utils/file_validator.py
import magic
from pathlib import Path

ALLOWED_EXTENSIONS = {'.pdf', '.pptx', '.ppt'}
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

def validate_file(file_path: str) -> bool:
    path = Path(file_path)
    
    # Check extension
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Invalid file extension: {path.suffix}")
    
    # Check file size
    if path.stat().st_size > MAX_FILE_SIZE:
        raise ValueError(f"File too large: {path.stat().st_size} bytes")
    
    # Check MIME type
    mime = magic.Magic(mime=True)
    file_type = mime.from_file(file_path)
    
    allowed_mimes = {
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-powerpoint'
    }
    
    if file_type not in allowed_mimes:
        raise ValueError(f"Invalid file type: {file_type}")
    
    return True

# Upload endpoint
@router.post("/lectures/upload")
async def upload_lecture(
    file: UploadFile,
    subject_id: int,
    current_user: User = Depends(get_current_user)
):
    # Save temporarily
    temp_path = f"/tmp/{uuid.uuid4()}_{file.filename}"
    with open(temp_path, "wb") as f:
        f.write(await file.read())
    
    try:
        # Validate file
        validate_file(temp_path)
        
        # Move to uploads directory
        final_path = f"/data/uploads/{current_user.id}/{uuid.uuid4()}{Path(file.filename).suffix}"
        os.makedirs(os.path.dirname(final_path), exist_ok=True)
        shutil.move(temp_path, final_path)
        
        return {"path": final_path}
    except Exception as e:
        os.remove(temp_path)
        raise HTTPException(status_code=400, detail=str(e))
```

---

## Data Protection

### Encryption at Rest

**Database encryption:**

```yaml
# docker-compose.yml
services:
  postgres:
    environment:
      - POSTGRES_INITDB_ARGS="--data-checksums"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    
volumes:
  postgres_data:
    driver: local
    driver_opts:
      type: none
      device: /encrypted_volume/postgres_data
      o: bind
```

**Encrypt sensitive fields:**

```python
# models/user.py
from cryptography.fernet import Fernet

class User(Base):
    __tablename__ = "users"
    
    email_encrypted = Column(LargeBinary)
    
    @property
    def email(self):
        cipher = Fernet(os.getenv("ENCRYPTION_KEY"))
        return cipher.decrypt(self.email_encrypted).decode()
    
    @email.setter
    def email(self, value):
        cipher = Fernet(os.getenv("ENCRYPTION_KEY"))
        self.email_encrypted = cipher.encrypt(value.encode())
```

### Encryption in Transit

**Force HTTPS:**

```nginx
# nginx.conf
server {
    listen 80;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers 'ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256';
    ssl_prefer_server_ciphers on;
    
    # HSTS
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
```

### Data Anonymization

```python
# For analytics, anonymize user data
def anonymize_email(email: str) -> str:
    return hashlib.sha256(email.encode()).hexdigest()[:16]

# Export user data (GDPR compliance)
@router.get("/user/export")
async def export_user_data(current_user: User = Depends(get_current_user)):
    data = {
        "user": {
            "username": current_user.username,
            "email": current_user.email,
            "created_at": current_user.created_at
        },
        "subjects": [
            {"name": s.name, "created_at": s.created_at}
            for s in current_user.subjects
        ],
        "lectures": [
            {"title": l.title, "uploaded_at": l.uploaded_at}
            for l in current_user.lectures
        ]
    }
    return data

# Delete user data (GDPR right to be forgotten)
@router.delete("/user/account")
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Delete all user data
    db.query(Lecture).filter(Lecture.user_id == current_user.id).delete()
    db.query(Subject).filter(Subject.user_id == current_user.id).delete()
    db.query(User).filter(User.id == current_user.id).delete()
    db.commit()
    
    return {"message": "Account deleted"}
```

---

## Network Security

### Firewall Rules

```bash
# UFW configuration
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable

# Limit SSH connections
sudo ufw limit 22/tcp
```

### Docker Network Isolation

```yaml
# docker-compose.yml
networks:
  frontend_network:
    driver: bridge
  backend_network:
    driver: bridge
    internal: true  # No external access

services:
  nginx:
    networks:
      - frontend_network
  
  api_gateway:
    networks:
      - frontend_network
      - backend_network
  
  postgres:
    networks:
      - backend_network  # Only accessible internally
  
  redis:
    networks:
      - backend_network
```

### VPN Access (Optional)

For admin access to internal services:

```bash
# Install WireGuard
sudo apt install wireguard

# Generate keys
wg genkey | tee privatekey | wg pubkey > publickey

# Configure /etc/wireguard/wg0.conf
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = <server_private_key>

[Peer]
PublicKey = <client_public_key>
AllowedIPs = 10.0.0.2/32
```

---

## Secrets Management

### Environment Variables

```bash
# .env (NEVER commit to git)
JWT_SECRET_KEY=$(openssl rand -base64 64)
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
```

### Docker Secrets (Swarm)

```yaml
# docker-compose.secrets.yml
version: '3.8'

secrets:
  jwt_secret:
    external: true
  postgres_password:
    external: true

services:
  api_gateway:
    secrets:
      - jwt_secret
    environment:
      - JWT_SECRET_KEY_FILE=/run/secrets/jwt_secret
```

```bash
# Create secrets
echo "your_jwt_secret" | docker secret create jwt_secret -
echo "your_postgres_password" | docker secret create postgres_password -
```

### HashiCorp Vault (Production)

```python
# services/api_gateway/utils/vault_client.py
import hvac

class VaultClient:
    def __init__(self, url: str, token: str):
        self.client = hvac.Client(url=url, token=token)
    
    def get_secret(self, path: str) -> dict:
        return self.client.secrets.kv.v2.read_secret_version(path=path)['data']['data']

# Usage
vault = VaultClient(url="http://vault:8200", token=os.getenv("VAULT_TOKEN"))
db_password = vault.get_secret("database/postgres")["password"]
```

---

## Security Monitoring

### Audit Logging

```python
# models/audit_log.py
class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String)
    resource_type = Column(String)
    resource_id = Column(Integer)
    ip_address = Column(String)
    user_agent = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
# Log all sensitive actions
def log_action(user_id: int, action: str, resource_type: str, resource_id: int, request: Request):
    audit_log = AuditLog(
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=request.client.host,
        user_agent=request.headers.get("user-agent")
    )
    db.add(audit_log)
    db.commit()

# Usage in routes
@router.delete("/lectures/{lecture_id}")
async def delete_lecture(
    lecture_id: int,
    request: Request,
    current_user: User = Depends(get_current_user)
):
    log_action(current_user.id, "DELETE", "lecture", lecture_id, request)
    # ... delete logic
```

### Intrusion Detection

```python
# Detect suspicious activity
class SecurityMonitor:
    def __init__(self, redis_client):
        self.redis = redis_client
    
    def check_failed_logins(self, email: str) -> bool:
        key = f"failed_logins:{email}"
        count = self.redis.incr(key)
        self.redis.expire(key, 3600)  # 1 hour
        
        if count >= 5:
            # Alert admin
            self.alert_admin(f"Multiple failed logins for {email}")
            return True
        
        return False
    
    def alert_admin(self, message: str):
        # Send email/Slack notification
        pass
```

### Security Headers

```python
# services/api_gateway/middleware/security_headers.py
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    
    return response
```

---

## Compliance

### GDPR Compliance

**Required features:**
- ✅ User data export
- ✅ Right to be forgotten (account deletion)
- ✅ Consent management
- ✅ Data breach notification procedures

**Privacy Policy endpoint:**

```python
@router.get("/privacy-policy")
async def privacy_policy():
    return {
        "data_collected": ["email", "uploaded files", "usage analytics"],
        "data_usage": ["service provision", "improvement"],
        "data_retention": "Account lifetime + 30 days",
        "user_rights": ["access", "rectification", "erasure", "portability"],
        "contact": "privacy@yourdomain.com"
    }
```

### Security Checklist

**Before Production:**

- [ ] All secrets in environment variables (not hardcoded)
- [ ] HTTPS enabled with valid certificate
- [ ] Strong password requirements enforced
- [ ] JWT tokens with short expiration
- [ ] Rate limiting implemented
- [ ] Input validation on all endpoints
- [ ] SQL injection protection (ORM only)
- [ ] File upload validation
- [ ] CORS properly configured
- [ ] Security headers added
- [ ] Audit logging enabled
- [ ] Database backups automated
- [ ] Firewall rules configured
- [ ] Docker networks isolated
- [ ] Regular security updates scheduled

---

For deployment security, see [DEPLOYMENT.md](DEPLOYMENT.md).  
For monitoring security events, see [MONITORING.md](MONITORING.md).
