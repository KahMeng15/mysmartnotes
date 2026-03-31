import pytest
from fastapi.testclient import TestClient as FastAPITestClient

from main import app  # noqa: F401
from app.models.db import User
from app.routers import auth as auth_router
from app.utils.auth import hash_password
from app.utils.db import SessionLocal, init_db


@pytest.fixture(scope="session")
def db_session():
    init_db()
    db = SessionLocal()
    yield db
    db.close()


@pytest.fixture(scope="function")
def client():
    """Create a FastAPI test client with compatibility fallback."""
    try:
        return FastAPITestClient(app)
    except TypeError as e:
        if "Client.__init__()" in str(e):
            import httpx
            original_init = httpx.Client.__init__

            def patched_init(self, *args, **kwargs):
                kwargs.pop("app", None)
                return original_init(self, *args, **kwargs)

            httpx.Client.__init__ = patched_init
            patched_client = FastAPITestClient(app)
            httpx.Client.__init__ = original_init
            return patched_client
        raise


@pytest.fixture(scope="function")
def auth_user(db_session):
    email = "cookie-auth-user@test.com"
    username = "cookie_auth_user"

    existing = db_session.query(User).filter(User.email == email).first()
    if existing:
        db_session.delete(existing)
        db_session.commit()

    user = User(
        email=email,
        username=username,
        hashed_password=hash_password("cookiepass123"),
        is_active=True,
        is_approved=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    yield user

    cleanup = db_session.query(User).filter(User.email == email).first()
    if cleanup:
        db_session.delete(cleanup)
        db_session.commit()


def test_verify_firebase_token_requires_signature_verification(monkeypatch):
    """Firebase token verification should rely on Google verification path."""

    called = {"verified": False}

    def fake_verify(id_token_str, request_adapter, audience=None):
        called["verified"] = True
        return {
            "email": "secure-user@example.com",
            "iss": f"https://securetoken.google.com/{auth_router.settings.FIREBASE_PROJECT_ID}",
            "aud": auth_router.settings.FIREBASE_PROJECT_ID,
            "sub": "firebase-user-id",
        }

    monkeypatch.setattr(auth_router.id_token, "verify_firebase_token", fake_verify)

    claims = auth_router.verify_firebase_token("fake-token")
    assert called["verified"] is True
    assert claims["email"] == "secure-user@example.com"


def test_verify_firebase_token_rejects_missing_email(monkeypatch):
    def fake_verify(id_token_str, request_adapter, audience=None):
        return {
            "iss": f"https://securetoken.google.com/{auth_router.settings.FIREBASE_PROJECT_ID}",
            "aud": auth_router.settings.FIREBASE_PROJECT_ID,
            "sub": "firebase-user-id",
        }

    monkeypatch.setattr(auth_router.id_token, "verify_firebase_token", fake_verify)

    with pytest.raises(ValueError, match="Token missing email claim"):
        auth_router.verify_firebase_token("fake-token")


def test_prepare_user_for_response_does_not_expose_ai_key():
    user = User(
        id=999,
        username="secureuser",
        email="secure@example.com",
        hashed_password="hash",
        ai_provider="gemini",
        ai_api_key="enc:encrypted-value",
    )

    payload = auth_router._prepare_user_for_response(user)
    assert payload["ai_api_key"] is None
    assert payload["ai_api_key_configured"] is True


def test_login_sets_cookie_session_and_csrf(client, auth_user):
    response = client.post(
        "/auth/login",
        json={"email": auth_user.email, "password": "cookiepass123"},
    )

    assert response.status_code == 200
    assert "access_token" in response.cookies
    assert auth_router.settings.CSRF_COOKIE_NAME in response.cookies
    assert response.headers.get(auth_router.settings.CSRF_HEADER_NAME)


def test_cookie_only_auth_can_access_me(client, auth_user):
    login_response = client.post(
        "/auth/login",
        json={"email": auth_user.email, "password": "cookiepass123"},
    )
    assert login_response.status_code == 200

    # No Authorization header; session should be sourced from cookie.
    me_response = client.get("/auth/me")
    assert me_response.status_code == 200
    assert me_response.json()["email"] == auth_user.email


def test_logout_clears_cookie_session(client, auth_user):
    login_response = client.post(
        "/auth/login",
        json={"email": auth_user.email, "password": "cookiepass123"},
    )
    assert login_response.status_code == 200

    csrf_cookie_name = auth_router.settings.CSRF_COOKIE_NAME
    csrf_header_name = auth_router.settings.CSRF_HEADER_NAME
    csrf_token = client.cookies.get(csrf_cookie_name)

    logout_response = client.post(
        "/auth/logout",
        headers={csrf_header_name: csrf_token},
    )
    assert logout_response.status_code == 200

    me_response = client.get("/auth/me")
    assert me_response.status_code == 401


def test_logout_without_csrf_header_is_forbidden(client, auth_user):
    login_response = client.post(
        "/auth/login",
        json={"email": auth_user.email, "password": "cookiepass123"},
    )
    assert login_response.status_code == 200

    logout_response = client.post("/auth/logout")
    assert logout_response.status_code == 403


def test_profile_update_requires_csrf_header_for_cookie_auth(client, auth_user):
    login_response = client.post(
        "/auth/login",
        json={"email": auth_user.email, "password": "cookiepass123"},
    )
    assert login_response.status_code == 200

    update_response = client.put(
        "/auth/profile",
        json={"nickname": "newnick"},
    )
    assert update_response.status_code == 403


def test_profile_update_with_csrf_header_succeeds(client, auth_user):
    login_response = client.post(
        "/auth/login",
        json={"email": auth_user.email, "password": "cookiepass123"},
    )
    assert login_response.status_code == 200

    csrf_cookie_name = auth_router.settings.CSRF_COOKIE_NAME
    csrf_header_name = auth_router.settings.CSRF_HEADER_NAME
    csrf_token = client.cookies.get(csrf_cookie_name)

    update_response = client.put(
        "/auth/profile",
        headers={csrf_header_name: csrf_token},
        json={"nickname": "newnick"},
    )
    assert update_response.status_code == 200
    assert update_response.json()["nickname"] == "newnick"
