"""Administrator tools: who has access, which states they cover, invitations, access requests. Administrators only."""
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..core.security import RESQ_ROLES, require_csrf, require_roles
from ..database.session import engine
from ..services import audit_log

router = APIRouter(prefix='/api/admin', tags=['admin'])


class ScopesRequest(BaseModel):
    states: list[str] = Field(max_length=40)


@router.get('/people')
def people(admin: dict = Depends(require_roles())) -> dict:
    with engine.connect() as db:
        users = db.execute(text('''SELECT u.id,u.name,u.email,u.role,u.created_at,u.deactivated_at,
              COALESCE((SELECT array_agg(s.state ORDER BY s.state) FROM resq_user_scopes s WHERE s.user_id=u.id),'{}') AS scopes
            FROM resq_users u WHERE u.role = ANY(:roles) ORDER BY u.deactivated_at IS NOT NULL, u.name'''), {'roles': sorted(RESQ_ROLES)}).mappings().all()
        citizens = db.execute(text("SELECT count(*) FROM resq_users WHERE role='citizen' AND deleted_at IS NULL")).scalar() or 0
        invites = db.execute(text('''SELECT id,email,role,scopes,created_at,expires_at FROM resq_invites
            WHERE accepted_at IS NULL AND expires_at > now() ORDER BY created_at DESC''')).mappings().all()
        requests = db.execute(text('''SELECT id,name,designation,department,email,state,reason,created_at FROM resq_access_requests
            WHERE handled_at IS NULL ORDER BY created_at DESC LIMIT 100''')).mappings().all()
    return {'staff': [dict(u) for u in users], 'citizens': int(citizens), 'invites': [dict(i) for i in invites], 'requests': [dict(r) for r in requests]}


def _active_admins(db) -> int:
    return int(db.execute(text("SELECT count(*) FROM resq_users WHERE role='admin' AND deactivated_at IS NULL")).scalar() or 0)


@router.post('/people/{user_id}/deactivate', dependencies=[Depends(require_csrf)])
def deactivate(user_id: int, admin: dict = Depends(require_roles())) -> dict:
    if user_id == int(admin['id']):
        raise HTTPException(status_code=409, detail='You cannot deactivate your own account')
    with engine.begin() as db:
        target = db.execute(text('SELECT id,role,deactivated_at FROM resq_users WHERE id=:i FOR UPDATE'), {'i': user_id}).mappings().first()
        if not target or target['role'] not in RESQ_ROLES:
            raise HTTPException(status_code=404, detail='No such staff account')
        if target['deactivated_at'] is None:
            if target['role'] == 'admin' and _active_admins(db) <= 1:
                raise HTTPException(status_code=409, detail='This is the last active administrator')
            db.execute(text('UPDATE resq_users SET deactivated_at=now() WHERE id=:i'), {'i': user_id})
            db.execute(text('UPDATE resq_refresh_tokens SET revoked_at=now() WHERE user_id=:i AND revoked_at IS NULL'), {'i': user_id})
            audit_log.write_audit_log(action='staff_deactivated', entity_type='user', entity_id=str(user_id), user_id=int(admin['id']), connection=db)
    return {'deactivated': True}


@router.post('/people/{user_id}/reactivate', dependencies=[Depends(require_csrf)])
def reactivate(user_id: int, admin: dict = Depends(require_roles())) -> dict:
    with engine.begin() as db:
        changed = db.execute(text("UPDATE resq_users SET deactivated_at=NULL WHERE id=:i AND role = ANY(:roles) AND deactivated_at IS NOT NULL"), {'i': user_id, 'roles': sorted(RESQ_ROLES)}).rowcount
        if changed:
            audit_log.write_audit_log(action='staff_reactivated', entity_type='user', entity_id=str(user_id), user_id=int(admin['id']), connection=db)
    return {'reactivated': bool(changed)}


@router.put('/people/{user_id}/scopes', dependencies=[Depends(require_csrf)])
def set_scopes(user_id: int, payload: ScopesRequest, admin: dict = Depends(require_roles())) -> dict:
    states = sorted({s.strip().upper() for s in payload.states})
    if any(not re.fullmatch(r'[A-Z]{2}', s) for s in states):
        raise HTTPException(status_code=422, detail='Scopes are two-letter state codes')
    with engine.begin() as db:
        target = db.execute(text('SELECT id,role FROM resq_users WHERE id=:i FOR UPDATE'), {'i': user_id}).mappings().first()
        if not target or target['role'] not in RESQ_ROLES:
            raise HTTPException(status_code=404, detail='No such staff account')
        if target['role'] != 'admin' and not states:
            raise HTTPException(status_code=422, detail='Choose at least one state')
        before = list(db.execute(text('SELECT state FROM resq_user_scopes WHERE user_id=:i ORDER BY state'), {'i': user_id}).scalars().all())
        db.execute(text('DELETE FROM resq_user_scopes WHERE user_id=:i'), {'i': user_id})
        for state in states:
            db.execute(text('INSERT INTO resq_user_scopes (user_id,state) VALUES (:i,:s)'), {'i': user_id, 's': state})
        db.execute(text('UPDATE resq_users SET home_state=:h WHERE id=:i'), {'i': user_id, 'h': states[0] if states else None})
        audit_log.write_audit_log(action='staff_scopes_changed', entity_type='user', entity_id=str(user_id), user_id=int(admin['id']), metadata={'before': before, 'after': states}, connection=db)
    return {'states': states}


@router.post('/access-requests/{request_id}/handled', dependencies=[Depends(require_csrf)])
def mark_handled(request_id: int, admin: dict = Depends(require_roles())) -> dict:
    with engine.begin() as db:
        changed = db.execute(text('UPDATE resq_access_requests SET handled_at=now(), handled_by=:a WHERE id=:i AND handled_at IS NULL'), {'a': int(admin['id']), 'i': request_id}).rowcount
    if not changed:
        raise HTTPException(status_code=404, detail='No open request with that number')
    return {'handled': True}
