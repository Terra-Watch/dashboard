"""Unauthenticated, GET-only public endpoints: emergency contacts (D-02) and the coarsened public map (D-14).

Environment (no defaults anywhere):
  EMERGENCY_CONTACTS            JSON list of {"label","number","region"?}; invalid or unset -> configured:false.
  PUBLIC_MAP_ENABLED            must be "true".
  PUBLIC_MAP_H3_RESOLUTION      integer 3..9.
  PUBLIC_MAP_DELAY_MINUTES      integer >= 0.
  PUBLIC_RATE_LIMIT_PER_MINUTE  positive integer, per client IP, in-process (per worker). Unset or invalid -> no limit is applied.
Verified time: resq_incidents.updated_at is used as the time the incident reached its current public status (conservative:
any later status change restarts the delay). Never exposes coordinates, ids, notes or reporter data.
"""
import json
import logging
import os
import re
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text

from ..database.session import engine
from ..services.h3_coarsen import to_cell

logger = logging.getLogger(__name__)
NUMBER_RE = re.compile(r'^[+0-9][0-9 ()-]{2,20}$')
SEVERITY = {'verified': 3, 'responding': 2, 'contained': 1}
_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def _rate_limit(request: Request) -> None:
    raw = os.environ.get('PUBLIC_RATE_LIMIT_PER_MINUTE', '').strip()
    if not raw.isdigit() or int(raw) < 1:
        return
    limit, now = int(raw), time.monotonic()
    ip = request.client.host if request.client else 'unknown'
    with _lock:
        window = _hits[ip]
        while window and now - window[0] > 60:
            window.popleft()
        if len(window) >= limit:
            raise HTTPException(status_code=429, detail='Too many requests', headers={'Retry-After': '60'})
        window.append(now)


def reset_rate_limit_for_tests() -> None:
    with _lock:
        _hits.clear()


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
