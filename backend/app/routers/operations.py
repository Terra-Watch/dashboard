from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from ..database.session import engine
from ..contracts.schemas import AlertRuleRequest, IncidentRequest, IncidentStatusUpdate, PlanRequest, SettingsUpdate, SpreadRequest
from ..core.security import current_user, require_write
from ..services.simulation_service import SimulationUnavailable, run_simulation, validate_simulation

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

@router.get("/incidents")
def list_incidents(_: dict[str, object] = Depends(current_user)) -> list[dict[str, object]]:
    with engine.connect() as db:
        return [dict(row) for row in db.execute(text("SELECT id,source,size,notes,status,created_at FROM resq_incidents ORDER BY created_at DESC")).mappings().all()]

@router.post("/incidents", status_code=201)
def create_incident(payload: IncidentRequest, user: dict[str, object] = Depends(require_write)) -> dict[str, object]:
    with engine.begin() as db:
        existing = db.execute(text("SELECT id,source,size,notes,status,created_at FROM resq_incidents WHERE client_key=:client_key"), {"client_key": payload.client_key}).mappings().first()
        if existing:
            return dict(existing)
        row = db.execute(text("INSERT INTO resq_incidents (reporter_id,client_key,source,size,notes) VALUES (:reporter_id,:client_key,:source,:size,:notes) RETURNING id,source,size,notes,status,created_at"), {"reporter_id": user["id"], **payload.model_dump()}).mappings().one()
    return dict(row)

@router.get('/incidents/{incident_id}')
def get_incident(incident_id: int, _: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    with engine.connect() as db:
        row = db.execute(text('SELECT id,source,size,notes,status,created_at FROM resq_incidents WHERE id=:id'), {'id': incident_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail='Incident not found')
    return dict(row)

@router.patch('/incidents/{incident_id}/status')
def update_incident_status(incident_id: int, payload: IncidentStatusUpdate, user: dict[str, object] = Depends(require_write)) -> dict[str, object]:
    allowed = {'reported', 'verified', 'responding', 'contained', 'closed'}
    if payload.status not in allowed:
        raise HTTPException(status_code=422, detail='Unknown incident status')
    with engine.begin() as db:
        row = db.execute(text('UPDATE resq_incidents SET status=:status WHERE id=:id RETURNING id,source,size,notes,status,created_at'), {'id': incident_id, 'status': payload.status}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail='Incident not found')
    return dict(row)

@router.get("/alerts")
def list_alerts(user: dict[str, object] = Depends(current_user)) -> list[dict[str, object]]:
    with engine.connect() as db:
        return [dict(row) for row in db.execute(text("SELECT id,kind,message,read,created_at FROM resq_alerts WHERE user_id=:id OR user_id IS NULL ORDER BY created_at DESC"), {"id": user["id"]}).mappings().all()]

@router.patch('/alerts/{alert_id}/read')
def mark_alert_read(alert_id: int, user: dict[str, object] = Depends(current_user)) -> dict[str, bool]:
    with engine.begin() as db:
        changed = db.execute(text('UPDATE resq_alerts SET read=true WHERE id=:id AND (user_id=:user_id OR user_id IS NULL)'), {'id': alert_id, 'user_id': user['id']}).rowcount
    if not changed:
        raise HTTPException(status_code=404, detail='Alert not found')
    return {'ok': True}

@router.get('/alerts/rules')
def list_alert_rules(user: dict[str, object] = Depends(current_user)) -> list[dict[str, object]]:
    with engine.connect() as db:
        rows = db.execute(text('SELECT id,name,kind,enabled,channel,created_at FROM resq_alert_rules WHERE owner_id=:id OR :role=\'admin\' ORDER BY id'), {'id': user['id'], 'role': user['role']}).mappings().all()
    return [dict(row) for row in rows]

@router.post('/alerts/rules', status_code=201)
def create_alert_rule(payload: AlertRuleRequest, user: dict[str, object] = Depends(require_write)) -> dict[str, object]:
    with engine.begin() as db:
        row = db.execute(text('INSERT INTO resq_alert_rules (owner_id,name,kind,enabled,channel) VALUES (:owner_id,:name,:kind,:enabled,:channel) RETURNING id,name,kind,enabled,channel,created_at'), {'owner_id': user['id'], **payload.model_dump()}).mappings().one()
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
    if abs(payload.latitude - 21.867894) < 0.2 and abs(payload.longitude - 86.500688) < 0.2:
        try:
            manifest = run_simulation()
        except SimulationUnavailable as exc:
            return {'status': 'unavailable', 'message': str(exc), 'request': payload.model_dump()}
        grid = manifest['grid']
        return {'status': 'development_demo', 'message': 'Simulation completed with uncalibrated WorldCover/GFS/SRTM demo inputs. This is not an operational forecast.', 'request': payload.model_dump(), 'scenario_id': manifest['scenario_id'], 'frame_count': manifest['frame_count'], 'grid_rows': grid['rows'], 'grid_columns': grid['columns'], 'burned_cells': manifest['burned_cells'], 'source_date': '2024-01-01', 'georeferenced': False}
    return {'status': 'unavailable', 'message': 'No validated simulation inputs are available for this location.', 'request': payload.model_dump()}

@router.get('/spread/validation')
def get_spread_validation(month: str = '2024-01', _: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    if len(month) != 7 or month[:4] not in {'2023', '2024'}:
        raise HTTPException(status_code=422, detail='Validation is limited to imported 2023-2024 months')
    return validate_simulation(month)

@router.get("/notifications")
def list_notifications(user: dict[str, object] = Depends(current_user)) -> list[dict[str, object]]:
    return list_alerts(user)
