import hashlib
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import RESQ_SECRET_KEY

bearer = HTTPBearer(auto_error=False)

try:
    from argon2 import PasswordHasher
    _argon2 = PasswordHasher()
except ImportError:
    _argon2 = None


def _configured_secret() -> str:
    from . import security as sec_mod
    key = getattr(sec_mod, 'RESQ_SECRET_KEY', None)
    if key is None:
        key = RESQ_SECRET_KEY
    if key is None or len(key.encode('utf-8')) < 32:
        raise HTTPException(
            status_code=503,
            detail='Sign-in is unavailable until a secure signing key is configured',
        )
    return key


# ---------- legacy (/app/*) token: 12h, no refresh ----------

def make_token(user_id: int, role: str) -> str:
    key = _configured_secret()
    payload = {'sub': str(user_id), 'role': role, 'exp': datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, key, algorithm='HS256')


def _confirm_active(identity: dict[str, object]) -> dict[str, object]:
    """A token is only as good as the account behind it: a deactivated person is refused at once, and the role is the one on record."""
    from sqlalchemy import text
    from ..database.session import engine
    with engine.connect() as db:
        row = db.execute(text('SELECT role FROM resq_users WHERE id=:i AND deactivated_at IS NULL'), {'i': identity['id']}).first()
    if not row:
        raise HTTPException(status_code=401, detail='Session expired')
    return {'id': identity['id'], 'role': row[0]}


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict[str, object]:
    if not credentials:
        raise HTTPException(status_code=401, detail='Authentication required')
    key = _configured_secret()
    try:
        payload = jwt.decode(
            credentials.credentials,
            key,
            algorithms=['HS256'],
            options={'require': ['exp']},
        )
        if 'typ' in payload:
            raise ValueError('unexpected token type')
        identity = {'id': int(payload['sub']), 'role': payload['role']}
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail='Session expired') from exc
    return _confirm_active(identity)


WRITE_ROLES = {'admin', 'officer', 'control_room_operator', 'incident_commander'}


def require_write(user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    if user['role'] not in {'admin', 'officer'}:
        raise HTTPException(status_code=403, detail='This role cannot make changes')
    return user


# ---------- redesign (/redesign/*, /api/auth/*) auth: short-lived access + rotated refresh ----------

ACCESS_TOKEN_MINUTES = 15
REFRESH_TOKEN_DAYS = 14
RESQ_ROLES = {'range_officer', 'control_room_operator', 'field_crew', 'incident_commander', 'admin'}


def make_access_token(user_id: int, role: str) -> str:
    key = _configured_secret()
    payload = {
        'sub': str(user_id),
        'role': role,
        'typ': 'access',
        'exp': datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, key, algorithm='HS256')


def decode_access_token(token: str) -> dict[str, object]:
    key = _configured_secret()
    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=['HS256'],
            options={'require': ['exp']},
        )
        if payload.get('typ') != 'access':
            raise ValueError('wrong token type')
        identity = {'id': int(payload['sub']), 'role': payload['role']}
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail='Session expired') from exc
    return _confirm_active(identity)


def current_redesign_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict[str, object]:
    if not credentials:
        raise HTTPException(status_code=401, detail='Authentication required')
    return decode_access_token(credentials.credentials)


def optional_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict[str, object] | None:
    """The signed-in user, or None when no credentials were sent. A bad or expired token is still rejected."""
    return decode_access_token(credentials.credentials) if credentials else None


def current_risk_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict[str, object]:
    """Authenticate access tokens or legacy signed tokens for the read-only risk API.

    Authorization is still enforced by ``require_risk_roles``. This adapter only
    bridges the established legacy login token format; it does not map roles.
    """
    if not credentials:
        raise HTTPException(status_code=401, detail='Authentication required')
    key = _configured_secret()
    try:
        payload = jwt.decode(
            credentials.credentials,
            key,
            algorithms=['HS256'],
            options={'require': ['exp']},
        )
        if 'typ' in payload and payload['typ'] != 'access':
            raise ValueError('wrong token type')
        identity = {'id': int(payload['sub']), 'role': payload['role']}
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=401, detail='Session expired') from exc
    return _confirm_active(identity)


def require_staff_write(user: dict[str, object] = Depends(current_risk_user)) -> dict[str, object]:
    """Staff who may create and change operational records, signed in with the current session tokens (or the older signed tokens)."""
    if user['role'] not in WRITE_ROLES:
        raise HTTPException(status_code=403, detail='This role cannot make changes')
    return user


def require_roles(*roles: str):
    """Dependency factory: 403s unless caller's role is in roles or is admin."""
    allowed = set(roles) | {'admin'}

    def _dep(user: dict[str, object] = Depends(current_redesign_user)) -> dict[str, object]:
        if user['role'] not in allowed:
            raise HTTPException(status_code=403, detail="Your role doesn't allow this")
        return user

    return _dep


def require_risk_roles(*roles: str):
    """Risk-read role gate for the compatibility-aware risk token dependency."""
    allowed = set(roles) | {'admin'}

    def _dep(user: dict[str, object] = Depends(current_risk_user)) -> dict[str, object]:
        if user['role'] not in allowed:
            raise HTTPException(status_code=403, detail="Your role doesn't allow this")
        return user

    return _dep


# ---------- CSRF (double-submit, paired with SameSite=Strict refresh cookie) ----------

CSRF_COOKIE = 'resq_csrf'
CSRF_HEADER = 'x-resq-csrf'


def make_csrf_token() -> str:
    return secrets.token_urlsafe(24)


def require_csrf(request: Request) -> None:
    cookie_value = request.cookies.get(CSRF_COOKIE)
    header_value = request.headers.get(CSRF_HEADER)
    if not cookie_value or not header_value or not secrets.compare_digest(cookie_value, header_value):
        raise HTTPException(status_code=403, detail='Missing or invalid CSRF token')


# ---------- opaque tokens (refresh / invite / password-reset) ----------

def new_raw_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


# ---------- password hashing: bcrypt or argon2 ----------

def hash_password_argon2(password: str) -> str:
    if _argon2 is not None:
        return _argon2.hash(password)
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def hash_password(password: str) -> str:
    return hash_password_argon2(password)


def verify_password(password: str, password_hash: str, algo: str = 'bcrypt') -> bool:
    # Defensive check: if hash looks like argon2 but algo is wrong, fix it
    if password_hash.startswith('$argon2'):
        algo = 'argon2'
    
    if algo == 'argon2':
        if _argon2 is None:
            raise HTTPException(status_code=500, detail='argon2 not available but required for this account')
        try:
            # argon2.verify takes (hash, password) - reverse order from most functions
            _argon2.verify(password_hash, password)
            return True
        except Exception as e:
            # If argon2 verification fails, return False (wrong password), don't fall through to bcrypt
            return False
    
    # Only use bcrypt for actual bcrypt hashes
    return bcrypt.checkpw(password.encode(), password_hash.encode())
