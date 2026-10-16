"""Scenario notes: a planner's inputs and results saved to the incident timeline.
A scenario is planning material. Saving one changes nothing about the incident and notifies no one."""
import json
import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..core.permissions import require_scope
from ..core.security import current_redesign_user, require_csrf
from ..database.session import engine
from ..services import audit_log

router = APIRouter(prefix='/api/ops', tags=['scenarios'])
STAFF = {'admin', 'control_room_operator', 'incident_commander'}
MAX_BYTES = 20_000


class ScenarioNote(BaseModel):
    inputs: dict
    results: dict
    note: str = Field('', max_length=1000)


@router.post('/incidents/{incident_id}/scenario-notes', status_code=201, dependencies=[Depends(require_csrf)])
def add_scenario_note(incident_id: int, payload: ScenarioNote, user: dict = Depends(current_redesign_user)) -> dict:
    if user.get('role') not in STAFF:
        raise HTTPException(status_code=403, detail='Control Room access required')
    if os.environ.get('SCENARIO_PLANNER_ENABLED', '').lower() != 'true':
        raise HTTPException(status_code=404, detail='Scenario planning is not switched on')
    if len(json.dumps({'i': payload.inputs, 'r': payload.results})) > MAX_BYTES:
        raise HTTPException(status_code=413, detail='Scenario note is too large')
    with engine.connect() as db:
        incident = db.execute(text('SELECT state,status FROM resq_incidents WHERE id=:i'), {'i': incident_id}).mappings().first()
    if not incident:
        raise HTTPException(status_code=404, detail='Incident not found')
    require_scope(user, incident['state'], entity_type='incident', entity_id=str(incident_id))
    audit_log.write_audit_log(action='scenario_note', entity_type='incident', entity_id=str(incident_id), user_id=int(user['id']),
                              metadata={'inputs': payload.inputs, 'results': payload.results, 'note': payload.note.strip()})
    return {'saved': True}
