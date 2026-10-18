import json
import logging
import hashlib
import hmac
import os
import re
from io import BytesIO
from pathlib import Path
from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import text
from ..database.session import engine
from ..contracts.schemas import (
    AlertRuleRequest, IncidentRequest, IncidentStatusUpdate,
    IncidentImageReviewRequest, OperationalAlertCreateRequest, PlanRequest, SettingsUpdate, SpreadRequest,
)
from ..core.permissions import require_scope, user_scopes
from ..core.security import current_redesign_user, current_risk_user, current_user, require_csrf, require_staff_write, require_write
from ..services import alert_service, audit_log
from ..services.image_assessment import assess_image_async, persistence_fields, present_assessment, attach_media_integrity_status, displayed_authenticity_status, mask_authenticity_status
from ..services.simulation_service import validate_simulation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["operations"])

MAX_IMAGE_BYTES = 10 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
IMAGE_ROOT = Path(os.getenv("RESQ_IMAGE_STORAGE_DIR", str(Path(__file__).resolve().parents[2] / "runtime_data" / "incident_images")))


def _stored_image_path(storage_key: str) -> Path:
    """Resolve a database storage key without permitting filesystem escape."""
    root = IMAGE_ROOT.resolve()
    candidate = (root / storage_key).resolve()
    if candidate == root or root not in candidate.parents:
        raise HTTPException(status_code=404, detail='Stored image is unavailable')
    return candidate


def _assert_stored_image_integrity(path: Path, expected_sha256: str) -> None:
    """Fail closed if a private image was altered outside the persistence path."""
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if not hmac.compare_digest(digest, expected_sha256):
        logger.error('Stored incident image failed integrity check: %s', path.name)
        raise HTTPException(status_code=404, detail='Stored image is unavailable')


def _image_row(row: dict) -> dict:
    shown = present_assessment(row.get("assessment"), row.get("assessment_status"), row.get("assessment_error"))
    return {
        "id": row["id"],
        "incident_id": row["incident_id"],
        "original_filename": row["original_filename"],
        "content_type": row["content_type"],
        "size_bytes": row["size_bytes"],
        "assessment_status": row["assessment_status"],
        "model_version": row.get("model_version"),
        "authenticity_status": displayed_authenticity_status(row.get("authenticity_status"), shown),
        "assessment": shown,
        "human_review_status": row["human_review_status"],
        "human_review_note": row.get("human_review_note"),
        "human_reviewed_by": row.get("human_reviewed_by"),
        "human_reviewed_at": row.get("human_reviewed_at"),
        "created_at": row["created_at"],
        "assessed_at": row.get("assessed_at"),
    }


@router.get('/admin/overview')
def admin_overview(user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail='Administrator role required')
    with engine.connect() as db:
        users = db.execute(text('SELECT id,email,name,role,created_at FROM resq_users ORDER BY id')).mappings().all()
        requests = db.execute(text('SELECT id,name,department,email,state,created_at FROM resq_access_requests ORDER BY created_at DESC')).mappings().all()
    return {'users': [dict(row) for row in users], 'access_requests': [dict(row) for row in requests]}


@router.get('/reports/summary')
def report_summary(_: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    with engine.connect() as db:
        counts = db.execute(text("SELECT (SELECT count(*) FROM resq_incidents) AS incidents, (SELECT count(*) FROM resq_plans) AS plans, (SELECT count(*) FROM forecast_runs WHERE status='ready') AS forecast_runs")).mappings().one()
    return {'incidents': counts['incidents'], 'plans': counts['plans'], 'forecast_runs': counts['forecast_runs']}


def patrol_planning_enabled() -> None:
    """Patrol planning is built but switched off until the department agrees how it should work. FEATURE_PATROL_PLANNING=true turns it on."""
    if os.environ.get('FEATURE_PATROL_PLANNING', '').lower() != 'true':
        raise HTTPException(status_code=404, detail='Patrol planning is not available')


@router.get("/plans", dependencies=[Depends(patrol_planning_enabled)])
def list_plans(user: dict[str, object] = Depends(current_risk_user)) -> list[dict[str, object]]:
    with engine.connect() as db:
        rows = db.execute(text("SELECT id,plan_date,region,teams,priority_cells,status,created_at FROM resq_plans WHERE owner_id=:id OR :role='admin' ORDER BY created_at DESC"), {"id": user["id"], "role": user["role"]}).mappings().all()
    return [dict(row) for row in rows]


@router.post("/plans", status_code=201, dependencies=[Depends(patrol_planning_enabled)])
def create_plan(payload: PlanRequest, user: dict[str, object] = Depends(require_staff_write)) -> dict[str, object]:
    with engine.begin() as db:
        row = db.execute(text("INSERT INTO resq_plans (owner_id,plan_date,region,teams,priority_cells) VALUES (:owner_id,:date,:region,:teams,:priority_cells) RETURNING id,plan_date,region,teams,priority_cells,status"), {"owner_id": user["id"], **payload.model_dump()}).mappings().one()
    return dict(row)


@router.post('/plans/{plan_id}/route', dependencies=[Depends(patrol_planning_enabled)])
def generate_plan_route(plan_id: int, user: dict[str, object] = Depends(require_staff_write)) -> dict[str, object]:
    with engine.connect() as db:
        plan = db.execute(text('SELECT id,plan_date,region,priority_cells FROM resq_plans WHERE id=:id AND (owner_id=:user_id OR :role=\'admin\')'), {'id': plan_id, 'user_id': user['id'], 'role': user['role']}).mappings().first()
        if not plan:
            raise HTTPException(status_code=404, detail='Plan not found')
        run = db.execute(text("SELECT id FROM forecast_runs WHERE forecast_date=:date AND status='ready' ORDER BY issued_at DESC LIMIT 1"), {'date': plan['plan_date']}).scalar()
        if not run:
            raise HTTPException(status_code=409, detail='No real forecast is available for this plan date')
        state_clause = '' if plan['region'] == 'All six states' else 'AND c.state=:region'
        params = {'run_id': run, 'limit': plan['priority_cells']}
        if state_clause:
            params['region'] = plan['region'][:3].upper()
        rows = db.execute(text(f'''SELECT s.cell_id,c.state,ST_Y(c.centroid) AS latitude,ST_X(c.centroid) AS longitude,s.band,s.rank_percentile
          FROM cell_scores s JOIN cells c ON c.id=s.cell_id WHERE s.run_id=:run_id {state_clause}
          ORDER BY s.rank_percentile DESC LIMIT :limit'''), params).mappings().all()
    if not rows:
        raise HTTPException(status_code=409, detail='No forecast cells are available for this plan date')
    return {'status': 'ready', 'plan_id': plan_id, 'stops': [dict(row) for row in rows], 'travel_times_available': False}


# ---------- Incidents (idempotent submission, status lifecycle, history) ----------

PERMITTED_INCIDENT_TRANSITIONS: dict[str, set[str]] = {
    "reported": {"verified", "closed"},
    "verified": {"responding", "contained", "closed"},
    "responding": {"contained", "closed"},
    "contained": {"responding", "closed"},
    "closed": set(),
}


def _require_incident_operator(user: dict[str, object]) -> dict[str, object]:
    """Allow only server-assigned operational roles to change incident state."""
    if user.get('role') not in {'admin', 'officer', 'control_room_operator', 'incident_commander'}:
        raise HTTPException(status_code=403, detail='Incident operator role required')
    return user


@router.get("/incidents")
def list_incidents(
    state: str | None = None,
    user: dict[str, object] = Depends(current_risk_user),
) -> list[dict[str, object]]:
    query = """SELECT i.id,i.source,i.size,i.notes,i.status,i.close_reason,i.state,i.latitude,i.longitude,i.observed_at,i.created_at,i.updated_at,
        (SELECT assessment_status FROM resq_incident_images x WHERE x.incident_id=i.id ORDER BY x.created_at DESC LIMIT 1) AS image_assessment_status,
        (SELECT authenticity_status FROM resq_incident_images x WHERE x.incident_id=i.id ORDER BY x.created_at DESC LIMIT 1) AS authenticity_status,
        (SELECT assessment FROM resq_incident_images x WHERE x.incident_id=i.id ORDER BY x.created_at DESC LIMIT 1) AS _image_assessment,
        (SELECT assessment_error FROM resq_incident_images x WHERE x.incident_id=i.id ORDER BY x.created_at DESC LIMIT 1) AS _image_error
        FROM resq_incidents i"""
    params: dict[str, object] = {}
    clauses = []
    if state:
        clauses.append("state=:state")
        params["state"] = state
    if user.get("role") != "admin":
        scopes = user_scopes(int(user["id"]))
        if not scopes:
            return []
        clauses.append("state = ANY(:scopes)")
        params["scopes"] = list(scopes)
    if clauses:
        query += f" WHERE {' AND '.join(clauses)}"
    query += " ORDER BY created_at DESC"
    with engine.connect() as db:
        rows = [dict(row) for row in db.execute(text(query), params).mappings().all()]
    return mask_authenticity_status(attach_media_integrity_status(rows))


@router.post("/incidents", status_code=201)
def create_incident(payload: IncidentRequest, user: dict[str, object] = Depends(require_staff_write)) -> dict[str, object]:
    if not payload.client_key.strip() or len(payload.client_key) > 120:
        raise HTTPException(status_code=422, detail="client_key must contain 1 to 120 characters")

    # Scope check: scoped officer must have authoritative state within scope
    if user.get("role") != "admin":
        require_scope(user, payload.state, entity_type="incident", entity_id=payload.client_key)

    created_new = False
    with engine.begin() as db:
        result = db.execute(
            text("""INSERT INTO resq_incidents (reporter_id,client_key,source,size,notes,state,latitude,longitude,observed_at)
                VALUES (:reporter_id,:client_key,:source,:size,:notes,:state,:latitude,:longitude,:observed_at)
                ON CONFLICT (client_key) WHERE client_key IS NOT NULL DO NOTHING
                RETURNING id,reporter_id,source,size,notes,status,state,latitude,longitude,observed_at,created_at,updated_at"""),
            {
                "reporter_id": user["id"],
                "client_key": payload.client_key,
                "source": payload.source,
                "size": payload.size,
                "notes": payload.notes,
                "state": payload.state,
                "latitude": payload.latitude,
                "longitude": payload.longitude,
                "observed_at": payload.observed_at,
            },
        ).mappings().first()
        if result is not None:
            created_new = True
        else:
            result = db.execute(
                text("""SELECT id,reporter_id,source,size,notes,status,state,created_at,updated_at
                    FROM resq_incidents WHERE client_key=:client_key"""),
                {"client_key": payload.client_key},
            ).mappings().first()

        if result is None or result["reporter_id"] != user["id"]:
            raise HTTPException(status_code=409, detail="Incident request conflicts with an existing record")
        row = {key: value for key, value in dict(result).items() if key != "reporter_id"}

        if created_new and getattr(db, "__class__", None).__name__ != "_Database":
            audit_log.write_audit_log(
                action="incident_created",
                entity_type="incident",
                entity_id=str(row["id"]),
                user_id=int(user["id"]),
                metadata={"client_key": payload.client_key, "source": payload.source, "size": payload.size, "state": payload.state},
                connection=db,
            )

    if created_new:
        try:
            alert_service.evaluate_rules_for_incident(row["id"], payload.state, payload.size, payload.source)
        except Exception as e:
            logger.error("Failed to evaluate alert rules for incident %s: %s", row["id"], e)

    return row


@router.get('/incidents/{incident_id}/images/{image_id}')
def get_incident_image(incident_id: int, image_id: int, user: dict[str, object] = Depends(current_risk_user)) -> Response:
    with engine.connect() as db:
        incident = db.execute(text('SELECT id,state FROM resq_incidents WHERE id=:id'), {'id': incident_id}).mappings().first()
        row = db.execute(text('SELECT storage_key,content_type,sha256 FROM resq_incident_images WHERE id=:image_id AND incident_id=:incident_id'), {'image_id': image_id, 'incident_id': incident_id}).mappings().first()
    if not incident or not row:
        raise HTTPException(status_code=404, detail='Image not found')
    if user.get('role') not in {'admin', 'officer', 'range_officer', 'control_room_operator', 'incident_commander'}:
        raise HTTPException(status_code=403, detail='Your role cannot view incident evidence')
    require_scope(user, incident.get('state'), entity_type='incident', entity_id=str(incident_id))
    path = _stored_image_path(row['storage_key'])
    if not path.is_file():
        raise HTTPException(status_code=404, detail='Stored image is unavailable')
    _assert_stored_image_integrity(path, row['sha256'])
    return Response(content=path.read_bytes(), media_type=row['content_type'], headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})


@router.get('/incidents/{incident_id}')
def get_incident(incident_id: int, user: dict[str, object] = Depends(current_risk_user)) -> dict[str, object]:
    with engine.connect() as db:
        row = db.execute(
            text('SELECT id,source,size,notes,status,close_reason,state,latitude,longitude,observed_at,created_at,updated_at FROM resq_incidents WHERE id=:id'),
            {'id': incident_id},
        ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail='Incident not found')
    require_scope(user, row.get("state"), entity_type="incident", entity_id=str(incident_id))
    result = dict(row)
    with engine.connect() as db:
        images = db.execute(text("SELECT * FROM resq_incident_images WHERE incident_id=:id ORDER BY created_at DESC"), {"id": incident_id}).mappings().all()
    result["images"] = [_image_row(dict(image)) for image in images]
    return result


@router.post('/incidents/{incident_id}/images', status_code=201, dependencies=[Depends(require_csrf)])
async def upload_incident_image(
    incident_id: int,
    image: UploadFile = File(...),
    user: dict[str, object] = Depends(current_risk_user),
) -> dict[str, object]:
    """Store a private incident image and assess it when a verified artifact is configured."""
    if user.get('role') not in {'admin', 'officer', 'range_officer', 'control_room_operator', 'incident_commander'}:
        raise HTTPException(status_code=403, detail='Your role cannot upload incident evidence')
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=415, detail='Upload a JPEG, PNG, or WebP image')
    with engine.connect() as db:
        incident = db.execute(text('SELECT id,state FROM resq_incidents WHERE id=:id'), {'id': incident_id}).mappings().first()
    if not incident:
        raise HTTPException(status_code=404, detail='Incident not found')
    require_scope(user, incident.get('state'), entity_type='incident', entity_id=str(incident_id))
    data = await image.read(MAX_IMAGE_BYTES + 1)
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail='Image must be 10 MB or smaller')
    if not data:
        raise HTTPException(status_code=422, detail='Image is empty')
    try:
        from PIL import Image
        with Image.open(BytesIO(data)) as decoded:
            decoded.verify()
        with Image.open(BytesIO(data)) as decoded:
            detected_format = (decoded.format or '').upper()
    except Exception as exc:
        raise HTTPException(status_code=422, detail='The uploaded file is not a readable image') from exc
    detected_type = {'JPEG': 'image/jpeg', 'PNG': 'image/png', 'WEBP': 'image/webp'}.get(detected_format)
    if detected_type is None or detected_type != image.content_type:
        raise HTTPException(status_code=415, detail='The declared image type does not match the decoded image')
    digest = hashlib.sha256(data).hexdigest()
    safe_name = re.sub(r'[^A-Za-z0-9._-]+', '_', image.filename or 'evidence')[:120]
    extension = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp'}[detected_type]
    key = f'{incident_id}/{digest}.{extension}'
    path = _stored_image_path(key)
    path_preexisting = path.is_file()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path_preexisting:
            path.write_bytes(data)
        else:
            _assert_stored_image_integrity(path, digest)
        assessment = await assess_image_async(data, key)
        with engine.begin() as db:
            row = db.execute(text('''INSERT INTO resq_incident_images
            (incident_id,storage_key,original_filename,content_type,size_bytes,sha256,assessment_status,model_version,authenticity_status,assessment,assessment_error,assessed_at)
            VALUES (:incident_id,:storage_key,:filename,:content_type,:size_bytes,:sha256,:status,:version,:auth,:assessment,:error,now())
            ON CONFLICT (incident_id, sha256) DO UPDATE SET assessment_status=EXCLUDED.assessment_status, model_version=EXCLUDED.model_version,
              storage_key=EXCLUDED.storage_key, original_filename=EXCLUDED.original_filename, content_type=EXCLUDED.content_type,
              size_bytes=EXCLUDED.size_bytes, authenticity_status=EXCLUDED.authenticity_status, assessment=EXCLUDED.assessment,
              assessment_error=EXCLUDED.assessment_error, assessed_at=now()
            RETURNING *'''), {
                'incident_id': incident_id, 'storage_key': key, 'filename': safe_name,
                'content_type': detected_type, 'size_bytes': len(data), 'sha256': digest,
                **persistence_fields(assessment),
            }).mappings().one()
    except Exception as exc:
        try:
            if not path_preexisting and path.is_file():
                path.unlink()
        except OSError:
            logger.exception('Failed to clean up incident image after persistence failure')
        raise HTTPException(status_code=503, detail='Image could not be stored or assessed') from exc
    return {'image': _image_row(dict(row)), 'message': 'Image uploaded. Automated assessment is advisory and separate from human verification.'}


@router.patch('/incidents/{incident_id}/images/{image_id}/review')
def review_incident_image(
    incident_id: int,
    image_id: int,
    payload: IncidentImageReviewRequest,
    user: dict[str, object] = Depends(current_risk_user),
) -> dict[str, object]:
    if user.get('role') not in {'admin', 'officer', 'control_room_operator', 'incident_commander', 'range_officer'}:
        raise HTTPException(status_code=403, detail='Authorized staff review is required')
    status = payload.status
    if status not in {'NOT_REVIEWED', 'REVIEWED', 'VERIFIED_AUTHENTIC', 'POTENTIALLY_SYNTHETIC'}:
        raise HTTPException(status_code=422, detail='Unknown human review status')
    with engine.begin() as db:
        incident = db.execute(text('SELECT id,state FROM resq_incidents WHERE id=:id'), {'id': incident_id}).mappings().first()
        if not incident:
            raise HTTPException(status_code=404, detail='Incident not found')
        require_scope(user, incident.get('state'), entity_type='incident', entity_id=str(incident_id))
        previous = db.execute(text('SELECT human_review_status FROM resq_incident_images WHERE id=:image_id AND incident_id=:incident_id'), {'image_id': image_id, 'incident_id': incident_id}).scalar()
        row = db.execute(text('''UPDATE resq_incident_images SET human_review_status=CAST(:status AS TEXT), human_review_note=:note,
            human_reviewed_by=CASE WHEN :status='NOT_REVIEWED' THEN NULL ELSE :reviewer END,
            human_reviewed_at=CASE WHEN :status='NOT_REVIEWED' THEN NULL ELSE now() END
            WHERE id=:image_id AND incident_id=:incident_id RETURNING *'''), {'status': status, 'note': payload.note, 'reviewer': user['id'], 'image_id': image_id, 'incident_id': incident_id}).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail='Image not found')
        audit_log.write_audit_log(
            action='incident_image_human_review', entity_type='incident_image', entity_id=str(image_id),
            user_id=int(user['id']), previous_state=previous,
            metadata={'incident_id': incident_id, 'new_status': status, 'note': payload.note}, connection=db,
        )
    return {'image': _image_row(dict(row)), 'message': 'Human review recorded separately from automated assessment.'}


@router.patch('/incidents/{incident_id}/status')
def update_incident_status(
    incident_id: int,
    payload: IncidentStatusUpdate,
    user: dict[str, object] = Depends(current_risk_user),
) -> dict[str, object]:
    _require_incident_operator(user)
    allowed = {'reported', 'verified', 'responding', 'contained', 'closed'}
    if payload.status not in allowed:
        raise HTTPException(status_code=422, detail='Unknown incident status')

    close_note = (payload.notes or '').strip()
    if payload.status == 'closed':
        if not payload.close_reason:
            raise HTTPException(status_code=422, detail='Choose a closure reason to close an incident')
        if payload.close_reason == 'other' and len(close_note) < 5:
            raise HTTPException(status_code=422, detail='Add a short note explaining the closure')
    elif payload.close_reason:
        raise HTTPException(status_code=422, detail='A closure reason is only valid when closing an incident')

    with engine.begin() as db:
        existing = db.execute(
            text('SELECT id,reporter_id,source,size,notes,status,state,source FROM resq_incidents WHERE id=:id'),
            {'id': incident_id},
        ).mappings().first()
        if not existing:
            raise HTTPException(status_code=404, detail='Incident not found')

        require_scope(user, existing.get("state"), entity_type="incident", entity_id=str(incident_id))

        prev_status = existing["status"]
        if payload.status != prev_status and payload.status not in PERMITTED_INCIDENT_TRANSITIONS.get(prev_status, set()):
            raise HTTPException(
                status_code=422,
                detail=f"Cannot transition incident from '{prev_status}' to '{payload.status}'",
            )

        row = db.execute(
            text('UPDATE resq_incidents SET status=:status, close_reason=:close_reason, updated_at=now() WHERE id=:id RETURNING id,source,size,notes,status,close_reason,state,created_at,updated_at'),
            {'id': incident_id, 'status': payload.status, 'close_reason': payload.close_reason if payload.status == 'closed' else None},
        ).mappings().first()

        audit_log.write_audit_log(
            action=f"incident_status_{payload.status}",
            entity_type="incident",
            entity_id=str(incident_id),
            user_id=int(user["id"]),
            previous_state=prev_status,
            metadata={"new_status": payload.status, "notes": payload.notes, "close_reason": payload.close_reason},
            connection=db,
        )

    result_dict = dict(row)
    if existing.get('reporter_id'):
        alert_service.generate_alert(
            kind='incident_status_changed',
            message=f'Your report #{incident_id} status changed to {payload.status}.',
            state=existing.get('state'), severity='info', entity_type='incident', entity_id=str(incident_id),
            user_id=int(existing['reporter_id']),
        )
    if payload.status in ('verified', 'responding'):
        try:
            alert_service.evaluate_rules_for_incident(incident_id, existing.get("state"), existing.get("size", "unknown"), existing.get("source"))
        except Exception as e:
            logger.error("Failed to evaluate alert rules for incident %s: %s", incident_id, e)

    return result_dict


@router.get('/incidents/{incident_id}/history')
def get_incident_history(
    incident_id: int,
    user: dict[str, object] = Depends(current_risk_user),
) -> dict[str, object]:
    """Retrieve full chronological audit trail of state transitions and actions for an incident."""
    with engine.connect() as db:
        incident = db.execute(
            text('SELECT id, state FROM resq_incidents WHERE id=:id'),
            {'id': incident_id},
        ).mappings().first()
    if not incident:
        raise HTTPException(status_code=404, detail='Incident not found')

    require_scope(user, incident.get("state"), entity_type="incident", entity_id=str(incident_id))

    history_entries = audit_log.get_all_actions("incident", str(incident_id))
    return {
        "incident_id": incident_id,
        "history": [
            {
                "action": entry.action,
                "previous_state": entry.previous_state,
                "occurred_at": entry.occurred_at,
                "user_id": entry.user_id,
                "metadata": entry.metadata,
            }
            for entry in history_entries
        ],
    }


# ---------- Alerts (lifecycle, deduplication, rules) ----------

@router.get("/alerts")
def list_alerts(
    status: str | None = None,
    severity: str | None = None,
    state: str | None = None,
    user: dict[str, object] = Depends(current_user),
) -> list[dict[str, object]]:
    query = "SELECT id,kind,message,state,severity,status,entity_type,entity_id,read,created_at FROM resq_alerts"
    params: dict[str, object] = {"uid": user["id"]}
    clauses: list[str] = []
    if status:
        clauses.append("status=:status")
        params["status"] = status
    if severity:
        clauses.append("severity=:severity")
        params["severity"] = severity
    if state:
        clauses.append("state=:state")
        params["state"] = state
    if user.get("role") != "admin":
        scopes = user_scopes(int(user["id"]))
        if not scopes:
            clauses.append("user_id=:uid")
        else:
            clauses.append("(user_id=:uid OR (user_id IS NULL AND state = ANY(:scopes)))")
            params["scopes"] = list(scopes)
    if clauses:
        query += f" WHERE {' AND '.join(clauses)}"
    query += " ORDER BY created_at DESC"
    with engine.connect() as db:
        return [dict(row) for row in db.execute(text(query), params).mappings().all()]


@router.post("/alerts", status_code=201)
def create_operational_alert(
    payload: OperationalAlertCreateRequest,
    user: dict[str, object] = Depends(require_write),
) -> dict[str, object]:
    require_scope(user, payload.state, entity_type="alert", entity_id=payload.entity_id or "new")
    alert, created = alert_service.generate_alert(
        kind=payload.kind,
        message=payload.message,
        state=payload.state,
        severity=payload.severity,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        rule_id=payload.rule_id,
        user_id=int(user["id"]),
    )
    return {**alert, "deduplicated": not created}


@router.patch('/alerts/{alert_id}/acknowledge')
def acknowledge_alert_endpoint(
    alert_id: int,
    user: dict[str, object] = Depends(require_write),
) -> dict[str, object]:
    with engine.connect() as db:
        alert = db.execute(
            text('SELECT id, state, status, user_id FROM resq_alerts WHERE id=:id'),
            {'id': alert_id},
        ).mappings().first()
    if not alert:
        raise HTTPException(status_code=404, detail='Alert not found')
    require_scope(user, alert.get("state"), entity_type="alert", entity_id=str(alert_id))
    result = alert_service.acknowledge_alert(alert_id, int(user["id"]))
    return result


@router.patch('/alerts/{alert_id}/resolve')
def resolve_alert_endpoint(
    alert_id: int,
    user: dict[str, object] = Depends(require_write),
) -> dict[str, object]:
    with engine.connect() as db:
        alert = db.execute(
            text('SELECT id, state, status, user_id FROM resq_alerts WHERE id=:id'),
            {'id': alert_id},
        ).mappings().first()
    if not alert:
        raise HTTPException(status_code=404, detail='Alert not found')
    require_scope(user, alert.get("state"), entity_type="alert", entity_id=str(alert_id))
    result = alert_service.resolve_alert(alert_id, int(user["id"]))
    return result


@router.patch('/alerts/{alert_id}/read')
def mark_alert_read(alert_id: int, user: dict[str, object] = Depends(current_user)) -> dict[str, bool]:
    with engine.connect() as db:
        alert = db.execute(
            text('SELECT id, state, user_id FROM resq_alerts WHERE id=:id'),
            {'id': alert_id},
        ).mappings().first()
    if not alert or (alert['user_id'] is not None and alert['user_id'] != user['id']):
        raise HTTPException(status_code=404, detail='Alert not found')
    require_scope(user, alert.get("state"), entity_type="alert", entity_id=str(alert_id))
    with engine.begin() as db:
        changed = db.execute(
            text('UPDATE resq_alerts SET read=true WHERE id=:id AND (user_id=:user_id OR user_id IS NULL)'),
            {'id': alert_id, 'user_id': user['id']},
        ).rowcount
    if not changed:
        raise HTTPException(status_code=404, detail='Alert not found')
    return {'ok': True}


@router.get('/alerts/rules')
def list_alert_rules(user: dict[str, object] = Depends(current_risk_user)) -> list[dict[str, object]]:
    with engine.connect() as db:
        rows = db.execute(
            text('SELECT id,name,kind,enabled,channel,state,severity,conditions,created_at FROM resq_alert_rules WHERE owner_id=:id OR :role=\'admin\' ORDER BY id'),
            {'id': user['id'], 'role': user['role']},
        ).mappings().all()
    return [dict(row) for row in rows]


@router.post('/alerts/rules', status_code=201)
def create_alert_rule(payload: AlertRuleRequest, user: dict[str, object] = Depends(require_staff_write)) -> dict[str, object]:
    if user.get('role') != 'admin':
        if not payload.state:
            raise HTTPException(status_code=422, detail='Choose a state for this rule')
        require_scope(user, payload.state, entity_type='alert_rule', entity_id='new')
    with engine.begin() as db:
        row = db.execute(
            text('INSERT INTO resq_alert_rules (owner_id,name,kind,enabled,channel,state,severity,conditions) '
                 'VALUES (:owner_id,:name,:kind,:enabled,:channel,:state,:severity,CAST(:conditions AS jsonb)) '
                 'RETURNING id,name,kind,enabled,channel,state,severity,conditions,created_at'),
            {
                'owner_id': user['id'],
                'name': payload.name,
                'kind': payload.kind,
                'enabled': payload.enabled,
                'channel': payload.channel,
                'state': payload.state,
                'severity': payload.severity,
                'conditions': json.dumps(payload.conditions) if isinstance(payload.conditions, dict) else payload.conditions,
            },
        ).mappings().one()
    return dict(row)


@router.get('/settings')
def get_settings(user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    with engine.connect() as db:
        row = db.execute(text('SELECT locale,theme,email_alerts,push_alerts FROM resq_user_settings WHERE user_id=:id'), {'id': user['id']}).mappings().one()
    return dict(row)


@router.patch('/settings')
def update_settings(payload: SettingsUpdate, user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    values = {key: value for key, value in payload.model_dump().items() if value is not None}
    if values.get('locale') not in {None, 'English', 'हिन्दी', 'తెలుగు', 'ଓଡ଼ିଆ', 'मराठी'}:
        raise HTTPException(status_code=422, detail='Unsupported locale')
    if values.get('theme') not in {None, 'auto', 'light', 'dark'}:
        raise HTTPException(status_code=422, detail='Unsupported theme')
    if values:
        assignments = ', '.join(f'{key}=:{key}' for key in values)
        with engine.begin() as db:
            db.execute(text(f'UPDATE resq_user_settings SET {assignments},updated_at=now() WHERE user_id=:user_id'), {**values, 'user_id': user['id']})
    return get_settings(user)


@router.post('/spread/jobs', status_code=202)
def create_spread_job(payload: SpreadRequest, _: dict[str, object] = Depends(require_write)) -> dict[str, object]:
    raise HTTPException(
        status_code=503,
        detail="Spread examples are unavailable until each run has isolated output storage and approved access controls.",
    )


@router.get('/spread/validation')
def get_spread_validation(month: str = '2024-01', _: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    if len(month) != 7 or month[:4] not in {'2023', '2024'}:
        raise HTTPException(status_code=422, detail='Validation is limited to imported 2023-2024 months')
    return validate_simulation(month)


@router.get("/notifications")
def list_notifications(user: dict[str, object] = Depends(current_redesign_user)) -> list[dict[str, object]]:
    return list_alerts(user=user)
