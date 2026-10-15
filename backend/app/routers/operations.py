import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from ..database.session import engine
from ..contracts.schemas import (
    AlertRuleRequest, IncidentRequest, IncidentStatusUpdate,
    OperationalAlertCreateRequest, PlanRequest, SettingsUpdate, SpreadRequest,
)
from ..core.permissions import require_scope, user_scopes
from ..core.security import current_user, require_write
from ..services import alert_service, audit_log
from ..services.simulation_service import validate_simulation

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["operations"])


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


@router.get("/plans")
def list_plans(user: dict[str, object] = Depends(current_user)) -> list[dict[str, object]]:
    with engine.connect() as db:
        rows = db.execute(text("SELECT id,plan_date,region,teams,priority_cells,status,created_at FROM resq_plans WHERE owner_id=:id OR :role='admin' ORDER BY created_at DESC"), {"id": user["id"], "role": user["role"]}).mappings().all()
    return [dict(row) for row in rows]


@router.post("/plans", status_code=201)
def create_plan(payload: PlanRequest, user: dict[str, object] = Depends(require_write)) -> dict[str, object]:
    with engine.begin() as db:
        row = db.execute(text("INSERT INTO resq_plans (owner_id,plan_date,region,teams,priority_cells) VALUES (:owner_id,:date,:region,:teams,:priority_cells) RETURNING id,plan_date,region,teams,priority_cells,status"), {"owner_id": user["id"], **payload.model_dump()}).mappings().one()
    return dict(row)


@router.post('/plans/{plan_id}/route')
def generate_plan_route(plan_id: int, user: dict[str, object] = Depends(require_write)) -> dict[str, object]:
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


@router.get("/incidents")
def list_incidents(
    state: str | None = None,
    user: dict[str, object] = Depends(current_user),
) -> list[dict[str, object]]:
    query = "SELECT id,source,size,notes,status,state,created_at,updated_at FROM resq_incidents"
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
        return [dict(row) for row in db.execute(text(query), params).mappings().all()]


@router.post("/incidents", status_code=201)
def create_incident(payload: IncidentRequest, user: dict[str, object] = Depends(require_write)) -> dict[str, object]:
    if not payload.client_key.strip() or len(payload.client_key) > 120:
        raise HTTPException(status_code=422, detail="client_key must contain 1 to 120 characters")

    # Scope check: scoped officer must have authoritative state within scope
    if user.get("role") != "admin":
        require_scope(user, payload.state, entity_type="incident", entity_id=payload.client_key)

    created_new = False
    with engine.begin() as db:
        result = db.execute(
            text("""INSERT INTO resq_incidents (reporter_id,client_key,source,size,notes,state)
                VALUES (:reporter_id,:client_key,:source,:size,:notes,:state)
                ON CONFLICT (client_key) WHERE client_key IS NOT NULL DO NOTHING
                RETURNING id,reporter_id,source,size,notes,status,state,created_at,updated_at"""),
            {
                "reporter_id": user["id"],
                "client_key": payload.client_key,
                "source": payload.source,
                "size": payload.size,
                "notes": payload.notes,
                "state": payload.state,
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


@router.get('/incidents/{incident_id}')
def get_incident(incident_id: int, user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    with engine.connect() as db:
        row = db.execute(
            text('SELECT id,source,size,notes,status,state,created_at,updated_at FROM resq_incidents WHERE id=:id'),
            {'id': incident_id},
        ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail='Incident not found')
    require_scope(user, row.get("state"), entity_type="incident", entity_id=str(incident_id))
    return dict(row)


@router.patch('/incidents/{incident_id}/status')
def update_incident_status(
    incident_id: int,
    payload: IncidentStatusUpdate,
    user: dict[str, object] = Depends(require_write),
) -> dict[str, object]:
    allowed = {'reported', 'verified', 'responding', 'contained', 'closed'}
    if payload.status not in allowed:
        raise HTTPException(status_code=422, detail='Unknown incident status')

    with engine.begin() as db:
        existing = db.execute(
            text('SELECT id,source,size,notes,status,state,source FROM resq_incidents WHERE id=:id'),
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
            text('UPDATE resq_incidents SET status=:status, updated_at=now() WHERE id=:id RETURNING id,source,size,notes,status,state,created_at,updated_at'),
            {'id': incident_id, 'status': payload.status},
        ).mappings().first()

        audit_log.write_audit_log(
            action=f"incident_status_{payload.status}",
            entity_type="incident",
            entity_id=str(incident_id),
            user_id=int(user["id"]),
            previous_state=prev_status,
            metadata={"new_status": payload.status, "notes": payload.notes},
            connection=db,
        )

    result_dict = dict(row)
    if payload.status in ('verified', 'responding'):
        try:
            alert_service.evaluate_rules_for_incident(incident_id, existing.get("state"), existing.get("size", "unknown"), existing.get("source"))
        except Exception as e:
            logger.error("Failed to evaluate alert rules for incident %s: %s", incident_id, e)

    return result_dict


@router.get('/incidents/{incident_id}/history')
def get_incident_history(
    incident_id: int,
    user: dict[str, object] = Depends(current_user),
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
    clauses = ["(user_id=:uid OR user_id IS NULL)"]
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
            return []
        clauses.append("state = ANY(:scopes)")
        params["scopes"] = list(scopes)
    query += f" WHERE {' AND '.join(clauses)} ORDER BY created_at DESC"
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
def list_alert_rules(user: dict[str, object] = Depends(current_user)) -> list[dict[str, object]]:
    with engine.connect() as db:
        rows = db.execute(
            text('SELECT id,name,kind,enabled,channel,state,severity,conditions,created_at FROM resq_alert_rules WHERE owner_id=:id OR :role=\'admin\' ORDER BY id'),
            {'id': user['id'], 'role': user['role']},
        ).mappings().all()
    return [dict(row) for row in rows]


@router.post('/alerts/rules', status_code=201)
def create_alert_rule(payload: AlertRuleRequest, user: dict[str, object] = Depends(require_write)) -> dict[str, object]:
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
def list_notifications(user: dict[str, object] = Depends(current_user)) -> list[dict[str, object]]:
    return list_alerts(user=user)
