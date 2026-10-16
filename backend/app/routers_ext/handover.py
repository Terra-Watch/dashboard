from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..core.permissions import require_scope, user_scopes
from ..core.security import current_redesign_user, require_csrf
from ..database.session import engine
from ..services import audit_log

router = APIRouter(prefix='/api/handover', tags=['handover'])
STAFF = {'admin', 'control_room_operator', 'incident_commander'}


class NoteRequest(BaseModel):
    state: str = Field(min_length=2, max_length=2)
    body: str = Field(min_length=1, max_length=2000)
    incident_id: int | None = None


def staff(user: dict = Depends(current_redesign_user)) -> dict:
    if user.get('role') not in STAFF:
        raise HTTPException(status_code=403, detail='Control Room access required')
    return user


@router.get('/notes')
def list_notes(user: dict = Depends(staff), limit: int = 50) -> dict:
    limit = max(1, min(limit, 200))
    clause, params = '', {'limit': limit}
    if user.get('role') != 'admin':
        scopes = user_scopes(int(user['id']))
        if not scopes:
            return {'items': []}
        clause, params['scopes'] = 'WHERE n.state = ANY(:scopes)', list(scopes)
    with engine.connect() as db:
        rows = db.execute(text(f'''SELECT n.id,n.state,n.body,n.incident_id,n.created_at,n.acknowledged_at,a.name AS author_name,k.name AS acknowledged_by_name
            FROM resq_handover_notes n JOIN resq_users a ON a.id=n.author_id LEFT JOIN resq_users k ON k.id=n.acknowledged_by
            {clause} ORDER BY n.created_at DESC LIMIT :limit'''), params).mappings().all()
    return {'items': [dict(row) for row in rows]}


@router.post('/notes', status_code=201, dependencies=[Depends(require_csrf)])
def add_note(payload: NoteRequest, user: dict = Depends(staff)) -> dict:
    state = payload.state.upper()
    require_scope(user, state, entity_type='handover', entity_id=state)
    with engine.begin() as db:
        if payload.incident_id is not None:
            incident = db.execute(text('SELECT state FROM resq_incidents WHERE id=:i'), {'i': payload.incident_id}).mappings().first()
            if not incident or incident['state'] != state:
                raise HTTPException(status_code=422, detail='That incident is not in this state')
        row = db.execute(text('INSERT INTO resq_handover_notes (author_id,state,body,incident_id) VALUES (:a,:s,:b,:i) RETURNING id,state,body,incident_id,created_at'),
                         {'a': user['id'], 's': state, 'b': payload.body.strip(), 'i': payload.incident_id}).mappings().one()
        audit_log.write_audit_log(action='handover_note_added', entity_type='handover', entity_id=str(row['id']), user_id=int(user['id']), metadata={'state': state}, connection=db)
    return {'note': dict(row)}


@router.post('/notes/{note_id}/acknowledge', dependencies=[Depends(require_csrf)])
def acknowledge(note_id: int, user: dict = Depends(staff)) -> dict:
    with engine.begin() as db:
        note = db.execute(text('SELECT id,state,author_id,acknowledged_at FROM resq_handover_notes WHERE id=:id FOR UPDATE'), {'id': note_id}).mappings().first()
        if not note:
            raise HTTPException(status_code=404, detail='Note not found')
        require_scope(user, note['state'], entity_type='handover', entity_id=str(note_id))
        if note['author_id'] == int(user['id']):
            raise HTTPException(status_code=409, detail='The next shift acknowledges a note, not its author')
        if note['acknowledged_at'] is None:
            db.execute(text('UPDATE resq_handover_notes SET acknowledged_by=:u, acknowledged_at=now() WHERE id=:id'), {'u': user['id'], 'id': note_id})
            audit_log.write_audit_log(action='handover_note_acknowledged', entity_type='handover', entity_id=str(note_id), user_id=int(user['id']), connection=db)
    return {'status': 'acknowledged'}
