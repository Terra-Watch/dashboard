"""Where reports point: wedges from recent citizen reports that carry a compass reading, and the areas where several of them overlap (Control Room map layer)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text

from ..core.permissions import scope_clause
from ..core.security import require_roles
from ..database.session import engine
from ..services import bearings

router = APIRouter(prefix='/api', tags=['bearings'])
STAFF_ROLES = ('control_room_operator', 'incident_commander', 'officer')
LABEL = 'Estimated from phone compasses: a search area, not a position. Nobody has checked it.'


@router.get('/bearings')
def report_bearings(since_hours: int = Query(6, ge=1, le=48), user: dict = Depends(require_roles(*STAFF_ROLES))) -> dict:
    clause, params = scope_clause(user, 'i.state', 'i.community_id', include_uncovered=True)
    with engine.connect() as db:
        rows = db.execute(text(f'''SELECT i.id, i.state, i.status, COALESCE(i.observed_at, i.created_at) AS seen_at,
                   b.observer_lat, b.observer_lon, b.bearing_deg, b.source, b.distance_band
            FROM resq_report_bearings b JOIN resq_incidents i ON i.id = b.incident_id
            WHERE i.status <> 'closed' AND COALESCE(i.observed_at, i.created_at) >= now() - make_interval(hours => :h) AND ({clause})
            ORDER BY seen_at DESC LIMIT 500'''), {'h': since_hours, **params}).mappings().all()
    wedges, shapes = [], []
    for r in rows:
        poly = bearings.report_wedge(r['observer_lat'], r['observer_lon'], float(r['bearing_deg']), r['source'], r['distance_band'])
        shapes.append({'id': r['id'], 'polygon': poly})
        wedges.append({'incident_id': r['id'], 'state': r['state'], 'status': r['status'], 'seen_at': r['seen_at'].isoformat(),
                       'observer': [r['observer_lat'], r['observer_lon']], 'bearing_deg': float(r['bearing_deg']),
                       'source': r['source'], 'distance_band': r['distance_band'], 'coords': bearings.to_coords(poly)})
    areas = [{'incident_ids': a['ids'], 'count': a['count'], 'area_km2': round(a['area_km2'], 2), 'centroid': [round(a['centroid'][0], 5), round(a['centroid'][1], 5)],
              'coords': bearings.to_coords(a['polygon'])} for a in bearings.search_areas(shapes)]
    return {'label': LABEL, 'since_hours': since_hours, 'wedges': wedges, 'areas': areas}
