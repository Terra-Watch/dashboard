"""Persistent incident assignment and Ranger verification workflow."""
from datetime import datetime
from io import BytesIO
import hashlib
import json
import re

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import text

from ..contracts.schemas import AssignmentDecisionRequest, AssignmentReassignmentRequest, IncidentAssignmentRequest, VerificationRequest
from ..core.permissions import require_scope, user_scopes
from ..core.security import current_redesign_user, current_risk_user, require_csrf, require_roles
from ..database.session import engine
from ..services import audit_log
from ..services.image_assessment import assess_image
from .operations import ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, _assert_stored_image_integrity, _image_row, _stored_image_path

router = APIRouter(prefix='/api', tags=['workflow'])
CONTROL_ROLES = {'admin', 'control_room_operator', 'incident_commander'}


def _control_user(user: dict = Depends(current_risk_user)) -> dict:
    if user.get('role') not in CONTROL_ROLES:
        raise HTTPException(status_code=403, detail='Control Room role required')
    return user


def _parse_timestamp(value: str) -> datetime:
    try:
        timestamp = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail='observed_at must be an ISO timestamp') from exc
    if timestamp.tzinfo is None:
        raise HTTPException(status_code=422, detail='observed_at must include a timezone')
    return timestamp


def _notify_users(*, user_ids: list[int], kind: str, message: str, state: str | None, entity_type: str, entity_id: str) -> None:
    """Create deduplicated in-app notifications after a successful workflow event."""
    from ..services.alert_service import generate_alert
    for recipient_id in sorted(set(user_ids)):
        generate_alert(kind=kind, message=message, state=state, severity='info', entity_type=entity_type, entity_id=entity_id, user_id=recipient_id)


@router.get('/control-room/rangers')
def eligible_rangers(user: dict = Depends(_control_user)) -> dict:
    with engine.connect() as db:
        rows = db.execute(text("SELECT id,name,email,home_state FROM resq_users WHERE role='field_crew' ORDER BY name")).mappings().all()
    scopes = None if user.get('role') == 'admin' else user_scopes(int(user['id']))
    items = [dict(row) for row in rows if scopes is None or row['home_state'] in scopes or row['home_state'] is None]
    return {'items': items}


@router.get('/control-room/incidents/{incident_id}/assignments')
def incident_assignments(incident_id: int, user: dict = Depends(_control_user)) -> dict:
    with engine.connect() as db:
        incident = db.execute(text('SELECT id,state FROM resq_incidents WHERE id=:id'), {'id': incident_id}).mappings().first()
        if not incident:
            raise HTTPException(status_code=404, detail='Incident not found')
        require_scope(user, incident['state'], entity_type='incident', entity_id=str(incident_id))
        rows = db.execute(text('''SELECT a.id,a.incident_id,a.ranger_id,a.status,a.created_at,a.updated_at,u.name AS ranger_name,u.email AS ranger_email
            FROM resq_incident_assignments a JOIN resq_users u ON u.id=a.ranger_id
            WHERE a.incident_id=:incident_id ORDER BY a.created_at DESC'''), {'incident_id': incident_id}).mappings().all()
        verifications = db.execute(text('''SELECT v.id,v.assignment_id,v.ranger_id,v.outcome,v.notes,v.observed_at,v.created_at,u.name AS ranger_name
            FROM resq_field_verifications v JOIN resq_users u ON u.id=v.ranger_id
            WHERE v.assignment_id IN (SELECT id FROM resq_incident_assignments WHERE incident_id=:incident_id)
            ORDER BY v.created_at DESC'''), {'incident_id': incident_id}).mappings().all()
    return {'assignments': [dict(row) for row in rows], 'verifications': [dict(row) for row in verifications]}


@router.post('/control-room/incidents/{incident_id}/assignments', status_code=201, dependencies=[Depends(require_csrf)])
def create_assignment(incident_id: int, payload: IncidentAssignmentRequest, user: dict = Depends(_control_user)) -> dict:
    with engine.begin() as db:
        incident = db.execute(text('SELECT id,state FROM resq_incidents WHERE id=:id FOR UPDATE'), {'id': incident_id}).mappings().first()
        if not incident:
            raise HTTPException(status_code=404, detail='Incident not found')
        require_scope(user, incident['state'], entity_type='incident', entity_id=str(incident_id))
        ranger = db.execute(text("SELECT id,name,email,home_state FROM resq_users WHERE id=:id AND role='field_crew'"), {'id': payload.ranger_id}).mappings().first()
        if not ranger:
            raise HTTPException(status_code=422, detail='Assignee is not an eligible Ranger')
        if ranger['home_state'] and ranger['home_state'] != incident['state'] and user.get('role') != 'admin':
            raise HTTPException(status_code=403, detail='Ranger is outside the incident state scope')
        existing = db.execute(text("SELECT id,status FROM resq_incident_assignments WHERE incident_id=:incident_id AND status IN ('assigned','accepted','in_progress') FOR UPDATE"), {'incident_id': incident_id}).mappings().first()
        if existing:
            raise HTTPException(status_code=409, detail='Incident already has an active assignment')
        due_at = _parse_timestamp(payload.due_at) if payload.due_at else None
        row = db.execute(text('''INSERT INTO resq_incident_assignments (incident_id,ranger_id,created_by,priority,due_at)
            VALUES (:incident_id,:ranger_id,:created_by,:priority,:due_at) RETURNING id,incident_id,ranger_id,status,priority,due_at,created_at,updated_at'''), {'incident_id': incident_id, 'ranger_id': payload.ranger_id, 'created_by': user['id'], 'priority': payload.priority, 'due_at': due_at}).mappings().one()
        audit_log.write_audit_log(action='incident_assigned', entity_type='incident_assignment', entity_id=str(row['id']), user_id=int(user['id']), metadata={'incident_id': incident_id, 'ranger_id': payload.ranger_id}, connection=db)
    _notify_users(user_ids=[payload.ranger_id], kind='assignment_created', message=f'Incident #{incident_id} was assigned to you.', state=incident['state'], entity_type='incident_assignment', entity_id=str(row['id']))
    return {'assignment': dict(row)}


@router.patch('/control-room/incidents/{incident_id}/assignments/{assignment_id}', status_code=200, dependencies=[Depends(require_csrf)])
def reassign_incident(incident_id: int, assignment_id: int, payload: AssignmentReassignmentRequest, user: dict = Depends(_control_user)) -> dict:
    with engine.begin() as db:
        incident = db.execute(text('SELECT id,state FROM resq_incidents WHERE id=:id FOR UPDATE'), {'id': incident_id}).mappings().first()
        if not incident:
            raise HTTPException(status_code=404, detail='Incident not found')
        require_scope(user, incident['state'], entity_type='incident', entity_id=str(incident_id))
        ranger = db.execute(text("SELECT id FROM resq_users WHERE id=:id AND role='field_crew'"), {'id': payload.ranger_id}).scalar()
        if not ranger:
            raise HTTPException(status_code=422, detail='Assignee is not an eligible Ranger')
        current = db.execute(text("SELECT id,status FROM resq_incident_assignments WHERE id=:id AND incident_id=:incident_id FOR UPDATE"), {'id': assignment_id, 'incident_id': incident_id}).mappings().first()
        if not current or current['status'] in {'completed', 'cancelled'}:
            raise HTTPException(status_code=409, detail='Assignment cannot be reassigned')
        db.execute(text("UPDATE resq_incident_assignments SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE id=:id"), {'id': assignment_id})
        due_at = _parse_timestamp(payload.due_at) if payload.due_at else None
        row = db.execute(text('''INSERT INTO resq_incident_assignments (incident_id,ranger_id,created_by,priority,due_at)
            VALUES (:incident_id,:ranger_id,:created_by,:priority,:due_at) RETURNING id,incident_id,ranger_id,status,priority,due_at,created_at,updated_at'''), {'incident_id': incident_id, 'ranger_id': payload.ranger_id, 'created_by': user['id'], 'priority': payload.priority, 'due_at': due_at}).mappings().one()
        audit_log.write_audit_log(action='incident_reassigned', entity_type='incident_assignment', entity_id=str(row['id']), user_id=int(user['id']), metadata={'incident_id': incident_id, 'previous_assignment_id': assignment_id, 'ranger_id': payload.ranger_id}, connection=db)
    _notify_users(user_ids=[payload.ranger_id], kind='assignment_reassigned', message=f'Incident #{incident_id} was reassigned to you.', state=incident['state'], entity_type='incident_assignment', entity_id=str(row['id']))
    return {'assignment': dict(row)}


@router.get('/ranger/assignments')
def ranger_assignments(user: dict = Depends(require_roles('field_crew'))) -> dict:
    with engine.connect() as db:
        rows = db.execute(text('''SELECT a.id AS assignment_id,a.incident_id,a.status,a.priority,a.due_at,a.created_at,a.updated_at,
            i.source,i.size,i.notes,i.state,i.latitude,i.longitude,i.observed_at
            FROM resq_incident_assignments a JOIN resq_incidents i ON i.id=a.incident_id
            WHERE a.ranger_id=:ranger_id AND a.status IN ('assigned','accepted','in_progress') ORDER BY a.created_at DESC'''), {'ranger_id': user['id']}).mappings().all()
    return {'items': [dict(row) for row in rows]}


@router.get('/ranger/assignments/{assignment_id}')
def ranger_assignment(assignment_id: int, user: dict = Depends(require_roles('field_crew'))) -> dict:
    with engine.connect() as db:
        row = db.execute(text('''SELECT a.id AS assignment_id,a.incident_id,a.ranger_id,a.status,a.created_at,a.updated_at,
            i.source,i.size,i.notes,i.state,i.latitude,i.longitude,i.observed_at
            FROM resq_incident_assignments a JOIN resq_incidents i ON i.id=a.incident_id
            WHERE a.id=:assignment_id AND a.ranger_id=:ranger_id'''), {'assignment_id': assignment_id, 'ranger_id': user['id']}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail='Assignment not found')
        verifications = db.execute(text('SELECT id,outcome,notes,observed_at,created_at FROM resq_field_verifications WHERE assignment_id=:id ORDER BY created_at DESC'), {'id': assignment_id}).mappings().all()
    return {'assignment': dict(row), 'verifications': [dict(item) for item in verifications]}


@router.post('/ranger/assignments/{assignment_id}/decision', status_code=200, dependencies=[Depends(require_csrf)])
def decide_assignment(assignment_id: int, payload: AssignmentDecisionRequest, user: dict = Depends(require_roles('field_crew'))) -> dict:
    with engine.begin() as db:
        row = db.execute(text('''SELECT a.id,a.incident_id,a.status,i.state FROM resq_incident_assignments a
            JOIN resq_incidents i ON i.id=a.incident_id WHERE a.id=:id AND a.ranger_id=:ranger_id FOR UPDATE'''), {'id': assignment_id, 'ranger_id': user['id']}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail='Assignment not found')
        allowed = {'assigned': {'accepted', 'declined'}, 'accepted': {'in_progress'}, 'in_progress': set()}
        if payload.decision not in allowed.get(row['status'], set()):
            raise HTTPException(status_code=409, detail='Assignment cannot make that transition')
        new_status = 'cancelled' if payload.decision == 'declined' else payload.decision
        updated = db.execute(text("UPDATE resq_incident_assignments SET status=CAST(:status_value AS varchar(20)),updated_at=now(),cancelled_at=CASE WHEN CAST(:cancelled_value AS varchar(20))='cancelled' THEN now() ELSE cancelled_at END WHERE id=:id RETURNING id,incident_id,ranger_id,status,priority,due_at,updated_at"), {'id': assignment_id, 'status_value': new_status, 'cancelled_value': new_status}).mappings().one()
        audit_log.write_audit_log(action=f'assignment_{payload.decision}', entity_type='incident_assignment', entity_id=str(assignment_id), user_id=int(user['id']), metadata={'incident_id': row['incident_id']}, connection=db)
    with engine.connect() as db:
        recipients = db.execute(text("SELECT id FROM resq_users WHERE role IN ('admin','control_room_operator','incident_commander')")).scalars().all()
    _notify_users(user_ids=[int(item) for item in recipients], kind=f'assignment_{payload.decision}', message=f'Ranger updated assignment for incident #{row["incident_id"]}: {payload.decision}.', state=row['state'], entity_type='incident_assignment', entity_id=str(assignment_id))
    return {'assignment': dict(updated)}


@router.post('/ranger/assignments/{assignment_id}/verification', status_code=201, dependencies=[Depends(require_csrf)])
def submit_verification(assignment_id: int, payload: VerificationRequest, user: dict = Depends(require_roles('field_crew'))) -> dict:
    if payload.outcome not in {'confirmed', 'not_confirmed', 'inconclusive'}:
        raise HTTPException(status_code=422, detail='Unsupported verification outcome')
    observed_at = _parse_timestamp(payload.observed_at)
    with engine.begin() as db:
        assignment = db.execute(text("SELECT id,incident_id,ranger_id,status FROM resq_incident_assignments WHERE id=:id AND ranger_id=:ranger_id FOR UPDATE"), {'id': assignment_id, 'ranger_id': user['id']}).mappings().first()
        if not assignment:
            raise HTTPException(status_code=404, detail='Assignment not found')
        if assignment['status'] not in {'assigned', 'accepted', 'in_progress'}:
            raise HTTPException(status_code=409, detail='Assignment is no longer accepting verification')
        row = db.execute(text('''INSERT INTO resq_field_verifications (assignment_id,ranger_id,outcome,notes,observed_at)
            VALUES (:assignment_id,:ranger_id,:outcome,:notes,:observed_at)
            RETURNING id,assignment_id,outcome,notes,observed_at,created_at'''), {'assignment_id': assignment_id, 'ranger_id': user['id'], 'outcome': payload.outcome, 'notes': payload.notes.strip(), 'observed_at': observed_at}).mappings().one()
        db.execute(text("UPDATE resq_incident_assignments SET status='completed',updated_at=now() WHERE id=:id"), {'id': assignment_id})
        audit_log.write_audit_log(action='ranger_verification_submitted', entity_type='incident_assignment', entity_id=str(assignment_id), user_id=int(user['id']), metadata={'incident_id': assignment['incident_id'], 'outcome': payload.outcome}, connection=db)
    with engine.connect() as db:
        recipients = db.execute(text("SELECT id FROM resq_users WHERE role IN ('admin','control_room_operator','incident_commander')")).scalars().all()
    _notify_users(user_ids=[int(item) for item in recipients], kind='verification_submitted', message=f'Field verification submitted for incident #{assignment["incident_id"]}.', state=None, entity_type='incident_assignment', entity_id=str(assignment_id))
    return {'verification': dict(row), 'message': 'Verification persisted for Control Room review.'}


@router.get('/ranger/assignments/{assignment_id}/evidence')
def list_ranger_evidence(assignment_id: int, user: dict = Depends(require_roles('field_crew'))) -> dict:
    with engine.connect() as db:
        assignment = db.execute(text('SELECT incident_id FROM resq_incident_assignments WHERE id=:id AND ranger_id=:ranger_id'), {'id': assignment_id, 'ranger_id': user['id']}).scalar()
        if not assignment:
            raise HTTPException(status_code=404, detail='Assignment not found')
        rows = db.execute(text('SELECT id,original_filename,content_type,size_bytes,sha256,assessment_status,created_at FROM resq_incident_images WHERE incident_id=:incident_id AND uploaded_by=:user_id ORDER BY created_at DESC'), {'incident_id': assignment, 'user_id': user['id']}).mappings().all()
    return {'items': [dict(item) for item in rows]}


@router.post('/ranger/assignments/{assignment_id}/evidence', status_code=201, dependencies=[Depends(require_csrf)])
async def upload_ranger_evidence(assignment_id: int, image: UploadFile = File(...), user: dict = Depends(require_roles('field_crew'))) -> dict:
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail='Upload a JPEG, PNG, or WebP image')
    with engine.connect() as db:
        assignment = db.execute(text("SELECT id,incident_id,status FROM resq_incident_assignments WHERE id=:id AND ranger_id=:ranger_id"), {'id': assignment_id, 'ranger_id': user['id']}).mappings().first()
    if not assignment:
        raise HTTPException(status_code=404, detail='Assignment not found')
    if assignment['status'] not in {'assigned', 'accepted', 'in_progress'}:
        raise HTTPException(status_code=409, detail='Assignment is not accepting evidence')
    data = await image.read(MAX_IMAGE_BYTES + 1)
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413 if len(data) > MAX_IMAGE_BYTES else 422, detail='Image must be present and 10 MB or smaller')
    try:
        from PIL import Image
        with Image.open(BytesIO(data)) as decoded: decoded.verify()
        with Image.open(BytesIO(data)) as decoded: detected_format = (decoded.format or '').upper()
    except Exception as exc:
        raise HTTPException(status_code=422, detail='The uploaded file is not a readable image') from exc
    detected_type = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp'}.get(detected_format)
    if detected_type != image.content_type:
        raise HTTPException(status_code=415, detail='The declared image type does not match the decoded image')
    digest = hashlib.sha256(data).hexdigest(); extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[detected_type]
    path = _stored_image_path(f'{assignment["incident_id"]}/{digest}.{extension}'); existed = path.is_file()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        if not existed: path.write_bytes(data)
        else: _assert_stored_image_integrity(path, digest)
        assessment = assess_image(data, f'{assignment["incident_id"]}/{digest}.{extension}')
        with engine.begin() as db:
            row = db.execute(text('''INSERT INTO resq_incident_images
                (incident_id,storage_key,original_filename,content_type,size_bytes,sha256,assessment_status,model_version,authenticity_status,assessment,assessment_error,uploaded_by,assessed_at)
                VALUES (:incident_id,:storage_key,:filename,:content_type,:size_bytes,:sha256,:status,:version,:auth,:assessment,:error,:uploaded_by,now())
                ON CONFLICT (incident_id, sha256) DO UPDATE SET assessed_at=now(), assessment_status=EXCLUDED.assessment_status
                RETURNING id,original_filename,content_type,size_bytes,sha256,assessment_status,created_at'''), {'incident_id': assignment['incident_id'], 'storage_key': f'{assignment["incident_id"]}/{digest}.{extension}', 'filename': re.sub(r'[^A-Za-z0-9._-]+', '_', image.filename or 'evidence')[:120], 'content_type': detected_type, 'size_bytes': len(data), 'sha256': digest, 'status': assessment.get('assessment_status', 'UNAVAILABLE'), 'version': assessment.get('model_version'), 'auth': (assessment.get('authenticity') or {}).get('status'), 'assessment': json.dumps(assessment), 'error': assessment.get('error_code'), 'uploaded_by': user['id']}).mappings().one()
            audit_log.write_audit_log(action='ranger_evidence_uploaded', entity_type='incident_image', entity_id=str(row['id']), user_id=int(user['id']), metadata={'incident_id': assignment['incident_id'], 'assignment_id': assignment_id}, connection=db)
    except Exception as exc:
        if not existed and path.is_file(): path.unlink(missing_ok=True)
        raise HTTPException(status_code=503, detail='Evidence could not be stored. No upload was confirmed.') from exc
    return {'evidence': dict(row), 'message': 'Evidence persisted. Automated assessment remains advisory.'}
