"""
Comprehensive tests for the invitation feature.
Tests both email-based and link-only invitations.
"""

import pytest
import datetime
import json
from datetime import timedelta
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient as FastAPITestClient

from main import app
from app.models.db import User, UserInvitation
from app.utils.db import SessionLocal, init_db
from app.utils.auth import hash_password, create_access_token
from app.utils.invitation_utils import is_link_only_email, build_link_only_email


@pytest.fixture(scope="session")
def db():
    """Initialize database for tests"""
    init_db()
    return SessionLocal()


@pytest.fixture(scope="function")
def client():
    """Create a FastAPI test client - work around version incompatibility if needed."""
    try:
        # Standard approach first
        return FastAPITestClient(app)
    except TypeError as e:
        # If there's a version issue with httpx/starlette, try a workaround
        if "Client.__init__()" in str(e):
            # Monkey patch httpx.Client to accept the app parameter
            import httpx
            original_init = httpx.Client.__init__
            
            def patched_init(self, *args, **kwargs):
                # Remove app if it was passed
                kwargs.pop('app', None)
                return original_init(self, *args, **kwargs)
            
            httpx.Client.__init__ = patched_init
            client = FastAPITestClient(app)
            # Restore original
            httpx.Client.__init__ = original_init
            return client
        else:
            raise


@pytest.fixture
def admin_user(db: Session):
    """Create and return an admin user (or reuse existing one)"""
    # Check if admin user already exists
    admin = db.query(User).filter(User.email == "admin@test.com").first()
    if admin:
        return admin
    
    # Otherwise create a new one
    admin = User(
        email="admin@test.com",
        username="admin",
        hashed_password=hash_password("admin123"),
        is_admin=True,
        is_active=True,
        is_approved=True,
        tier="unlimited"
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


@pytest.fixture
def admin_token(admin_user: User):
    """Create an admin token directly to avoid login rate limiting in tests."""
    return create_access_token(
        data={"sub": str(admin_user.id), "tv": int(admin_user.token_version or 0)},
        expires_delta=timedelta(minutes=30),
    )


@pytest.fixture
def cleanup_users(db: Session):
    """Cleanup test users after each test"""
    yield
    # Clean up all test users - use a broader approach that clears all non-admin test users
    try:
        # Ensure session is usable even if the test failed during commit/flush.
        db.rollback()

        # Core test emails we know about
        test_emails = [
            "testuser@test.com",
            "testuser2@test.com",
            "testuser3@test.com",
            "nonadmin@test.com",
            "invited@test.com",
            "invited1@test.com",
            "linkinvite@test.com",
            "existing@test.com",
            "different@test.com",
            "expired@test.com",
            "workflow@test.com",
            "reuse@test.com",
            "reuse2@test.com"
        ]
        for email in test_emails:
            try:
                user = db.query(User).filter(User.email == email).first()
                if user:
                    db.delete(user)
            except Exception as e:
                print(f"Error deleting user {email}: {e}")
                db.rollback()
        
        db.commit()
        
        # Clean up invitations
        db.query(UserInvitation).delete()
        db.commit()
    except Exception as e:
        print(f"Cleanup error: {e}")
        db.rollback()


class TestInvitationCreation:
    """Tests for creating invitations"""
    
    def test_create_email_invitation(self, client, admin_token: str, cleanup_users, db: Session):
        """Test creating an email-based invitation"""
        response = client.post(
            "/admin/invitations",
            json={
                "email": "invited@test.com",
                "tier": "pro",
                "send_email": True
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "invited@test.com"
        assert data["tier"] == "pro"
        assert data["send_email"] is True
        assert "invitation_link" in data
        assert data["token"] is not None
        assert not data["is_used"]
        
        # Verify in database
        invite = db.query(UserInvitation).filter(
            UserInvitation.email == "invited@test.com"
        ).first()
        assert invite is not None
        assert not is_link_only_email(invite.email)
    
    def test_create_link_only_invitation(self, client, admin_token: str, cleanup_users, db: Session):
        """Test creating a link-only (shareable) invitation"""
        response = client.post(
            "/admin/invitations",
            json={
                "tier": "pro",
                "send_email": False
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["tier"] == "pro"
        assert data["send_email"] is False
        assert "invitation_link" in data
        assert data["token"] is not None
        assert not data["is_used"]
        
        # Email should be a synthetic placeholder
        invite = db.query(UserInvitation).filter(
            UserInvitation.id == data["id"]
        ).first()
        assert invite is not None
        assert is_link_only_email(invite.email)
    
    def test_create_invitation_without_email_for_send_fails(self, client, admin_token: str):
        """Test that creating email invitation without address fails"""
        response = client.post(
            "/admin/invitations",
            json={
                "tier": "pro",
                "send_email": True
                # Missing email field
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 422  # Validation error
    
    def test_create_invitation_for_existing_email_fails(self, client, admin_token: str, cleanup_users, db: Session):
        """Test that creating invitation for existing user fails"""
        # Create a test user first
        user = User(
            email="existing@test.com",
            username="existing",
            hashed_password=hash_password("password123"),
            is_active=True,
            is_approved=True
        )
        db.add(user)
        db.commit()
        
        # Try to invite the same email
        response = client.post(
            "/admin/invitations",
            json={
                "email": "existing@test.com",
                "tier": "pro",
                "send_email": True
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]
    
    def test_update_existing_invitation(self, client, admin_token: str, cleanup_users, db: Session):
        """Test that creating invitation for same email updates existing one"""
        # Create first invitation
        response1 = client.post(
            "/admin/invitations",
            json={
                "email": "invited@test.com",
                "tier": "free",
                "send_email": True
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        token1 = response1.json()["token"]

        # Sliding-session middleware may set an auth cookie; clear it so this
        # bearer-token request is not subject to cookie-based CSRF checks.
        client.cookies.clear()
        
        # Create second invitation for same email with different tier
        response2 = client.post(
            "/admin/invitations",
            json={
                "email": "invited@test.com",
                "tier": "pro",
                "send_email": True
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        token2 = response2.json()["token"]
        
        # Should be different tokens
        assert token1 != token2
        
        # Should only have one invitation in DB
        invites = db.query(UserInvitation).filter(
            UserInvitation.email == "invited@test.com",
            UserInvitation.is_used == False
        ).all()
        assert len(invites) == 1
        assert invites[0].tier == "pro"


class TestInvitationListing:
    """Tests for listing invitations"""
    
    def test_list_invitations(self, client, admin_token: str, cleanup_users, db: Session):
        """Test listing all invitations"""
        # Create a few invitations
        client.post(
            "/admin/invitations",
            json={"email": "invited1@test.com", "tier": "pro", "send_email": True},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        client.cookies.clear()
        client.post(
            "/admin/invitations",
            json={"tier": "free", "send_email": False},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        response = client.get(
            "/admin/invitations",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        invites = response.json()
        assert len(invites) >= 2
        
        # Check that method labels are present
        email_invite = next((i for i in invites if i["send_email"]), None)
        link_invite = next((i for i in invites if not i["send_email"]), None)
        
        assert email_invite is not None
        assert link_invite is not None


class TestInvitationTokenValidation:
    """Tests for validating invitation tokens"""
    
    def test_validate_email_invitation_matching_email(self, client, admin_token: str, cleanup_users, db: Session):
        """Test validating email invitation with matching email"""
        # Create email invitation
        create_response = client.post(
            "/admin/invitations",
            json={"email": "invited@test.com", "tier": "pro", "send_email": True},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        token = create_response.json()["token"]
        
        # Try to validate with same email
        response = client.post(
            "/auth/register",
            json={
                "nickname": "testuser",
                "email": "invited@test.com",
                "password": "password123",
                "agree_tos": True,
                "agree_privacy": True,
                "agree_fair_use": True
            },
            params={"token": token}
        )
        
        assert response.status_code == 200
        user = response.json()
        assert user["email"] == "invited@test.com"
    
    def test_validate_email_invitation_different_email_fails(self, client, admin_token: str, cleanup_users):
        """Test that email invitation fails with different email"""
        # Create email invitation
        create_response = client.post(
            "/admin/invitations",
            json={"email": "invited@test.com", "tier": "pro", "send_email": True},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        token = create_response.json()["token"]
        
        # Try to register with different email
        response = client.post(
            "/auth/register",
            json={
                "nickname": "testuser",
                "email": "different@test.com",
                "password": "password123",
                "agree_tos": True,
                "agree_privacy": True,
                "agree_fair_use": True
            },
            params={"token": token}
        )
        
        assert response.status_code == 403
        assert "different email address" in response.json()["detail"]
    
    def test_validate_link_only_invitation_any_email(self, client, admin_token: str, cleanup_users, db: Session):
        """Test that link-only invitation accepts any email"""
        # Create link-only invitation
        create_response = client.post(
            "/admin/invitations",
            json={"tier": "pro", "send_email": False},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        token = create_response.json()["token"]
        
        # Register with first email
        response1 = client.post(
            "/auth/register",
            json={
                "nickname": "testuser",
                "email": "linkinvite@test.com",
                "password": "password123",
                "agree_tos": True,
                "agree_privacy": True,
                "agree_fair_use": True
            },
            params={"token": token}
        )
        
        assert response1.status_code == 200
        user1 = response1.json()
        assert user1["email"] == "linkinvite@test.com"
        
        # Link should be marked as used now
        invite = db.query(UserInvitation).filter(
            UserInvitation.token == token
        ).first()
        assert invite.is_used is True
    
    def test_expired_invitation_fails(self, client, admin_token: str, cleanup_users, db: Session):
        """Test that expired invitation fails"""
        # Create an invitation and manually expire it
        invite = UserInvitation(
            email="expired@test.com",
            token="expired_token_12345",
            invited_by=1,
            tier="pro",
            expires_at=datetime.datetime.utcnow() - datetime.timedelta(days=1)
        )
        db.add(invite)
        db.commit()
        
        # Try to use expired token
        response = client.post(
            "/auth/register",
            json={
                "nickname": "testuser",
                "email": "expired@test.com",
                "password": "password123",
                "agree_tos": True,
                "agree_privacy": True,
                "agree_fair_use": True
            },
            params={"token": "expired_token_12345"}
        )
        
        assert response.status_code == 403
        assert "expired" in response.json()["detail"]
    
    def test_invalid_token_fails(self, client, cleanup_users):
        """Test that invalid token fails"""
        response = client.post(
            "/auth/register",
            json={
                "nickname": "testuser",
                "email": "testuser@test.com",
                "password": "password123",
                "agree_tos": True,
                "agree_privacy": True,
                "agree_fair_use": True
            },
            params={"token": "invalid_token_xyz"}
        )
        
        assert response.status_code == 403
        assert "Invalid or expired" in response.json()["detail"]


class TestInvitationWorkflow:
    """Integration tests for complete invitation workflows"""
    
    def test_complete_email_invitation_workflow(self, client, admin_token: str, cleanup_users, db: Session):
        """Test complete workflow: create email invitation -> register -> verify"""
        # Admin creates invitation
        create_response = client.post(
            "/admin/invitations",
            json={"email": "workflow@test.com", "tier": "pro", "send_email": True},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert create_response.status_code == 200
        invite_data = create_response.json()
        token = invite_data["token"]
        
        # User registers with invitation
        register_response = client.post(
            "/auth/register",
            json={
                "nickname": "workflowuser",
                "email": "workflow@test.com",
                "password": "password123",
                "agree_tos": True,
                "agree_privacy": True,
                "agree_fair_use": True
            },
            params={"token": token}
        )
        
        assert register_response.status_code == 200
        user = register_response.json()
        assert user["email"] == "workflow@test.com"
        assert user["tier"] == "pro"
        
        # Verify invitation is marked used
        invite = db.query(UserInvitation).filter(
            UserInvitation.token == token
        ).first()
        assert invite.is_used is True
    
    def test_complete_link_only_workflow(self, client, admin_token: str, cleanup_users, db: Session):
        """Test complete workflow: create link -> share -> register with any email"""
        # Admin creates link-only invitation
        create_response = client.post(
            "/admin/invitations",
            json={"tier": "early_tester", "send_email": False},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert create_response.status_code == 200
        invite_data = create_response.json()
        token = invite_data["token"]
        link = invite_data["invitation_link"]
        
        # Verify link format
        assert "token=" in link
        
        # User joins via link with custom email
        register_response = client.post(
            "/auth/register",
            json={
                "nickname": "linkuser",
                "email": "linkinvite@test.com",
                "password": "password123",
                "agree_tos": True,
                "agree_privacy": True,
                "agree_fair_use": True
            },
            params={"token": token}
        )
        
        assert register_response.status_code == 200
        user = register_response.json()
        assert user["email"] == "linkinvite@test.com"
        assert user["tier"] == "early_tester"
    
    def test_invitation_marked_used_prevents_reuse(self, client, admin_token: str, cleanup_users):
        """Test that used invitation cannot be reused"""
        # Create and use invitation
        create_response = client.post(
            "/admin/invitations",
            json={"email": "reuse@test.com", "tier": "pro", "send_email": True},
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        token = create_response.json()["token"]
        
        # Register with token
        client.post(
            "/auth/register",
            json={
                "nickname": "user1",
                "email": "reuse@test.com",
                "password": "password123",
                "agree_tos": True,
                "agree_privacy": True,
                "agree_fair_use": True
            },
            params={"token": token}
        )
        
        # Try to reuse for different account (would fail anyway since email exists)
        # But the real test is trying to use it from another IP
        response = client.post(
            "/auth/register",
            json={
                "nickname": "user2",
                "email": "reuse2@test.com",
                "password": "password123",
                "agree_tos": True,
                "agree_privacy": True,
                "agree_fair_use": True
            },
            params={"token": token}
        )
        
        assert response.status_code == 403
        assert "Invalid or expired" in response.json()["detail"]


class TestHelperFunctions:
    """Tests for utility functions"""
    
    def test_is_link_only_email_detection(self):
        """Test that link-only emails are properly detected"""
        token = "test_token_123"
        link_only_email = build_link_only_email(token)
        
        assert is_link_only_email(link_only_email)
        assert not is_link_only_email("normal@example.com")
        assert not is_link_only_email("another@domain.com")
    
    def test_build_link_only_email_format(self):
        """Test the format of generated link-only emails"""
        token = "abc123def456"
        link_only_email = build_link_only_email(token)
        
        assert "link-only-invite-" in link_only_email
        assert "@invitations.local" in link_only_email
        assert token in link_only_email


class TestAuthorizationAndAccess:
    """Tests for authorization and access control"""
    
    def test_only_admin_can_create_invitations(self, client, cleanup_users, db: Session):
        """Test that non-admin users cannot create invitations"""
        # Create a non-admin user
        user = User(
            email="nonadmin@test.com",
            username="nonadmin",
            hashed_password=hash_password("password123"),
            is_admin=False,
            is_active=True,
            is_approved=True
        )
        db.add(user)
        db.commit()

        token = create_access_token(
            data={"sub": str(user.id), "tv": int(user.token_version or 0)},
            expires_delta=timedelta(minutes=30),
        )
        
        # Try to create invitation
        response = client.post(
            "/admin/invitations",
            json={"email": "test@example.com", "tier": "pro", "send_email": True},
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 403
    
    def test_only_admin_can_list_invitations(self, client, cleanup_users, db: Session):
        """Test that non-admin users cannot list invitations"""
        # Create a non-admin user
        user = User(
            email="nonadmin@test.com",
            username="nonadmin",
            hashed_password=hash_password("password123"),
            is_admin=False,
            is_active=True,
            is_approved=True
        )
        db.add(user)
        db.commit()

        token = create_access_token(
            data={"sub": str(user.id), "tv": int(user.token_version or 0)},
            expires_delta=timedelta(minutes=30),
        )
        
        # Try to list invitations
        response = client.get(
            "/admin/invitations",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 403
