"""Citizen-owned report and evidence endpoints.

Citizen responses intentionally expose only the citizen's own report state and
safe evidence status; operational notes, reviewer identity, and staff audit
metadata remain staff-only.
"""
from datetime import datetime
import hashlib
import json
import re
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import text

from ..contracts.schemas import CitizenReportRequest, IncidentImageReviewRequest
from ..core.permissions import SUPPORTED_STATES
from ..core.security import current_redesign_user, require_csrf
from ..database.session import engine
from ..routers.operations import ALLOWED_IMAGE_TYPES, IMAGE_ROOT, MAX_IMAGE_BYTES, _assert_stored_image_integrity, _stored_image_path
from ..services import audit_log
from ..services.alert_service import generate_alert
from ..services.image_assessment import assess_image_async, persistence_fields

router = APIRouter(prefix="/api/citizen", tags=["citizen"])


def citizen_user(user: dict = Depends(current_redesign_user)) -> dict:
    if user.get('role') != 'citizen':
        raise HTTPException(status_code=403, detail='Citizen account required')
    return user


def _parse_observed(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail='observed_at must be an ISO timestamp') from exc
    if parsed.tzinfo is None:
        raise HTTPException(status_code=422, detail='observed_at must include a timezone')
    return parsed


def _safe_report(row: dict) -> dict:
    return {key: row.get(key) for key in ('id', 'status', 'state', 'latitude', 'longitude', 'observed_at', 'created_at', 'updated_at')}


@router.post('/reports', status_code=201, dependencies=[Depends(require_csrf)])
def create_report(payload: CitizenReportRequest, user: dict = Depends(citizen_user)) -> dict:
    if payload.state.upper() not in SUPPORTED_STATES:
        raise HTTPException(status_code=422, detail='Unsupported report state')
    observed_at = _parse_observed(payload.observed_at)
    description = payload.description.strip()
    with engine.begin() as db:
        result = db.execute(text('''INSERT INTO resq_incidents
            (reporter_id,client_key,source,size,notes,state,latitude,longitude,observed_at)
            VALUES (:reporter_id,:client_key,'citizen','unknown',:notes,:state,:latitude,:longitude,:observed_at)
            ON CONFLICT (client_key) WHERE client_key IS NOT NULL DO NOTHING
            RETURNING id,reporter_id,status,state,latitude,longitude,observed_at,created_at,updated_at'''), {
                'reporter_id': user['id'], 'client_key': payload.client_key.strip(), 'notes': description,
                'state': payload.state.upper(), 'latitude': payload.latitude, 'longitude': payload.longitude,
                'observed_at': observed_at,
            }).mappings().first()
        created = result is not None
        if not result:
            result = db.execute(text('''SELECT id,reporter_id,status,state,latitude,longitude,observed_at,created_at,updated_at
                FROM resq_incidents WHERE client_key=:client_key'''), {'client_key': payload.client_key.strip()}).mappings().first()
        if not result or result['reporter_id'] != user['id']:
            raise HTTPException(status_code=409, detail='Report key conflicts with another account')
        row = dict(result)
        if created:
            audit_log.write_audit_log(action='citizen_report_created', entity_type='incident', entity_id=str(row['id']), user_id=int(user['id']), metadata={'state': row['state']}, connection=db)
    if created:
        with engine.connect() as db:
            recipients = db.execute(text("SELECT id FROM resq_users WHERE role IN ('admin','control_room_operator','incident_commander')")).scalars().all()
        for recipient_id in sorted(set(int(item) for item in recipients)):
            generate_alert(kind='citizen_report_received', message=f'Citizen report #{row["id"]} is ready for review.', state=row['state'], severity='info', entity_type='incident', entity_id=str(row['id']), user_id=recipient_id)
    return {'created': created, 'report': _safe_report(row), 'message': 'Report persisted for human review. No emergency notification is implied.'}


@router.get('/reports')
def list_reports(user: dict = Depends(citizen_user)) -> dict:
    with engine.connect() as db:
        rows = db.execute(text('''SELECT id,status,state,latitude,longitude,observed_at,created_at,updated_at
            FROM resq_incidents WHERE reporter_id=:reporter_id ORDER BY created_at DESC'''), {'reporter_id': user['id']}).mappings().all()
    return {'items': [_safe_report(dict(row)) for row in rows]}


@router.get('/reports/{report_id}')
def get_report(report_id: int, user: dict = Depends(citizen_user)) -> dict:
    with engine.connect() as db:
        row = db.execute(text('''SELECT id,reporter_id,status,state,latitude,longitude,observed_at,created_at,updated_at
            FROM resq_incidents WHERE id=:id AND reporter_id=:reporter_id'''), {'id': report_id, 'reporter_id': user['id']}).mappings().first()
        images = db.execute(text('''SELECT id,original_filename,size_bytes,assessment_status,created_at
            FROM resq_incident_images WHERE incident_id=:id ORDER BY created_at DESC'''), {'id': report_id}).mappings().all()
    if not row:
        raise HTTPException(status_code=404, detail='Report not found')
    report = _safe_report(dict(row))
    report['evidence'] = [dict(image) for image in images]
    return {'report': report}


@router.post('/reports/{report_id}/evidence', status_code=201, dependencies=[Depends(require_csrf)])
async def upload_report_evidence(report_id: int, image: UploadFile = File(...), user: dict = Depends(citizen_user)) -> dict:
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail='Upload a JPEG, PNG, or WebP image')
    with engine.connect() as db:
        owned = db.execute(text('SELECT id FROM resq_incidents WHERE id=:id AND reporter_id=:reporter_id'), {'id': report_id, 'reporter_id': user['id']}).scalar()
    if not owned:
        raise HTTPException(status_code=404, detail='Report not found')
    data = await image.read(MAX_IMAGE_BYTES + 1)
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413 if len(data) > MAX_IMAGE_BYTES else 422, detail='Image must be present and 10 MB or smaller')
    try:
        from PIL import Image
        with Image.open(BytesIO(data)) as decoded:
            decoded.verify()
        with Image.open(BytesIO(data)) as decoded:
            detected_format = (decoded.format or '').upper()
    except Exception as exc:
        raise HTTPException(status_code=422, detail='The uploaded file is not a readable image') from exc
    detected_type = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp'}.get(detected_format)
    if detected_type != image.content_type:
        raise HTTPException(status_code=415, detail='The declared image type does not match the decoded image')
    digest = hashlib.sha256(data).hexdigest()
    extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[detected_type]
    key = f'{report_id}/{digest}.{extension}'
    path = _stored_image_path(key)
    existed = path.is_file()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        if not existed:
            path.write_bytes(data)
        else:
            _assert_stored_image_integrity(path, digest)
        assessment = await assess_image_async(data, key)
        with engine.begin() as db:
            row = db.execute(text('''INSERT INTO resq_incident_images
                (incident_id,storage_key,original_filename,content_type,size_bytes,sha256,assessment_status,model_version,authenticity_status,assessment,assessment_error,assessed_at)
                VALUES (:incident_id,:storage_key,:filename,:content_type,:size_bytes,:sha256,:status,:version,:auth,:assessment,:error,now())
                ON CONFLICT (incident_id, sha256) DO UPDATE SET assessed_at=now(), assessment_status=EXCLUDED.assessment_status,
                model_version=EXCLUDED.model_version, authenticity_status=EXCLUDED.authenticity_status,
                assessment=EXCLUDED.assessment, assessment_error=EXCLUDED.assessment_error
                RETURNING id,original_filename,size_bytes,assessment_status,created_at'''), {
                'incident_id': report_id, 'storage_key': key, 'filename': re.sub(r'[^A-Za-z0-9._-]+', '_', image.filename or 'evidence')[:120],
                'content_type': detected_type, 'size_bytes': len(data), 'sha256': digest,
                **persistence_fields(assessment),
            }).mappings().one()
            audit_log.write_audit_log(action='citizen_evidence_uploaded', entity_type='incident_image', entity_id=str(row['id']), user_id=int(user['id']), metadata={'incident_id': report_id}, connection=db)
    except Exception as exc:
        if not existed and path.is_file():
            path.unlink(missing_ok=True)
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status_code=503, detail='Evidence could not be stored. The report remains persisted.') from exc
    return {'evidence': dict(row), 'message': 'Evidence persisted. Automated assessment remains advisory.'}
