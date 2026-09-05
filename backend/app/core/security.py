from datetime import datetime, timedelta, timezone
from hashlib import pbkdf2_hmac
import hmac
import os
import secrets

import jwt

from app.core.config import get_jwt_secret


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = pbkdf2_hmac("sha256", password.encode(), salt, 240_000)
    return f"pbkdf2_sha256$240000${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds, salt_hex, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), int(rounds))
        return hmac.compare_digest(actual.hex(), digest_hex)
    except (TypeError, ValueError):
        return False


def create_access_token(user_id: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=int(os.getenv("JALARI_JWT_MINUTES", "60")))
    return jwt.encode({"sub": user_id, "role": role, "iat": now, "exp": expires}, get_jwt_secret(), algorithm="HS256")


def decode_access_token(token: str) -> dict[str, object]:
    return jwt.decode(token, get_jwt_secret(), algorithms=["HS256"])
