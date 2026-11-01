"""The photo library: photos citizens allowed TerraWatch to keep, labelled by staff, to test and improve the photo check.
A citizen can take permission back at any time (the labels go with it). Nothing here shows a photo to anyone but staff in scope, and the export removes all hidden data."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text

from ..core.permissions import user_scopes
from ..core.security import current_redesign_user, require_csrf
from ..database.session import engine
from ..services import audit_log

router = APIRouter(prefix='/api', tags=['photo-library'])
STAFF = {'admin', 'control_room_operator', 'incident_commander'}
TARGET_PHOTOS = 200


class Labels(BaseModel):
    scene: Literal['fire', 'smoke', 'fire_and_smoke', 'lookalike', 'nothing']
    origin: Literal['camera', 'edited', 'generated', 'screenshot']


class Allow(BaseModel):
    allow: bool


def _staff(user: dict) -> None:
    if user.get('role') not in STAFF:
        raise HTTPException(status_code=403, detail='Control Room role required')


def _scope_sql(user: dict) -> tuple[str, dict]:
    if user.get('role') == 'admin':
        return 'TRUE', {}
    return 'i.state = ANY(CAST(:states AS text[]))', {'states': sorted(user_scopes(int(user['id'])))}


@router.get('/photo-library')
def library(status: Literal['unlabeled', 'labeled', 'all'] = 'unlabeled', limit: int = Query(30, ge=1, le=100), user: dict = Depends(current_redesign_user)) -> dict:
    _staff(user)
    scope, params = _scope_sql(user)
    where = {'unlabeled': 'g.research_scene IS NULL', 'labeled': 'g.research_scene IS NOT NULL', 'all': 'TRUE'}[status]
    with engine.connect() as db:
        rows = db.execute(text(f'''SELECT g.id,g.incident_id,g.created_at,g.research_scene AS scene,g.research_origin AS origin FROM resq_incident_images g JOIN resq_incidents i ON i.id=g.incident_id
            WHERE g.research_consent AND {scope} AND {where} ORDER BY g.created_at DESC LIMIT :n'''), {**params, 'n': limit}).mappings().all()
    return {'items': [dict(r) for r in rows]}


@router.get('/photo-library/stats')
def stats(user: dict = Depends(current_redesign_user)) -> dict:
    _staff(user)
    scope, params = _scope_sql(user)
    with engine.connect() as db:
        rows = db.execute(text(f'''SELECT g.research_origin AS origin, g.research_scene AS scene, count(*) AS n FROM resq_incident_images g JOIN resq_incidents i ON i.id=g.incident_id
            WHERE g.research_consent AND {scope} GROUP BY 1,2'''), params).mappings().all()
    total = sum(r['n'] for r in rows); labeled = sum(r['n'] for r in rows if r['scene'])
    return {'total': total, 'labeled': labeled, 'target': TARGET_PHOTOS, 'by_origin': {r['origin']: int(r['n']) for r in rows if r['origin']}}


@router.put('/photo-library/{image_id}/labels', dependencies=[Depends(require_csrf)])
def label(image_id: int, payload: Labels, user: dict = Depends(current_redesign_user)) -> dict:
    _staff(user)
    scope, params = _scope_sql(user)
    with engine.begin() as db:
        row = db.execute(text(f'SELECT g.id FROM resq_incident_images g JOIN resq_incidents i ON i.id=g.incident_id WHERE g.id=:g AND g.research_consent AND {scope} FOR UPDATE OF g'), {**params, 'g': image_id}).first()
        if not row:
            raise HTTPException(status_code=404, detail='Photo not found, or its owner has not agreed to share it')
        db.execute(text('UPDATE resq_incident_images SET research_scene=:s,research_origin=:o,research_labeled_by=:u,research_labeled_at=now() WHERE id=:g'),
                   {'s': payload.scene, 'o': payload.origin, 'u': int(user['id']), 'g': image_id})
        audit_log.write_audit_log(action='photo_library_labeled', entity_type='incident_image', entity_id=str(image_id), user_id=int(user['id']), metadata=payload.model_dump(), connection=db)
    return {'id': image_id, **payload.model_dump()}


@router.put('/citizen/photos/{image_id}/research', dependencies=[Depends(require_csrf)])
def allow_research(image_id: int, payload: Allow, user: dict = Depends(current_redesign_user)) -> dict:
    """The owner's own switch: agree, or take the agreement back (the labels are removed with it)."""
    if user.get('role') != 'citizen':
        raise HTTPException(status_code=403, detail='Citizen account required')
    with engine.begin() as db:
        done = db.execute(text('''UPDATE resq_incident_images g SET research_consent=:a,
              research_scene=CASE WHEN :a THEN research_scene END, research_origin=CASE WHEN :a THEN research_origin END,
              research_labeled_by=CASE WHEN :a THEN research_labeled_by END, research_labeled_at=CASE WHEN :a THEN research_labeled_at END
            FROM resq_incidents i WHERE i.id=g.incident_id AND g.id=:g AND i.reporter_id=:u'''), {'a': payload.allow, 'g': image_id, 'u': int(user['id'])}).rowcount
        if not done:
            raise HTTPException(status_code=404, detail='Photo not found')
        audit_log.write_audit_log(action='photo_research_consent', entity_type='incident_image', entity_id=str(image_id), user_id=int(user['id']), metadata={'allow': payload.allow}, connection=db)
    return {'allow': payload.allow}
