from datetime import datetime, timedelta, timezone
import hashlib
import secrets
from typing import Any

import bcrypt
import jwt

from app.core.config import get_secret_key, get_token_expire_minutes

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    """Hash password using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=get_token_expire_minutes())
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, get_secret_key(), algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, get_secret_key(), algorithms=[ALGORITHM])
        return payload
    except (jwt.PyJWTError, Exception):
        return None


def generate_otp(length: int = 6) -> str:
    """Generate a secure numeric one-time password."""
    return "".join(secrets.choice("0123456789") for _ in range(length))


def hash_otp(otp: str) -> str:
    """Hash OTP using SHA-256 with salt."""
    salt = get_secret_key()[:16]
    return hashlib.sha256(f"{salt}:{otp}".encode("utf-8")).hexdigest()


def verify_otp_hash(plain_otp: str, hashed_otp: str) -> bool:
    """Verify plain OTP against stored hash."""
    return hash_otp(plain_otp) == hashed_otp
