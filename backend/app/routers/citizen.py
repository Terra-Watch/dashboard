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

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import text

from ..contracts.account import AccountDeleteRequest
from ..contracts.schemas import CitizenReportRequest, IncidentImageReviewRequest
from ..core.permissions import SUPPORTED_STATES
from ..core.security import current_redesign_user, hash_password_argon2, new_raw_token, require_csrf, verify_password
from ..database.session import engine
from ..routers.operations import ALLOWED_IMAGE_TYPES, IMAGE_ROOT, MAX_IMAGE_BYTES, _assert_stored_image_integrity, _stored_image_path
from ..services.recipients import incident_staff_recipients
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
    return {key: row.get(key) for key in ('id', 'status', 'close_reason', 'state', 'latitude', 'longitude', 'observed_at', 'created_at', 'updated_at')}


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
            result = db.execute(text('''SELECT id,reporter_id,status,close_reason,state,latitude,longitude,observed_at,created_at,updated_at
                FROM resq_incidents WHERE client_key=:client_key'''), {'client_key': payload.client_key.strip()}).mappings().first()
        if not result or result['reporter_id'] != user['id']:
            raise HTTPException(status_code=409, detail='Report key conflicts with another account')
        row = dict(result)
        if created:
            audit_log.write_audit_log(action='citizen_report_created', entity_type='incident', entity_id=str(row['id']), user_id=int(user['id']), metadata={'state': row['state']}, connection=db)
    if created:
        for recipient_id in incident_staff_recipients(row['state']):
            generate_alert(kind='citizen_report_received', message=f'Citizen report #{row["id"]} is ready for review.', state=row['state'], severity='info', entity_type='incident', entity_id=str(row['id']), user_id=recipient_id)
    return {'created': created, 'report': _safe_report(row), 'message': 'Report persisted for human review. No emergency notification is implied.'}


@router.get('/reports')
def list_reports(user: dict = Depends(citizen_user)) -> dict:
    with engine.connect() as db:
        rows = db.execute(text('''SELECT id,status,close_reason,state,latitude,longitude,observed_at,created_at,updated_at
            FROM resq_incidents WHERE reporter_id=:reporter_id ORDER BY created_at DESC'''), {'reporter_id': user['id']}).mappings().all()
    return {'items': [_safe_report(dict(row)) for row in rows]}


@router.get('/reports/{report_id}')
def get_report(report_id: int, user: dict = Depends(citizen_user)) -> dict:
    with engine.connect() as db:
        row = db.execute(text('''SELECT id,reporter_id,status,close_reason,state,latitude,longitude,observed_at,created_at,updated_at
            FROM resq_incidents WHERE id=:id AND reporter_id=:reporter_id'''), {'id': report_id, 'reporter_id': user['id']}).mappings().first()
        images = db.execute(text('''SELECT id,original_filename,size_bytes,assessment_status,created_at
            FROM resq_incident_images WHERE incident_id=:id ORDER BY created_at DESC'''), {'id': report_id}).mappings().all()
    if not row:
        raise HTTPException(status_code=404, detail='Report not found')
    report = _safe_report(dict(row))
    report['evidence'] = [dict(image) for image in images]
    return {'report': report}


@router.get('/reports/{report_id}/evidence/{image_id}')
def get_report_evidence(report_id: int, image_id: int, user: dict = Depends(citizen_user)) -> Response:
    """Retrieve evidence image for a citizen-owned report."""
    with engine.connect() as db:
        report = db.execute(text('SELECT id,reporter_id FROM resq_incidents WHERE id=:id'), {'id': report_id}).mappings().first()
        if not report or report['reporter_id'] != user['id']:
            raise HTTPException(status_code=404, detail='Report not found')
        image = db.execute(
            text('SELECT storage_key,content_type,original_filename,sha256 FROM resq_incident_images WHERE id=:image_id AND incident_id=:incident_id'),
            {'image_id': image_id, 'incident_id': report_id}
        ).mappings().first()
    if not image:
        raise HTTPException(status_code=404, detail='Evidence image not found')
    path = _stored_image_path(image['storage_key'])
    if not path.is_file():
        raise HTTPException(status_code=404, detail='Stored image is unavailable')
    _assert_stored_image_integrity(path, image['sha256'])
    return Response(
        content=path.read_bytes(),
        media_type=image['content_type'],
        headers={
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
        }
    )


@router.get('/reports/{report_id}/timeline')
def report_timeline(report_id: int, user: dict = Depends(citizen_user)) -> dict:
    """What happened to my report, in plain steps. Only status changes and their times: no staff names, notes or assignments."""
    with engine.connect() as db:
        row = db.execute(text('SELECT id,created_at FROM resq_incidents WHERE id=:id AND reporter_id=:r'), {'id': report_id, 'r': user['id']}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail='Report not found')
        changes = db.execute(text("""SELECT action, occurred_at, metadata->>'close_reason' AS close_reason FROM resq_audit_log
            WHERE entity_type='incident' AND entity_id=:e AND action LIKE 'incident_status_%' ORDER BY occurred_at ASC, id ASC"""), {'e': str(report_id)}).mappings().all()
    events = [{'kind': 'received', 'at': row['created_at']}]
    for change in changes:
        status = change['action'].removeprefix('incident_status_')
        event = {'kind': status, 'at': change['occurred_at']}
        if status == 'closed':
            event['close_reason'] = change['close_reason']
        events.append(event)
    return {'items': events}


@router.get('/account')
def get_account(user: dict = Depends(citizen_user)) -> dict:
    with engine.connect() as db:
        row = db.execute(text('SELECT id,name,email,created_at,consented_at FROM resq_users WHERE id=:id'), {'id': user['id']}).mappings().one()
    return {'account': dict(row)}


@router.get('/account/export')
def export_account(user: dict = Depends(citizen_user)) -> dict:
    """Everything we hold about this person, as one JSON document they can save."""
    with engine.connect() as db:
        account = db.execute(text('SELECT id,name,email,created_at,consented_at FROM resq_users WHERE id=:id'), {'id': user['id']}).mappings().one()
        reports = db.execute(text('SELECT id,status,close_reason,state,latitude,longitude,observed_at,created_at,notes FROM resq_incidents WHERE reporter_id=:id ORDER BY id'), {'id': user['id']}).mappings().all()
        posts = db.execute(text('SELECT id,content,created_at,removed_at FROM resq_community_posts WHERE author_id=:id ORDER BY id'), {'id': user['id']}).mappings().all()
        comments = db.execute(text('SELECT id,post_id,content,created_at,removed_at FROM resq_community_comments WHERE author_id=:id ORDER BY id'), {'id': user['id']}).mappings().all()
        messages = db.execute(text('SELECT id,content,created_at FROM resq_community_messages WHERE author_id=:id ORDER BY id'), {'id': user['id']}).mappings().all()
    audit_log.write_audit_log(action='citizen_account_exported', entity_type='session', entity_id=str(user['id']), user_id=int(user['id']))
    return {'account': dict(account), 'reports': [dict(r) for r in reports], 'community': {'posts': [dict(r) for r in posts], 'comments': [dict(r) for r in comments], 'chat_messages': [dict(r) for r in messages]}}


@router.delete('/account', dependencies=[Depends(require_csrf)])
def delete_account(payload: AccountDeleteRequest, user: dict = Depends(citizen_user)) -> dict:
    """Closes the account. Sign-in details and community writing are removed; reports already handed to staff stay as safety records without a name."""
    with engine.begin() as db:
        row = db.execute(text('SELECT password_hash,password_algo FROM resq_users WHERE id=:id AND deleted_at IS NULL FOR UPDATE'), {'id': user['id']}).mappings().first()
        if not row or not verify_password(payload.password, row['password_hash'], row.get('password_algo', 'bcrypt')):
            raise HTTPException(status_code=403, detail='That password is not right')
        db.execute(text("UPDATE resq_users SET name='Deleted member', email=:e, password_hash=:h, password_algo='argon2', deleted_at=now() WHERE id=:id"),
                   {'e': f"deleted-{user['id']}@deleted.invalid", 'h': hash_password_argon2(new_raw_token()), 'id': user['id']})
        db.execute(text('DELETE FROM resq_refresh_tokens WHERE user_id=:id'), {'id': user['id']})
        db.execute(text("UPDATE resq_community_posts SET status='removed', removed_at=COALESCE(removed_at,now()), removed_by=:id, removal_kind=COALESCE(removal_kind,'author') WHERE author_id=:id"), {'id': user['id']})
        db.execute(text("UPDATE resq_community_comments SET status='removed', removed_at=COALESCE(removed_at,now()), removed_by=:id, removal_kind=COALESCE(removal_kind,'author') WHERE author_id=:id"), {'id': user['id']})
        db.execute(text('DELETE FROM resq_community_messages WHERE author_id=:id'), {'id': user['id']})
        audit_log.write_audit_log(action='citizen_account_deleted', entity_type='session', entity_id=str(user['id']), user_id=int(user['id']), connection=db)
    return {'status': 'deleted'}


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
