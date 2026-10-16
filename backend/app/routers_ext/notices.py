"""Official notices with two-person approval (D-09). Raw SQL, CSRF on writes, every transition audited.

Region codes are state codes ("OD") or district codes prefixed by the state ("OD-KHU"). A notice for "OD" covers every OD district.
Expiry is computed at read time; there is no job.
"""
import json
import re
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text

from ..core.permissions import user_scopes
from ..core.security import current_redesign_user, require_csrf, require_roles
from ..database.session import engine
from ..services import audit_log

router = APIRouter(prefix='/api/notices', tags=['notices'])
AUTHOR_ROLES = ('control_room_operator', 'incident_commander')  # admin is always allowed by require_roles
APPROVER_ROLES = {'admin', 'incident_commander'}
STAFF_ROLES = {'admin', 'control_room_operator', 'incident_commander'}
REGION_RE = re.compile(r'^[A-Z0-9]{1,8}(-[A-Z0-9_]{1,16})?$')
COLUMNS = ('id,title,body,severity,regions,area_geojson,starts_at,expires_at,status,author_id,approver_id,return_reason,created_at,updated_at,'
           'published_at,withdrawn_at,withdrawn_reason,(status=\'published\' AND expires_at<=now()) AS expired')
PUBLIC_FIELDS = ('id', 'title', 'body', 'severity', 'regions', 'area_geojson', 'starts_at', 'expires_at', 'published_at')


def _regions(values: list[str]) -> list[str]:
    cleaned = sorted({v.strip().upper() for v in values})
    if not cleaned or any(not REGION_RE.match(v) for v in cleaned):
        raise ValueError('regions must be state or district codes such as OD or OD-KHU')
    return cleaned


class NoticeCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=1000)
    severity: Literal['info', 'advisory', 'warning']
    regions: list[str] = Field(min_length=1, max_length=50)
    area_geojson: dict | None = None
    starts_at: datetime
    expires_at: datetime

    @field_validator('regions')
    @classmethod
    def _check_regions(cls, v):
        return _regions(v)

    @field_validator('title', 'body')
    @classmethod
    def _strip(cls, v):
        v = v.strip()
        if not v:
            raise ValueError('must not be blank')
        return v


class NoticeEdit(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=120)
    body: str | None = Field(None, min_length=1, max_length=1000)
    severity: Literal['info', 'advisory', 'warning'] | None = None
    regions: list[str] | None = Field(None, min_length=1, max_length=50)
    area_geojson: dict | None = None
    starts_at: datetime | None = None
    expires_at: datetime | None = None

    @field_validator('regions')
    @classmethod
    def _check_regions(cls, v):
        return None if v is None else _regions(v)


class ReasonRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)

    @field_validator('reason')
    @classmethod
    def _strip(cls, v):
        v = v.strip()
        if not v:
            raise ValueError('reason is required')
        return v


def _aware(*values: datetime | None) -> None:
    for v in values:
        if v is not None and v.tzinfo is None:
            raise HTTPException(status_code=422, detail='timestamps must include a timezone')


def _states(regions) -> set[str]:
    return {r.split('-')[0] for r in regions}


def _require_region_scope(user: dict, regions) -> None:
    if user['role'] == 'admin':
        return
    outside = _states(regions) - user_scopes(int(user['id']))
    if outside:
        raise HTTPException(status_code=403, detail="This is outside your division's scope")


def _lock(db, notice_id: int) -> dict:
    row = db.execute(text(f'SELECT {COLUMNS} FROM resq_notices WHERE id=:id FOR UPDATE'), {'id': notice_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail='Notice not found')
    return dict(row)


def _revision(db, notice_id: int, row: dict, user_id: int) -> None:
    db.execute(text('''INSERT INTO resq_notice_revisions (notice_id,revision_no,title,body,severity,regions,edited_by)
        VALUES (:n,(SELECT COALESCE(MAX(revision_no),0)+1 FROM resq_notice_revisions WHERE notice_id=:n),:t,:b,:s,:r,:u)'''),
               {'n': notice_id, 't': row['title'], 'b': row['body'], 's': row['severity'], 'r': list(row['regions']), 'u': user_id})


def _audit(db, action: str, row: dict, user: dict, previous: str | None, extra: dict | None = None) -> None:
    audit_log.write_audit_log(action=action, entity_type='notice', entity_id=str(row['id']), user_id=int(user['id']), previous_state=previous,
                              metadata={'status': row['status'], 'regions': list(row['regions']), **(extra or {})}, connection=db)


def _fetch(db, notice_id: int) -> dict:
    return dict(db.execute(text(f'SELECT {COLUMNS} FROM resq_notices WHERE id=:id'), {'id': notice_id}).mappings().first())


@router.post('', status_code=201, dependencies=[Depends(require_csrf)])
def create_notice(payload: NoticeCreate, user: dict = Depends(require_roles(*AUTHOR_ROLES))) -> dict:
    _aware(payload.starts_at, payload.expires_at)
    if payload.expires_at <= payload.starts_at:
        raise HTTPException(status_code=422, detail='expires_at must be after starts_at')
    _require_region_scope(user, payload.regions)
    with engine.begin() as db:
        new_id = db.execute(text('''INSERT INTO resq_notices (title,body,severity,regions,area_geojson,starts_at,expires_at,author_id)
            VALUES (:t,:b,:s,:r,CAST(:g AS jsonb),:st,:ex,:a) RETURNING id'''),
                            {'t': payload.title, 'b': payload.body, 's': payload.severity, 'r': payload.regions,
                             'g': None if payload.area_geojson is None else json.dumps(payload.area_geojson),
                             'st': payload.starts_at, 'ex': payload.expires_at, 'a': int(user['id'])}).scalar()
        row = _fetch(db, new_id)
        _revision(db, new_id, row, int(user['id']))
        _audit(db, 'notice_created', row, user, None)
    return row


@router.patch('/{notice_id}', dependencies=[Depends(require_csrf)])
def edit_notice(notice_id: int, payload: NoticeEdit, user: dict = Depends(require_roles(*AUTHOR_ROLES))) -> dict:
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail='Nothing to change')
    for key in ('title', 'body', 'severity', 'regions', 'starts_at', 'expires_at'):
        if key in changes and changes[key] is None:
            raise HTTPException(status_code=422, detail=f'{key} cannot be null')
    _aware(changes.get('starts_at'), changes.get('expires_at'))
    with engine.begin() as db:
        row = _lock(db, notice_id)
        if row['author_id'] != int(user['id']) and user['role'] != 'admin':
            raise HTTPException(status_code=403, detail='Only the author can edit this notice')
        if row['status'] != 'draft':
            raise HTTPException(status_code=409, detail='Only a draft can be edited')
        merged = {**row, **changes}
        if merged['expires_at'] <= merged['starts_at']:
            raise HTTPException(status_code=422, detail='expires_at must be after starts_at')
        _require_region_scope(user, merged['regions'])
        db.execute(text('''UPDATE resq_notices SET title=:t,body=:b,severity=:s,regions=:r,area_geojson=CAST(:g AS jsonb),starts_at=:st,expires_at=:ex,
            return_reason=NULL,updated_at=now() WHERE id=:id'''),
                   {'t': merged['title'], 'b': merged['body'], 's': merged['severity'], 'r': list(merged['regions']),
                    'g': None if merged['area_geojson'] is None else json.dumps(merged['area_geojson']),
                    'st': merged['starts_at'], 'ex': merged['expires_at'], 'id': notice_id})
        updated = _fetch(db, notice_id)
        _revision(db, notice_id, updated, int(user['id']))
        _audit(db, 'notice_edited', updated, user, 'draft', {'fields': sorted(changes)})
    return updated


@router.post('/{notice_id}/submit', dependencies=[Depends(require_csrf)])
def submit_notice(notice_id: int, user: dict = Depends(require_roles(*AUTHOR_ROLES))) -> dict:
    with engine.begin() as db:
        row = _lock(db, notice_id)
        if row['author_id'] != int(user['id']) and user['role'] != 'admin':
            raise HTTPException(status_code=403, detail='Only the author can submit this notice')
        if row['status'] != 'draft':
            raise HTTPException(status_code=409, detail='Only a draft can be submitted')
        db.execute(text("UPDATE resq_notices SET status='pending_approval',updated_at=now() WHERE id=:id"), {'id': notice_id})
        updated = _fetch(db, notice_id)
        _audit(db, 'notice_submitted', updated, user, 'draft')
    return updated


def _approver(user: dict) -> None:
    if user['role'] not in APPROVER_ROLES:
        raise HTTPException(status_code=403, detail="Your role doesn't allow this")


@router.post('/{notice_id}/approve', dependencies=[Depends(require_csrf)])
def approve_notice(notice_id: int, user: dict = Depends(current_redesign_user)) -> dict:
    _approver(user)
    with engine.begin() as db:
        row = _lock(db, notice_id)
        if row['status'] != 'pending_approval':
            raise HTTPException(status_code=409, detail='Only a notice pending approval can be approved')
        if row['author_id'] == int(user['id']):
            raise HTTPException(status_code=403, detail='You cannot approve your own notice')
        _require_region_scope(user, row['regions'])
        db.execute(text("UPDATE resq_notices SET status='published',approver_id=:a,published_at=now(),updated_at=now(),return_reason=NULL WHERE id=:id"),
                   {'a': int(user['id']), 'id': notice_id})
        updated = _fetch(db, notice_id)
        _audit(db, 'notice_approved', updated, user, 'pending_approval', {'author_id': row['author_id']})
    return updated


@router.post('/{notice_id}/return', dependencies=[Depends(require_csrf)])
def return_notice(notice_id: int, payload: ReasonRequest, user: dict = Depends(current_redesign_user)) -> dict:
    _approver(user)
    with engine.begin() as db:
        row = _lock(db, notice_id)
        if row['status'] != 'pending_approval':
            raise HTTPException(status_code=409, detail='Only a notice pending approval can be returned')
        if row['author_id'] == int(user['id']):
            raise HTTPException(status_code=403, detail='You cannot review your own notice')
        _require_region_scope(user, row['regions'])
        db.execute(text("UPDATE resq_notices SET status='draft',return_reason=:r,updated_at=now() WHERE id=:id"), {'r': payload.reason, 'id': notice_id})
        updated = _fetch(db, notice_id)
        _audit(db, 'notice_returned', updated, user, 'pending_approval', {'reason': payload.reason})
    return updated


@router.post('/{notice_id}/withdraw', dependencies=[Depends(require_csrf)])
def withdraw_notice(notice_id: int, payload: ReasonRequest, user: dict = Depends(current_redesign_user)) -> dict:
    if user['role'] not in STAFF_ROLES:
        raise HTTPException(status_code=403, detail="Your role doesn't allow this")
    with engine.begin() as db:
        row = _lock(db, notice_id)
        if row['status'] != 'published':
            raise HTTPException(status_code=409, detail='Only a published notice can be withdrawn')
        _require_region_scope(user, row['regions'])
        db.execute(text("UPDATE resq_notices SET status='withdrawn',withdrawn_at=now(),withdrawn_reason=:r,updated_at=now() WHERE id=:id"),
                   {'r': payload.reason, 'id': notice_id})
        updated = _fetch(db, notice_id)
        _audit(db, 'notice_withdrawn', updated, user, 'published', {'reason': payload.reason})
    return updated


def _visible_clause(user: dict, region: str | None) -> tuple[str, dict]:
    """SQL condition and parameters for what this caller may read."""
    if user['role'] == 'admin':
        return 'TRUE', {}
    if user['role'] in STAFF_ROLES:
        return ("EXISTS (SELECT 1 FROM unnest(regions) r WHERE split_part(r,'-',1) = ANY(CAST(:states AS text[])))",
                {'states': sorted(user_scopes(int(user['id'])))})
    clause = "status='published' AND starts_at<=now() AND expires_at>now()"
    params: dict = {}
    if region:
        clause += ' AND (:region = ANY(regions) OR split_part(:region,\'-\',1) = ANY(regions))'
        params['region'] = region
    return clause, params


def _shape(row: dict, user: dict) -> dict:
    return dict(row) if user['role'] in STAFF_ROLES else {k: row[k] for k in PUBLIC_FIELDS}


@router.get('')
def list_notices(region: str | None = Query(None, max_length=30), status: Literal['draft', 'pending_approval', 'published', 'withdrawn'] | None = None,
                 limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0), user: dict = Depends(current_redesign_user)) -> dict:
    region = region.strip().upper() if region else None
    if region and not REGION_RE.match(region):
        raise HTTPException(status_code=422, detail='region must be a state or district code')
    clause, params = _visible_clause(user, region)
    if status and user['role'] in STAFF_ROLES:
        clause += ' AND status=:status'
        params['status'] = status
    with engine.connect() as db:
        rows = db.execute(text(f'SELECT {COLUMNS} FROM resq_notices WHERE {clause} ORDER BY created_at DESC,id DESC LIMIT :limit OFFSET :offset'),
                          {**params, 'limit': limit, 'offset': offset}).mappings().all()
    return {'items': [_shape(dict(r), user) for r in rows]}


@router.get('/{notice_id}/revisions')
def notice_revisions(notice_id: int, user: dict = Depends(require_roles(*AUTHOR_ROLES))) -> dict:
    clause, params = _visible_clause(user, None)
    with engine.connect() as db:
        if not db.execute(text(f'SELECT 1 FROM resq_notices WHERE id=:id AND {clause}'), {'id': notice_id, **params}).first():
            raise HTTPException(status_code=404, detail='Notice not found')
        rows = db.execute(text('SELECT revision_no,title,body,severity,regions,edited_by,created_at FROM resq_notice_revisions WHERE notice_id=:id ORDER BY revision_no'),
                          {'id': notice_id}).mappings().all()
    return {'items': [dict(r) for r in rows]}
