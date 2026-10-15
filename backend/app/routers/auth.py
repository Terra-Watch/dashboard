from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from ..contracts.schemas import (
    AccessRequest, AdminPasswordResetRequest, InviteAcceptRequest, InviteCreateRequest,
    LoginRequest, PasswordResetCompleteRequest, PasswordResetRequest, RedesignLoginRequest,
)
from ..core.security import (
    CSRF_COOKIE, REFRESH_TOKEN_DAYS, RESQ_ROLES, current_redesign_user, hash_password_argon2,
    hash_token, make_access_token, make_csrf_token, make_token, new_raw_token, require_csrf,
    require_roles, verify_password,
)
from ..database.session import engine
from ..services.audit_log import write_audit_log

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_WINDOW_MINUTES = 15
GENERIC_LOGIN_ERROR = "Invalid email or password."
GENERIC_LOCKOUT_ERROR = "Too many attempts. Try again in a few minutes."


# ---------- legacy (/app/*) login ----------

@router.post("/login")
def login(payload: LoginRequest) -> dict[str, object]:
    with engine.connect() as db:
        user = db.execute(
            text("SELECT id,email,name,password_hash,role,password_algo FROM resq_users WHERE email=:email"),
            {"email": payload.email.strip().lower()},
        ).mappings().first()
    if not user or not verify_password(payload.password, user["password_hash"], user.get("password_algo", "bcrypt")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {
        "access_token": make_token(user["id"], user["role"]),
        "token_type": "bearer",
        "user": {"email": user["email"], "name": user["name"], "role": user["role"]},
    }


@router.post("/access-requests", status_code=202)
def request_access(payload: AccessRequest) -> dict[str, str]:
    with engine.begin() as db:
        db.execute(
            text("INSERT INTO resq_access_requests (name,designation,department,email,state,reason) "
                 "VALUES (:name,:designation,:department,:email,:state,:reason)"),
            payload.model_dump(),
        )
    return {"status": "received"}


@router.post('/password-reset/request', status_code=202)
def request_password_reset(payload: PasswordResetRequest) -> dict[str, str]:
    with engine.begin() as db:
        db.execute(text('INSERT INTO resq_password_reset_requests (email) VALUES (:email)'), {'email': payload.email.strip().lower()})
    return {'status': 'received'}


# ---------- redesign (/redesign/*) login & session lifecycle ----------

def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _recent_failed_attempts(db, email: str, ip: str) -> int:
    return db.execute(
        text(
            "SELECT COUNT(*) FROM resq_login_attempts WHERE email=:email AND ip=:ip "
            "AND attempted_at > now() - make_interval(mins => :minutes) AND success=false"
        ),
        {'email': email, 'ip': ip, 'minutes': LOCKOUT_WINDOW_MINUTES},
    ).scalar() or 0


def _record_attempt(db, email: str, ip: str, success: bool) -> None:
    db.execute(
        text("INSERT INTO resq_login_attempts (email, ip, success) VALUES (:email, :ip, :success)"),
        {'email': email, 'ip': ip, 'success': success},
    )


def _issue_session(response: Response, user_id: int, role: str, device_id: str | None) -> str:
    access_token = make_access_token(user_id, role)
    raw_refresh = new_raw_token()
    with engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO resq_refresh_tokens (user_id, token_hash, expires_at, device_id) "
                "VALUES (:user_id, :token_hash, now() + make_interval(days => :days), :device_id)"
            ),
            {'user_id': user_id, 'token_hash': hash_token(raw_refresh), 'device_id': device_id, 'days': REFRESH_TOKEN_DAYS},
        )
    csrf_token = make_csrf_token()
    response.set_cookie('resq_refresh', raw_refresh, httponly=True, secure=True, samesite='strict', max_age=REFRESH_TOKEN_DAYS * 86400, path='/api/auth')
    response.set_cookie(CSRF_COOKIE, csrf_token, httponly=False, secure=True, samesite='strict', max_age=REFRESH_TOKEN_DAYS * 86400)
    return access_token


@router.post("/redesign/login")
def redesign_login(payload: RedesignLoginRequest, request: Request, response: Response) -> dict[str, object]:
    email = payload.email.strip().lower()
    ip = _client_ip(request)
    with engine.begin() as db:
        locked_out = _recent_failed_attempts(db, email, ip) >= MAX_FAILED_ATTEMPTS
        user = None if locked_out else db.execute(
            text("SELECT id,email,name,password_hash,password_algo,role,home_state FROM resq_users WHERE email=:email"),
            {'email': email},
        ).mappings().first()
        valid = bool(user) and user['role'] in RESQ_ROLES and verify_password(payload.password, user['password_hash'], user.get('password_algo', 'bcrypt'))
        if not locked_out:
            _record_attempt(db, email, ip, valid)

    if locked_out:
        write_audit_log(action='login_failed', entity_type='session', entity_id=email, metadata={'reason': 'locked', 'ip': ip})
        raise HTTPException(status_code=429, detail=GENERIC_LOCKOUT_ERROR)
    if not valid:
        write_audit_log(action='login_failed', entity_type='session', entity_id=email, metadata={'ip': ip})
        raise HTTPException(status_code=401, detail=GENERIC_LOGIN_ERROR)

    access_token = _issue_session(response, user['id'], user['role'], request.headers.get('x-device-id'))
    write_audit_log(action='login_success', entity_type='session', entity_id=str(user['id']), user_id=user['id'], metadata={'ip': ip})
    return {
        'access_token': access_token,
        'token_type': 'bearer',
        'user': {'id': user['id'], 'email': user['email'], 'name': user['name'], 'role': user['role'], 'home_state': user.get('home_state')},
    }


@router.post("/refresh")
def refresh(request: Request, response: Response) -> dict[str, object]:
    raw = request.cookies.get('resq_refresh')
    if not raw:
        raise HTTPException(status_code=401, detail='Session expired')
    token_hash = hash_token(raw)
    reused, expired, user = False, False, None
    with engine.begin() as db:
        row = db.execute(
            text("SELECT id, user_id, revoked_at, expires_at FROM resq_refresh_tokens WHERE token_hash=:h"),
            {'h': token_hash},
        ).mappings().first()
        if not row:
            raise HTTPException(status_code=401, detail='Session expired')
        if row['revoked_at'] is not None:
            db.execute(text("UPDATE resq_refresh_tokens SET revoked_at=now() WHERE user_id=:uid AND revoked_at IS NULL"), {'uid': row['user_id']})
            reused = True
        elif row['expires_at'] < datetime.now(timezone.utc):
            expired = True
        else:
            db.execute(text("UPDATE resq_refresh_tokens SET revoked_at=now() WHERE id=:id"), {'id': row['id']})
            user = db.execute(text("SELECT id, role FROM resq_users WHERE id=:id"), {'id': row['user_id']}).mappings().first()

    if reused:
        write_audit_log(action='token_refresh_reuse_detected', entity_type='session', entity_id=str(row['user_id']), user_id=row['user_id'])
        raise HTTPException(status_code=401, detail='Session expired, please sign in again')
    if expired:
        raise HTTPException(status_code=401, detail='Session expired')

    access_token = _issue_session(response, user['id'], user['role'], request.headers.get('x-device-id'))
    write_audit_log(action='token_refresh', entity_type='session', entity_id=str(user['id']), user_id=user['id'])
    return {'access_token': access_token, 'token_type': 'bearer'}


@router.post("/logout", dependencies=[Depends(require_csrf)])
def logout(request: Request, response: Response, user: dict = Depends(current_redesign_user)) -> dict[str, str]:
    raw = request.cookies.get('resq_refresh')
    if raw:
        with engine.begin() as db:
            db.execute(text("UPDATE resq_refresh_tokens SET revoked_at=now() WHERE token_hash=:h AND revoked_at IS NULL"), {'h': hash_token(raw)})
    response.delete_cookie('resq_refresh', path='/api/auth')
    response.delete_cookie(CSRF_COOKIE)
    write_audit_log(action='logout', entity_type='session', entity_id=str(user['id']), user_id=user['id'])
    return {'status': 'logged_out'}


@router.get("/me")
def me(user: dict = Depends(current_redesign_user)) -> dict[str, object]:
    with engine.connect() as db:
        row = db.execute(text("SELECT id,email,name,role,home_state FROM resq_users WHERE id=:id"), {'id': user['id']}).mappings().first()
        scopes = db.execute(text("SELECT state FROM resq_user_scopes WHERE user_id=:id"), {'id': user['id']}).scalars().all()
    if not row:
        raise HTTPException(status_code=401, detail='Session expired')
    return {**dict(row), 'scopes': list(scopes)}


# ---------- invites (admin-only) ----------

@router.post("/invites", dependencies=[Depends(require_csrf)])
def create_invite(payload: InviteCreateRequest, admin: dict = Depends(require_roles())) -> dict[str, object]:
    if payload.role not in RESQ_ROLES:
        raise HTTPException(status_code=400, detail=f"role must be one of {sorted(RESQ_ROLES)}")
    raw = new_raw_token()
    with engine.begin() as db:
        db.execute(
            text(
                "INSERT INTO resq_invites (email, role, scopes, token_hash, created_by, expires_at) "
                "VALUES (:email, :role, :scopes, :token_hash, :created_by, now() + interval '7 days')"
            ),
            {'email': payload.email.strip().lower(), 'role': payload.role, 'scopes': payload.scopes, 'token_hash': hash_token(raw), 'created_by': admin['id']},
        )
    write_audit_log(action='invite_created', entity_type='invite', entity_id=payload.email.strip().lower(), user_id=admin['id'], metadata={'role': payload.role})
    return {'token': raw, 'email': payload.email, 'role': payload.role, 'expires_in_days': 7}


@router.get("/invites")
def list_invites(_: dict = Depends(require_roles())) -> dict[str, object]:
    with engine.connect() as db:
        rows = db.execute(text("SELECT id, email, role, scopes, created_at, expires_at, accepted_at FROM resq_invites ORDER BY created_at DESC")).mappings().all()
    items = []
    for row in rows:
        status = 'accepted' if row['accepted_at'] else ('expired' if row['expires_at'] < datetime.now(timezone.utc) else 'pending')
        items.append({**dict(row), 'status': status})
    return {'items': items}


@router.post("/invites/{token}/accept")
def accept_invite(token: str, payload: InviteAcceptRequest) -> dict[str, object]:
    token_hash = hash_token(token)
    try:
        with engine.begin() as db:
            invite = db.execute(
                text("SELECT id, email, role, scopes FROM resq_invites WHERE token_hash=:h AND accepted_at IS NULL AND expires_at > now()"),
                {'h': token_hash},
            ).mappings().first()
            if not invite:
                raise HTTPException(status_code=400, detail='Invalid or expired invite')
            updated = db.execute(text("UPDATE resq_invites SET accepted_at=now() WHERE id=:id AND accepted_at IS NULL"), {'id': invite['id']})
            if updated.rowcount == 0:
                raise HTTPException(status_code=400, detail='Invalid or expired invite')
            home_state = invite['scopes'][0] if invite['scopes'] else None
            user_id = db.execute(
                text(
                    "INSERT INTO resq_users (email, name, password_hash, role, password_algo, home_state) "
                    "VALUES (:email, :name, :hash, :role, 'argon2', :home_state) RETURNING id"
                ),
                {'email': invite['email'], 'name': invite['email'].split('@')[0], 'hash': hash_password_argon2(payload.password), 'role': invite['role'], 'home_state': home_state},
            ).scalar()
            for state in invite['scopes']:
                db.execute(text("INSERT INTO resq_user_scopes (user_id, state) VALUES (:uid, :state) ON CONFLICT DO NOTHING"), {'uid': user_id, 'state': state})
    except IntegrityError as exc:
        raise HTTPException(status_code=400, detail='An account for this email already exists') from exc
    write_audit_log(action='invite_accepted', entity_type='invite', entity_id=invite['email'], user_id=user_id)
    return {'status': 'account_created'}


# ---------- admin-initiated password reset ----------

@router.post("/password-reset/admin-initiate", dependencies=[Depends(require_csrf)])
def admin_initiate_reset(payload: AdminPasswordResetRequest, admin: dict = Depends(require_roles())) -> dict[str, object]:
    raw = new_raw_token()
    with engine.begin() as db:
        exists = db.execute(text("SELECT 1 FROM resq_users WHERE id=:id"), {'id': payload.user_id}).first()
        if not exists:
            raise HTTPException(status_code=404, detail='No such user')
        db.execute(
            text(
                "INSERT INTO resq_password_resets (user_id, token_hash, created_by, expires_at) "
                "VALUES (:uid, :h, :admin_id, now() + interval '24 hours')"
            ),
            {'uid': payload.user_id, 'h': hash_token(raw), 'admin_id': admin['id']},
        )
    write_audit_log(action='password_reset_admin_initiated', entity_type='session', entity_id=str(payload.user_id), user_id=admin['id'])
    return {'token': raw, 'expires_in_hours': 24}


@router.post("/password-reset/{token}/complete")
def complete_reset(token: str, payload: PasswordResetCompleteRequest) -> dict[str, str]:
    token_hash = hash_token(token)
    with engine.begin() as db:
        reset = db.execute(
            text("SELECT id, user_id FROM resq_password_resets WHERE token_hash=:h AND used_at IS NULL AND expires_at > now()"),
            {'h': token_hash},
        ).mappings().first()
        if not reset:
            raise HTTPException(status_code=400, detail='Invalid or expired reset link')
        updated = db.execute(text("UPDATE resq_password_resets SET used_at=now() WHERE id=:id AND used_at IS NULL"), {'id': reset['id']})
        if updated.rowcount == 0:
            raise HTTPException(status_code=400, detail='Invalid or expired reset link')
        db.execute(
            text("UPDATE resq_users SET password_hash=:hash, password_algo='argon2' WHERE id=:id"),
            {'hash': hash_password_argon2(payload.password), 'id': reset['user_id']},
        )
    write_audit_log(action='password_reset_completed', entity_type='session', entity_id=str(reset['user_id']), user_id=reset['user_id'])
    return {'status': 'password_updated'}


# ---------- audit log (admin-only read) ----------

@router.get("/audit-log")
def read_audit_log(
    admin: dict = Depends(require_roles()),
    user_id: int | None = None,
    action: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict[str, object]:
    clauses, params = [], {'limit': min(limit, 200), 'offset': offset}
    if user_id is not None:
        clauses.append('user_id=:user_id')
        params['user_id'] = user_id
    if action is not None:
        clauses.append('action=:action')
        params['action'] = action
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ''
    with engine.connect() as db:
        rows = db.execute(
            text(f"SELECT id, occurred_at, user_id, device_id, action, previous_state, entity_type, entity_id, metadata FROM resq_audit_log {where} ORDER BY occurred_at DESC, id DESC LIMIT :limit OFFSET :offset"),
            params,
        ).mappings().all()
    return {'items': [dict(row) for row in rows]}
