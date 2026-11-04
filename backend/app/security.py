"""Password hashing (bcrypt) and JWT session tokens in httpOnly cookies."""
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import HTTPException, Request, Response, status

from app.config import get_settings

COOKIE_NAME = "smooth_session"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


MFA_TOKEN_MINUTES = 5


def create_token(user_id: uuid.UUID, version: int = 1) -> str:
    """A session, tied to the user's session_version: when that moves on, the session ends."""
    settings = get_settings()
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({"sub": str(user_id), "exp": expires, "typ": "session", "ver": int(version)}, settings.secret_key, algorithm="HS256")


def create_mfa_token(user_id: uuid.UUID) -> str:
    """Short-lived proof that the password was correct; exchanged for a session
    once the second factor (authenticator code) has been verified."""
    expires = datetime.now(timezone.utc) + timedelta(minutes=MFA_TOKEN_MINUTES)
    return jwt.encode({"sub": str(user_id), "exp": expires, "typ": "mfa"}, get_settings().secret_key, algorithm="HS256")


def read_mfa_token(token: str) -> uuid.UUID:
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
        if payload.get("typ") != "mfa":
            raise ValueError("not an MFA token")
        return uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign-in expired, start again")


def set_session_cookie(response: Response, token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")


def read_session(request: Request) -> tuple[uuid.UUID, int]:
    """Who the session cookie says, and the session version it was made for (1 for older cookies)."""
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")
    try:
        payload = jwt.decode(token, get_settings().secret_key, algorithms=["HS256"])
        # Tokens from before typ was introduced are sessions; MFA tokens never are.
        if payload.get("typ", "session") != "session":
            raise ValueError("not a session token")
        return uuid.UUID(payload["sub"]), int(payload.get("ver", 1))
    except (jwt.PyJWTError, KeyError, ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")


def read_user_id_from_request(request: Request) -> uuid.UUID:
    return read_session(request)[0]


def session_current(user, version: int) -> bool:
    return int(version) == int(user.session_version or 1)
