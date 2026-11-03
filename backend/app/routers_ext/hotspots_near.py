"""Satellite detections near a point, for rangers (read-only): the same hotspots staff see, limited to the ranger's states, with distance and direction from where they stand."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text

from ..core.permissions import user_scopes
from ..core.security import require_roles
from ..database.session import engine
from ..services import stations as geo
from ..services.feeds import SATELLITE_LABEL

router = APIRouter(prefix='/api', tags=['hotspots'])


@router.get('/hotspots/near')
def hotspots_near(lat: float = Query(ge=-90, le=90), lon: float = Query(ge=-180, le=180), radius_km: float = Query(30, gt=0, le=100), since_hours: int = Query(24, ge=1, le=72),
                  user: dict = Depends(require_roles('control_room_operator', 'incident_commander', 'officer', 'field_crew', 'range_officer'))) -> dict:
    where = ['acq_datetime >= now() - make_interval(hours => :h)', 'latitude BETWEEN :a AND :b', 'longitude BETWEEN :c AND :d']
    d = radius_km / 111.0
    params: dict = {'h': since_hours, 'a': lat - d, 'b': lat + d, 'c': lon - d * 1.2, 'd': lon + d * 1.2}
    if user.get('role') != 'admin':
        scopes = sorted(user_scopes(int(user['id'])))
        if not scopes: return {'label': SATELLITE_LABEL, 'items': []}
        where.append('(state IS NULL OR state = ANY(:scopes))'); params['scopes'] = scopes
    with engine.connect() as db:
        rows = db.execute(text(f"SELECT id,satellite,acq_datetime,latitude,longitude,frp,confidence,floor(extract(epoch from (now()-acq_datetime))/60)::int AS age_minutes FROM resq_hotspots WHERE {' AND '.join(where)}"), params).mappings().all()
    items = []
    for r in rows:
        km = geo.distance_km(lat, lon, r['latitude'], r['longitude'])
        if km <= radius_km: items.append({'id': r['id'], 'satellite': r['satellite'], 'acq_datetime': r['acq_datetime'].isoformat(), 'latitude': r['latitude'], 'longitude': r['longitude'], 'frp': r['frp'],
                                          'confidence': r['confidence'], 'age_minutes': r['age_minutes'], 'distance_km': round(km, 1), 'bearing': geo.compass_point(geo.bearing_deg(lat, lon, r['latitude'], r['longitude']))})
    items.sort(key=lambda x: x['distance_km'])
    return {'label': SATELLITE_LABEL, 'items': items[:200]}
