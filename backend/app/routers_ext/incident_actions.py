"""Staff actions on an incident that talk to the reporter or tidy duplicates: ask a question, merge into another incident. Plus the reporter's side of the question."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..core.permissions import require_scope
from ..core.security import current_redesign_user, current_risk_user, require_csrf
from ..database.session import engine
from ..services import audit_log
from ..services.alert_service import generate_alert

router = APIRouter(prefix='/api', tags=['incident-actions'])
OPERATORS = {'admin', 'control_room_operator', 'incident_commander'}


class QuestionRequest(BaseModel):
    question: str = Field(min_length=5, max_length=300)


class AnswerRequest(BaseModel):
    answer: str = Field(min_length=1, max_length=1000)


class MergeRequest(BaseModel):
    into: int


def _operator(user: dict) -> None:
    if user.get('role') not in OPERATORS:
        raise HTTPException(status_code=403, detail='Control Room role required')


@router.post('/incidents/{incident_id}/question', status_code=201, dependencies=[Depends(require_csrf)])
def ask_reporter(incident_id: int, payload: QuestionRequest, user: dict = Depends(current_risk_user)) -> dict:
    """"Needs more information": a short question the reporter sees in their inbox and on their report. Plain words only; nothing about the AI check."""
    _operator(user)
    with engine.begin() as db:
        inc = db.execute(text('SELECT id,state,reporter_id,status FROM resq_incidents WHERE id=:i'), {'i': incident_id}).mappings().first()
        if not inc:
            raise HTTPException(status_code=404, detail='Incident not found')
        require_scope(user, inc['state'], entity_type='incident', entity_id=str(incident_id))
        if inc['status'] == 'closed':
            raise HTTPException(status_code=409, detail='This incident is closed')
        qid = db.execute(text('INSERT INTO resq_incident_questions (incident_id,asked_by,question) VALUES (:i,:u,:q) RETURNING id'),
                         {'i': incident_id, 'u': int(user['id']), 'q': payload.question.strip()}).scalar()
        audit_log.write_audit_log(action='incident_question_asked', entity_type='incident', entity_id=str(incident_id), user_id=int(user['id']), metadata={'question_id': int(qid)}, connection=db)
    generate_alert(kind='report_question', message=f'Officials have a question about your report #{incident_id}. Open it to answer.', state=inc['state'], severity='info',
                   entity_type='incident', entity_id=str(incident_id), user_id=int(inc['reporter_id']))
    return {'id': qid}


@router.get('/incidents/{incident_id}/questions')
def incident_questions(incident_id: int, user: dict = Depends(current_risk_user)) -> dict:
    _operator(user)
    with engine.connect() as db:
        inc = db.execute(text('SELECT state FROM resq_incidents WHERE id=:i'), {'i': incident_id}).mappings().first()
        if not inc:
            raise HTTPException(status_code=404, detail='Incident not found')
        require_scope(user, inc['state'], entity_type='incident', entity_id=str(incident_id))
        rows = db.execute(text('SELECT id,question,asked_at,answer,answered_at FROM resq_incident_questions WHERE incident_id=:i ORDER BY asked_at'), {'i': incident_id}).mappings().all()
    return {'items': [dict(r) for r in rows]}


@router.get('/citizen/reports/{report_id}/questions')
def my_report_questions(report_id: int, user: dict = Depends(current_redesign_user)) -> dict:
    if user.get('role') != 'citizen':
        raise HTTPException(status_code=403, detail='Citizen account required')
    with engine.connect() as db:
        if not db.execute(text('SELECT 1 FROM resq_incidents WHERE id=:i AND reporter_id=:u'), {'i': report_id, 'u': user['id']}).first():
            raise HTTPException(status_code=404, detail='Report not found')
        rows = db.execute(text('SELECT id,question,asked_at,answer,answered_at FROM resq_incident_questions WHERE incident_id=:i ORDER BY asked_at'), {'i': report_id}).mappings().all()
    return {'items': [dict(r) for r in rows]}


@router.post('/citizen/reports/{report_id}/questions/{question_id}/answer', dependencies=[Depends(require_csrf)])
def answer_question(report_id: int, question_id: int, payload: AnswerRequest, user: dict = Depends(current_redesign_user)) -> dict:
    if user.get('role') != 'citizen':
        raise HTTPException(status_code=403, detail='Citizen account required')
    with engine.begin() as db:
        if not db.execute(text('SELECT 1 FROM resq_incidents WHERE id=:i AND reporter_id=:u'), {'i': report_id, 'u': user['id']}).first():
            raise HTTPException(status_code=404, detail='Report not found')
        done = db.execute(text('UPDATE resq_incident_questions SET answer=:a,answered_at=now() WHERE id=:q AND incident_id=:i AND answer IS NULL'),
                          {'a': payload.answer.strip(), 'q': question_id, 'i': report_id}).rowcount
        if not done:
            raise HTTPException(status_code=409, detail='This question was already answered')
        audit_log.write_audit_log(action='incident_question_answered', entity_type='incident', entity_id=str(report_id), user_id=int(user['id']), metadata={'question_id': question_id}, connection=db)
    return {'thanks': True}


@router.post('/incidents/{incident_id}/merge', dependencies=[Depends(require_csrf)])
def merge_incident(incident_id: int, payload: MergeRequest, user: dict = Depends(current_risk_user)) -> dict:
    """Mark an incident as the same event as another one: its photos move across, it is closed as a duplicate, and nothing is deleted."""
    _operator(user)
    if payload.into == incident_id:
        raise HTTPException(status_code=422, detail='An incident cannot be merged into itself')
    with engine.begin() as db:
        rows = {r['id']: r for r in db.execute(text('SELECT id,state,status FROM resq_incidents WHERE id IN (:a,:b) FOR UPDATE'), {'a': incident_id, 'b': payload.into}).mappings().all()}
        if incident_id not in rows or payload.into not in rows:
            raise HTTPException(status_code=404, detail='Incident not found')
        for row in rows.values():
            require_scope(user, row['state'], entity_type='incident', entity_id=str(row['id']))
        if rows[incident_id]['status'] == 'closed' or rows[payload.into]['status'] == 'closed':
            raise HTTPException(status_code=409, detail='Both incidents must be open')
        moved = db.execute(text('''UPDATE resq_incident_images g SET incident_id=:into WHERE g.incident_id=:src
            AND NOT EXISTS (SELECT 1 FROM resq_incident_images x WHERE x.incident_id=:into AND x.sha256=g.sha256)'''), {'src': incident_id, 'into': payload.into}).rowcount
        db.execute(text("UPDATE resq_incidents SET status='closed',close_reason='duplicate',merged_into=:into,updated_at=now() WHERE id=:src"), {'src': incident_id, 'into': payload.into})
        db.execute(text("UPDATE resq_notices SET status='withdrawn',withdrawn_at=now(),withdrawn_reason='The incident was merged into another',updated_at=now() WHERE incident_id=:src AND status='published'"), {'src': incident_id})
        audit_log.write_audit_log(action='incident_merged', entity_type='incident', entity_id=str(incident_id), user_id=int(user['id']), metadata={'into': payload.into, 'photos_moved': moved}, connection=db)
    return {'merged_into': payload.into, 'photos_moved': moved}
