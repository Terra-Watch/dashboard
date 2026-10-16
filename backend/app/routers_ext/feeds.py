"""Satellite hotspots and weather context for staff and assigned field officers (D-15, D-28)."""
import math
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..core.permissions import user_scopes
from ..core.security import current_redesign_user, require_csrf, require_roles
from ..database.session import engine
from ..services import audit_log
from ..services.feeds import SATELLITE_LABEL, FeedError, freshness
from ..services.feeds import firms, weather

router = APIRouter(prefix='/api', tags=['feeds'])
STAFF_ROLES = ('control_room_operator', 'incident_commander', 'officer')
MAX_ROWS = 5000
ACTIVE = ('assigned', 'accepted', 'in_progress')

_COLS = 'id,satellite,acq_datetime,latitude,longitude,frp,confidence,floor(extract(epoch from (now()-acq_datetime))/60)::int AS age_minutes'


def _items(rows) -> list[dict]:
    return [{**dict(r), 'acq_datetime': r['acq_datetime'].isoformat()} for r in rows]


def _last_fetch(db):
    return db.execute(text('SELECT max(fetched_at) FROM resq_hotspots')).scalar()


@router.get('/hotspots')
def hotspots(min_lat: float | None = Query(None, ge=-90, le=90), min_lon: float | None = Query(None, ge=-180, le=180),
             max_lat: float | None = Query(None, ge=-90, le=90), max_lon: float | None = Query(None, ge=-180, le=180),
             since_hours: int = Query(24, ge=1, le=168), user: dict = Depends(require_roles(*STAFF_ROLES))) -> dict:
    box = [min_lat, min_lon, max_lat, max_lon]
    if any(v is not None for v in box) and any(v is None for v in box):
        raise HTTPException(status_code=422, detail='Give all of min_lat, min_lon, max_lat, max_lon or none')
    where = ["acq_datetime >= now() - make_interval(hours => :h)"]
    params: dict = {'h': since_hours, 'lim': MAX_ROWS + 1}
    if min_lat is not None:
        where.append('latitude BETWEEN :a AND :c AND longitude BETWEEN :b AND :d')
        params.update(a=min_lat, b=min_lon, c=max_lat, d=max_lon)
    if user.get('role') != 'admin':
        scopes = sorted(user_scopes(int(user['id'])))
        if not scopes:
            with engine.connect() as db:
                last = _last_fetch(db)
            return {'items': [], 'truncated': False, 'freshness': freshness(firms.SOURCE, last), 'label': SATELLITE_LABEL}
        where.append('(state IS NULL OR state = ANY(:scopes))')
        params['scopes'] = scopes
    with engine.connect() as db:
        rows = db.execute(text(f"SELECT {_COLS} FROM resq_hotspots WHERE {' AND '.join(where)} ORDER BY acq_datetime DESC,id DESC LIMIT :lim"), params).mappings().all()
        last = _last_fetch(db)
    return {'items': _items(rows[:MAX_ROWS]), 'truncated': len(rows) > MAX_ROWS, 'freshness': freshness(firms.SOURCE, last), 'label': SATELLITE_LABEL}


@router.get('/hotspots/near-task/{assignment_id}')
def hotspots_near_task(assignment_id: int, radius_km: float = Query(10, gt=0, le=25), since_hours: int = Query(24, ge=1, le=168),
                       user: dict = Depends(current_redesign_user)) -> dict:
    if user.get('role') != 'field_crew':
        raise HTTPException(status_code=403, detail="Your role doesn't allow this")
    with engine.connect() as db:
        task = db.execute(text('''SELECT a.status,i.latitude,i.longitude FROM resq_incident_assignments a
            JOIN resq_incidents i ON i.id=a.incident_id WHERE a.id=:id AND a.ranger_id=:u'''), {'id': assignment_id, 'u': int(user['id'])}).mappings().first()
        if not task:
            raise HTTPException(status_code=404, detail='Assignment not found')
        if task['status'] not in ACTIVE:
            raise HTTPException(status_code=409, detail='Assignment is not active')
        if task['latitude'] is None or task['longitude'] is None:
            raise HTTPException(status_code=422, detail='Incident has no location')
        dlat = radius_km / 111.0
        dlon = radius_km / (111.0 * max(0.01, abs(math.cos(math.radians(task['latitude'])))))
        rows = db.execute(text(f'''SELECT * FROM (SELECT {_COLS}, 6371.0*2*asin(least(1.0,sqrt(
              power(sin(radians(latitude-:la)/2),2)+cos(radians(:la))*cos(radians(latitude))*power(sin(radians(longitude-:lo)/2),2)))) AS distance_km
            FROM resq_hotspots WHERE acq_datetime >= now() - make_interval(hours => :h)
              AND latitude BETWEEN :la-:dlat AND :la+:dlat AND longitude BETWEEN :lo-:dlon AND :lo+:dlon) t
            WHERE distance_km <= :r ORDER BY distance_km LIMIT :lim'''),
                          {'la': task['latitude'], 'lo': task['longitude'], 'h': since_hours, 'dlat': dlat, 'dlon': dlon, 'r': radius_km, 'lim': MAX_ROWS}).mappings().all()
        last = _last_fetch(db)
    items = [{**i, 'distance_km': round(i['distance_km'], 2)} for i in _items(rows)]
    return {'items': items, 'radius_km': radius_km, 'freshness': freshness(firms.SOURCE, last), 'label': SATELLITE_LABEL}


@router.get('/weather/context')
def weather_context(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180),
                    user: dict = Depends(require_roles(*STAFF_ROLES, 'field_crew', 'range_officer'))) -> dict:
    try:
        row, was_cached = weather.context(lat, lon)
    except FeedError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None
    out = {'wind_speed_ms': row['wind_speed_ms'], 'wind_dir_deg': row['wind_dir_deg'], 'valid_time': row['valid_time'].isoformat(),
           'lat_cell': row['lat_cell'], 'lon_cell': row['lon_cell'], 'cached': was_cached,
           'freshness': freshness(row['source'], row['fetched_at'])}
    if user.get('role') not in ('field_crew', 'range_officer'):  # D4: officers get wind now; humidity and temperature are for the Control Room
        out.update(temperature_c=row['temperature_c'], humidity_pct=row['humidity_pct'])
    return out


class RefreshRequest(BaseModel):
    bbox: list[float] = Field(min_length=4, max_length=4)
    days: int = Field(1, ge=1, le=5)


@router.post('/admin/feeds/refresh', dependencies=[Depends(require_csrf)])
def refresh(payload: RefreshRequest, user: dict = Depends(require_roles())) -> dict:
    if not os.environ.get('FIRMS_MAP_KEY', '').strip():
        raise HTTPException(status_code=503, detail='Satellite feed is not connected: FIRMS_MAP_KEY is not set on the server')
    try:
        result = firms.fetch_area(payload.bbox, payload.days)
    except FeedError as exc:
        raise HTTPException(status_code=502 if not exc.not_configured else 503, detail=str(exc)) from None
    audit_log.write_audit_log(action='feeds_refresh', entity_type='feed', entity_id='nasa-firms', user_id=int(user['id']),
                              metadata={'bbox': payload.bbox, 'days': payload.days, 'fetched': result['fetched'], 'inserted': result['inserted']})
    return {**result, 'freshness': freshness(firms.SOURCE, datetime.now(timezone.utc))}
