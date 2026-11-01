"""Unauthenticated, GET-only public endpoints: emergency contacts (D-02) and the coarsened public map (D-14).

Environment (no defaults anywhere):
  EMERGENCY_CONTACTS            JSON list of {"label","number","region"?}; invalid or unset -> configured:false.
  PUBLIC_MAP_ENABLED            must be "true".
  PUBLIC_MAP_H3_RESOLUTION      integer 3..9.
  PUBLIC_MAP_DELAY_MINUTES      integer >= 0.
  PUBLIC_RATE_LIMIT_PER_MINUTE  positive integer, per client IP, counted in Postgres so every worker shares it. Unset or invalid -> no limit is applied.
Verified time: resq_incidents.updated_at is used as the time the incident reached its current public status (conservative:
any later status change restarts the delay). Never exposes coordinates, ids, notes or reporter data.
"""
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone

import math

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import text

from ..core.security import client_ip
from ..database.session import engine
from ..services import public_photo
from ..services.h3_coarsen import to_cell

logger = logging.getLogger(__name__)
NUMBER_RE = re.compile(r'^[+0-9][0-9 ()-]{2,20}$')
SEVERITY = {'verified': 3, 'responding': 2, 'contained': 1}


def _rate_limit(request: Request) -> None:
    raw = os.environ.get('PUBLIC_RATE_LIMIT_PER_MINUTE', '').strip()
    if not raw.isdigit() or int(raw) < 1:
        return
    ip = client_ip(request)
    with engine.begin() as db:
        db.execute(text("DELETE FROM resq_public_hits WHERE hit_at < now() - interval '1 minute'"))
        over = db.execute(text('SELECT count(*) FROM resq_public_hits WHERE ip=:ip'), {'ip': ip}).scalar() >= int(raw)
        if not over:
            db.execute(text('INSERT INTO resq_public_hits (ip) VALUES (:ip)'), {'ip': ip})
    if over:
        raise HTTPException(status_code=429, detail='Too many requests', headers={'Retry-After': '60'})


router = APIRouter(prefix='/api/public', tags=['public'], dependencies=[Depends(_rate_limit)])


def _contacts() -> list[dict] | None:
    raw = os.environ.get('EMERGENCY_CONTACTS', '').strip()
    if not raw:
        return None
    try:
        data = json.loads(raw)
        if not isinstance(data, list) or not data:
            raise ValueError('must be a non-empty list')
        items = []
        for entry in data:
            if not isinstance(entry, dict) or set(entry) - {'label', 'number', 'region'}:
                raise ValueError('entries allow only label, number, region')
            label, number, region = entry.get('label'), entry.get('number'), entry.get('region')
            if not isinstance(label, str) or not label.strip() or len(label) > 80:
                raise ValueError('label required')
            if not isinstance(number, str) or not NUMBER_RE.match(number):
                raise ValueError('number invalid')
            if region is not None and (not isinstance(region, str) or not region.strip() or len(region) > 30):
                raise ValueError('region invalid')
            item = {'label': label.strip(), 'number': number}
            if region is not None:
                item['region'] = region.strip()
            items.append(item)
        return items
    except (ValueError, TypeError) as exc:  # json.JSONDecodeError is a ValueError
        logger.warning('EMERGENCY_CONTACTS is invalid and was ignored: %s', exc)
        return None


@router.get('/contacts')
def contacts() -> dict:
    items = _contacts()
    return {'configured': True, 'items': items} if items else {'configured': False, 'items': []}


def _map_config() -> tuple[int, int] | None:
    if os.environ.get('PUBLIC_MAP_ENABLED', '').strip().lower() != 'true':
        return None
    try:
        res_raw, delay_raw = os.environ['PUBLIC_MAP_H3_RESOLUTION'].strip(), os.environ['PUBLIC_MAP_DELAY_MINUTES'].strip()
        if not re.fullmatch(r'\d+', res_raw) or not re.fullmatch(r'\d+', delay_raw):
            return None
        resolution, delay = int(res_raw), int(delay_raw)
    except KeyError:
        return None
    return (resolution, delay) if 3 <= resolution <= 9 else None


def _floor15(moment: datetime) -> datetime:
    moment = moment.astimezone(timezone.utc)
    return moment.replace(minute=moment.minute - moment.minute % 15, second=0, microsecond=0)


def _cells(resolution: int, delay: int) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=delay)
    with engine.connect() as db:
        rows = db.execute(text('''SELECT latitude,longitude,status,updated_at FROM resq_incidents
            WHERE status IN ('verified','responding','contained') AND latitude IS NOT NULL AND longitude IS NOT NULL AND updated_at<=:cutoff'''),
                          {'cutoff': cutoff}).mappings().all()
    cells: dict[str, dict] = {}
    for row in rows:
        cell = to_cell(row['latitude'], row['longitude'], resolution)
        entry = cells.setdefault(cell, {'cell': cell, 'count': 0, 'status': row['status'], 'latest': row['updated_at']})
        entry['count'] += 1
        if SEVERITY[row['status']] > SEVERITY[entry['status']]:
            entry['status'] = row['status']
        entry['latest'] = max(entry['latest'], row['updated_at'])
    return sorted(({'cell': c['cell'], 'count': c['count'], 'status': c['status'], 'as_of': _floor15(c['latest']).isoformat()} for c in cells.values()),
                  key=lambda item: item['cell'])


@router.get('/incidents')
def public_incidents() -> dict:
    config = _map_config()
    if not config:
        return {'enabled': False, 'items': []}
    resolution, delay = config
    return {'enabled': True, 'resolution': resolution, 'delay_minutes': delay, 'generated_at': datetime.now(timezone.utc).isoformat(),
            'items': _cells(resolution, delay)}


@router.get('/status')
def public_status() -> dict:
    config = _map_config()
    if not config:
        return {'enabled': False, 'summary': None}
    items = _cells(*config)
    if not items:
        return {'enabled': True, 'summary': None}
    newest = max(datetime.fromisoformat(item['as_of']) for item in items)
    minutes = max(0, int((datetime.now(timezone.utc) - newest).total_seconds() // 60))
    noun = 'area' if len(items) == 1 else 'areas'
    return {'enabled': True, 'summary': f'{len(items)} verified {noun} · updated {minutes} min ago'}


# ---- unverified and confirmed citizen reports with their cleaned photos (docs/REPORT_TO_ALERT_DESIGN.md) ----
CONFIRMED = ('verified', 'responding', 'contained')


def _reports_resolution() -> int:
    raw = os.environ.get('PUBLIC_REPORTS_H3_RESOLUTION', '7').strip()
    return int(raw) if raw.isdigit() and 3 <= int(raw) <= 9 else 7


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 12742 * math.asin(math.sqrt(a))


@router.get('/reports')
def public_reports(lat: float | None = None, lon: float | None = None, radius_km: float = 25.0) -> dict:
    """Reports a person can see on the Near me page. Coarse position only (centre of an H3 cell); never the reporter, exact pin or original photo.
    Unverified ones carry label 'unverified'. Nothing is returned for a closed incident, a held or withdrawn photo, or a note with a link or phone number."""
    if not public_photo.enabled():
        return {'enabled': False, 'items': []}
    if (lat is None) != (lon is None) or (lat is not None and not (-90 <= lat <= 90 and -180 <= (lon or 0) <= 180)):
        raise HTTPException(status_code=422, detail='Give both lat and lon, or neither')
    radius = min(max(radius_km, 1.0), 100.0)
    hours = public_photo.unverified_hours()
    with engine.connect() as db:
        rows = db.execute(text("""SELECT i.id,i.status,i.notes,i.latitude,i.longitude,i.created_at,i.updated_at,
              (SELECT array_agg(g.id ORDER BY g.created_at) FROM resq_incident_images g WHERE g.incident_id=i.id AND g.public_state='visible') AS photo_ids
            FROM resq_incidents i
            WHERE i.latitude IS NOT NULL AND i.longitude IS NOT NULL
              AND ((i.status='reported' AND i.created_at > now() - make_interval(hours => :hours))
                OR (i.status IN ('verified','responding','contained') AND i.updated_at > now() - interval '24 hours'))
              AND EXISTS (SELECT 1 FROM resq_incident_images g WHERE g.incident_id=i.id AND g.public_state='visible')
            ORDER BY i.created_at DESC LIMIT 200"""), {'hours': hours}).mappings().all()
    resolution, items = _reports_resolution(), []
    for row in rows:
        if not public_photo.text_is_public_safe(row['notes']):
            continue
        cell = to_cell(row['latitude'], row['longitude'], resolution)
        import h3
        clat, clon = h3.cell_to_latlng(cell)
        distance = _km(lat, lon, clat, clon) if lat is not None else None
        if distance is not None and distance > radius:
            continue
        confirmed = row['status'] in CONFIRMED
        items.append({
            'id': row['id'], 'label': 'confirmed' if confirmed else 'unverified',
            'text': ('Fire reported and confirmed by officials.' if confirmed else 'Unverified: reported by a citizen, not checked by officials.'),
            'note': (row['notes'] or '').strip()[:200] or None, 'lat': round(clat, 4), 'lon': round(clon, 4),
            'distance_km': None if distance is None else round(distance), 'reported_at': row['created_at'].isoformat(),
            'photos': [f"/api/public/reports/{row['id']}/photos/{pid}" for pid in (row['photo_ids'] or [])][:4],
        })
    return {'enabled': True, 'unverified_hours': hours, 'items': items}


@router.get('/reports/{incident_id}/photos/{image_id}')
async def public_report_photo(incident_id: int, image_id: int) -> Response:
    if not public_photo.enabled():
        raise HTTPException(status_code=404, detail='Not found')
    with engine.connect() as db:
        row = db.execute(text("""SELECT g.public_key,g.public_sha256,i.status,i.notes FROM resq_incident_images g JOIN resq_incidents i ON i.id=g.incident_id
            WHERE g.id=:g AND g.incident_id=:i AND g.public_state='visible' AND g.public_key IS NOT NULL AND i.status<>'closed'"""), {'g': image_id, 'i': incident_id}).mappings().first()
    if not row or not public_photo.text_is_public_safe(row['notes']):
        raise HTTPException(status_code=404, detail='Not found')
    data = await public_photo.read_copy(row['public_key'], row['public_sha256'])
    if data is None:
        raise HTTPException(status_code=404, detail='Not found')
    return Response(data, media_type='image/jpeg', headers={'Cache-Control': 'public, max-age=20, s-maxage=20', 'X-Content-Type-Options': 'nosniff'})
