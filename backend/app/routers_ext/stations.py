"""Lookout stations: the gateway bridge's ingest endpoint, the station list and detail for staff and rangers, nearby evidence, and "create a check" (docs/STATIONS_DESIGN.md)."""
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..core.permissions import scope_clause
from ..core.regions import state_at
from ..core.security import require_csrf, require_roles
from ..database.session import engine
from ..services import audit_log, communities, stations as st
from ..services.alert_service import generate_alert
from ..services.recipients import incident_staff_recipients

router = APIRouter(prefix='/api', tags=['stations'])
STAFF = ('control_room_operator', 'incident_commander', 'officer')
FIELD = ('field_crew', 'range_officer')
LABEL = 'Readings come from sensors, not people. A high reading is a prompt to check, not a fire.'
MAX_BATCH, MAX_BODY = 500, 256 * 1024


def _gateway_secret(gateway_id: str) -> str | None:
    """STATION_GATEWAY_KEYS="id:secret,id2:secret2". No default: with nothing set, ingest is off."""
    for pair in os.getenv('STATION_GATEWAY_KEYS', '').split(','):
        gid, _, secret = pair.strip().partition(':')
        if gid and secret and gid == gateway_id: return secret
    return None


class Reading(BaseModel):
    node_id: int = Field(ge=1, le=253)
    seq: int = Field(default=0, ge=0, le=65535)
    received_at: datetime | None = None
    rssi: int | None = Field(default=None, ge=-200, le=0)
    snr: float | None = Field(default=None, ge=-50, le=50)
    hops: int | None = Field(default=None, ge=0, le=32)
    payload_hex: str = Field(min_length=2, max_length=64, pattern=r'^[0-9a-fA-F]+$')


class IngestBody(BaseModel):
    readings: list[Reading] = Field(max_length=MAX_BATCH)


@router.post('/stations/ingest')
async def ingest(request: Request) -> dict:
    raw = await request.body()
    if len(raw) > MAX_BODY: raise HTTPException(status_code=413, detail='Batch too large')
    gid = request.headers.get('x-gateway-id', ''); secret = _gateway_secret(gid)
    if not os.getenv('STATION_GATEWAY_KEYS'): raise HTTPException(status_code=503, detail='Station ingest is not configured')
    sig = hmac.new((secret or 'x').encode(), raw, hashlib.sha256).hexdigest()
    if secret is None or not hmac.compare_digest(sig, request.headers.get('x-signature', '')): raise HTTPException(status_code=401, detail='Bad gateway signature')
    try: body = IngestBody.model_validate(json.loads(raw))
    except Exception as exc: raise HTTPException(status_code=422, detail='Malformed batch') from exc
    now = datetime.now(timezone.utc); out = {'stored': 0, 'duplicate': 0, 'unknown_node': 0, 'invalid': 0}; new_sounds = []
    with engine.begin() as db:
        ids = {r['node_id']: (r['id'], r['active']) for r in db.execute(text('SELECT id,node_id,active FROM resq_stations')).mappings()}
        for r in body.readings:
            at = (r.received_at or now); at = at if at.tzinfo else at.replace(tzinfo=timezone.utc)
            raw_payload = bytes.fromhex(r.payload_hex) if len(r.payload_hex) % 2 == 0 else b''
            vals = st.decode_payload(raw_payload); sound = None if vals else st.decode_sound(raw_payload); pos = None if vals or sound else st.decode_position(raw_payload)
            if (vals is None and sound is None and pos is None) or at > now + timedelta(minutes=5) or at < now - timedelta(days=7): out['invalid'] += 1; continue
            sid = ids.get(r.node_id)
            if sid is None or not sid[1]:
                db.execute(text('''INSERT INTO resq_station_unknown (node_id,reported_lat,reported_lon,reported_at) VALUES (:n,:la,:lo,CASE WHEN CAST(:la AS float) IS NULL THEN NULL ELSE now() END)
                    ON CONFLICT (node_id) DO UPDATE SET last_heard=now(), heard=resq_station_unknown.heard+1,
                    reported_lat=COALESCE(CAST(:la AS float), resq_station_unknown.reported_lat), reported_lon=COALESCE(CAST(:lo AS float), resq_station_unknown.reported_lon),
                    reported_at=CASE WHEN CAST(:la AS float) IS NULL THEN resq_station_unknown.reported_at ELSE now() END'''), {'n': r.node_id, 'la': pos and pos['latitude'], 'lo': pos and pos['longitude']})
                out['unknown_node'] += 1; continue
            if pos:
                res = db.execute(text('UPDATE resq_stations SET reported_lat=:la, reported_lon=:lo, reported_at=:at WHERE id=:s AND (reported_at IS NULL OR reported_at < :at)'), {'la': pos['latitude'], 'lo': pos['longitude'], 'at': at, 's': sid[0]})
                out['stored'] += 1; continue
            if sound:
                res = db.execute(text('''INSERT INTO resq_station_sounds (station_id,received_at,node_seq,rssi,snr,kind,confidence) VALUES (:s,:at,:seq,:rssi,:snr,:k,:c) ON CONFLICT DO NOTHING'''),
                                 {'s': sid[0], 'at': at, 'seq': r.seq, 'rssi': r.rssi, 'snr': r.snr, 'k': sound['kind'], 'c': sound['confidence']})
                if res.rowcount: new_sounds.append((sid[0], sound))
                out['duplicate' if res.rowcount == 0 else 'stored'] += 1; continue
            res = db.execute(text('''INSERT INTO resq_station_readings (station_id,received_at,node_seq,rssi,snr,hops,temp_c,humidity_pct,pm25,pm10,battery_mv,flags)
                VALUES (:s,:at,:seq,:rssi,:snr,:hops,:t,:h,:p25,:p10,:b,:f) ON CONFLICT DO NOTHING'''), {
                's': sid[0], 'at': at, 'seq': r.seq, 'rssi': r.rssi, 'snr': r.snr, 'hops': r.hops, 't': vals['temp_c'], 'h': vals['humidity_pct'],
                'p25': vals['pm25'], 'p10': vals['pm10'], 'b': vals['battery_mv'], 'f': vals['flags']})
            out['duplicate' if res.rowcount == 0 else 'stored'] += 1
    for sid, sound in new_sounds: _sound_alert(sid, sound)
    return out


def _sound_alert(station_id: int, sound: dict) -> None:
    """Tell the staff of the station's area what its sound classifier heard. It is a prompt to check, not a confirmed event."""
    with engine.connect() as db:
        s = db.execute(text('SELECT name,state,community_id,latitude,longitude FROM resq_stations WHERE id=:i'), {'i': station_id}).mappings().first()
        cid = communities.at_point(db, s['latitude'], s['longitude']) if s and s['community_id'] is None else (s['community_id'] if s else None)
    if not s: return
    what = {'chainsaw': 'a chainsaw', 'blast': 'a gunshot or blast', 'fire': 'an open fire crackling'}.get(sound['kind'], 'an unusual sound')
    for rid in incident_staff_recipients(s['state'], community_id=cid):
        generate_alert(kind='station_sound', message=f"Station '{s['name']}' heard what sounds like {what} ({sound['confidence']} % sure). A sound classifier, not a person: check it.",
                       state=s['state'], severity='warning', entity_type='station', entity_id=str(station_id), user_id=rid)


_LIST = '''SELECT s.id,s.node_id,s.name,s.latitude,s.longitude,s.state,s.community_id,s.kind,s.expected_interval_s,s.installed_at,s.notes,s.reported_lat,s.reported_lon,s.reported_at,
       l.received_at AS last_heard,ls.kind AS sound_kind,ls.confidence AS sound_confidence,ls.received_at AS sound_at,l.temp_c,l.humidity_pct,l.pm25,l.pm10,l.battery_mv,l.rssi,l.snr,l.hops,l.flags,b.base AS pm25_normal
  FROM resq_stations s
  LEFT JOIN LATERAL (SELECT * FROM resq_station_readings r WHERE r.station_id=s.id ORDER BY r.received_at DESC LIMIT 1) l ON TRUE
  LEFT JOIN LATERAL (SELECT kind,confidence,received_at FROM resq_station_sounds x WHERE x.station_id=s.id AND x.received_at >= now() - interval '6 hours' ORDER BY x.received_at DESC LIMIT 1) ls ON TRUE
  LEFT JOIN LATERAL (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY pm25) AS base FROM resq_station_readings r
        WHERE r.station_id=s.id AND r.pm25 IS NOT NULL AND r.received_at >= now() - interval '24 hours' AND r.received_at < now() - interval '15 minutes') b ON TRUE
 WHERE s.active AND ({clause})'''


def _shape(r, lat=None, lon=None) -> dict:
    d = dict(r); now = datetime.now(timezone.utc)
    d['status'] = st.status_of(d['last_heard'], d['expected_interval_s'], now)
    d['age_s'] = int((now - d['last_heard']).total_seconds()) if d['last_heard'] else None
    base = d.pop('pm25_normal'); d['pm25_normal'] = round(float(base), 1) if base is not None else None
    d['pm25_vs_normal'] = round(d['pm25'] / base, 2) if d['pm25'] is not None and base and base >= 1 else None
    sk, sc, sa = d.pop('sound_kind', None), d.pop('sound_confidence', None), d.pop('sound_at', None)
    d['last_sound'] = {'kind': sk, 'confidence': sc, 'age_s': int((now - sa).total_seconds())} if sk else None
    rl, rn, ra = d.pop('reported_lat'), d.pop('reported_lon'), d.pop('reported_at')
    d['reported'] = {'latitude': rl, 'longitude': rn, 'at': ra.isoformat(), 'offset_km': round(st.distance_km(rl, rn, d['latitude'], d['longitude']), 2)} if rl is not None and ra else None
    for k in ('last_heard', 'installed_at'): d[k] = d[k].isoformat() if d[k] else None
    if lat is not None and lon is not None:
        d['distance_km'] = round(st.distance_km(lat, lon, d['latitude'], d['longitude']), 1)
        d['bearing'] = st.compass_point(st.bearing_deg(lat, lon, d['latitude'], d['longitude']))
    return d


@router.get('/stations')
def list_stations(lat: float | None = Query(None, ge=-90, le=90), lon: float | None = Query(None, ge=-180, le=180), limit: int = Query(200, ge=1, le=500),
                  user: dict = Depends(require_roles(*STAFF, *FIELD))) -> dict:
    clause, params = scope_clause(user, 's.state', 's.community_id', include_uncovered=True)
    with engine.connect() as db: rows = db.execute(text(_LIST.format(clause=clause) + ' ORDER BY s.name'), params).mappings().all()
    items = [_shape(r, lat, lon) for r in rows]
    if lat is not None and lon is not None: items.sort(key=lambda d: d['distance_km'])
    return {'label': LABEL, 'items': items[:limit]}


def _one(db, sid: int, user: dict) -> dict:
    clause, params = scope_clause(user, 's.state', 's.community_id', include_uncovered=True)
    r = db.execute(text(_LIST.format(clause=clause) + ' AND s.id=:sid'), {**params, 'sid': sid}).mappings().first()
    if not r: raise HTTPException(status_code=404, detail='Station not found')
    return r


@router.get('/stations/unknown')
def unknown_nodes(user: dict = Depends(require_roles())) -> dict:
    with engine.connect() as db: rows = db.execute(text('SELECT node_id,first_heard,last_heard,heard,reported_lat,reported_lon FROM resq_station_unknown ORDER BY last_heard DESC LIMIT 100')).mappings().all()
    return {'items': [{**dict(r), 'first_heard': r['first_heard'].isoformat(), 'last_heard': r['last_heard'].isoformat()} for r in rows]}


@router.get('/stations/{station_id}')
def station(station_id: int, hours: int = Query(24, ge=1, le=168), lat: float | None = Query(None, ge=-90, le=90), lon: float | None = Query(None, ge=-180, le=180),
            user: dict = Depends(require_roles(*STAFF, *FIELD))) -> dict:
    with engine.connect() as db:
        r = _one(db, station_id, user)
        b = max(int(hours * 3600 / 300), 1)
        pts = db.execute(text('''SELECT to_timestamp(floor(extract(epoch FROM received_at)/:b)*:b) AS t, avg(pm25) AS pm25, avg(pm10) AS pm10, avg(temp_c) AS temp_c, avg(humidity_pct) AS humidity_pct
            FROM resq_station_readings WHERE station_id=:id AND received_at >= now() - make_interval(hours => :h) GROUP BY 1 ORDER BY 1'''), {'b': b, 'id': station_id, 'h': hours}).mappings().all()
    with engine.connect() as db:
        sounds = db.execute(text('''SELECT received_at,kind,confidence FROM resq_station_sounds WHERE station_id=:id AND received_at >= now() - interval '24 hours' ORDER BY received_at DESC LIMIT 20'''), {'id': station_id}).mappings().all()
    series = [{'t': p['t'].isoformat(), **{k: (round(float(p[k]), 1) if p[k] is not None else None) for k in ('pm25', 'pm10', 'temp_c', 'humidity_pct')}} for p in pts]
    return {'label': LABEL, 'station': _shape(r, lat, lon), 'hours': hours, 'series': series, 'sounds': [{'at': x['received_at'].isoformat(), 'kind': x['kind'], 'confidence': x['confidence']} for x in sounds]}


@router.get('/stations/{station_id}/nearby')
def nearby(station_id: int, user: dict = Depends(require_roles(*STAFF))) -> dict:
    with engine.connect() as db:
        s = _one(db, station_id, user); la, lo = s['latitude'], s['longitude']; box = {'a': la - 0.2, 'b': la + 0.2, 'c': lo - 0.2, 'd': lo + 0.2}
        hot = db.execute(text('''SELECT id,satellite,acq_datetime,latitude,longitude,frp FROM resq_hotspots WHERE acq_datetime >= now() - interval '24 hours'
            AND latitude BETWEEN :a AND :b AND longitude BETWEEN :c AND :d'''), box).mappings().all()
        clause, params = scope_clause(user, 'i.state', 'i.community_id', include_uncovered=True)
        inc = db.execute(text(f'''SELECT i.id,i.status,i.source,i.latitude,i.longitude,i.created_at FROM resq_incidents i WHERE i.status <> 'closed' AND i.created_at >= now() - interval '6 hours'
            AND i.latitude BETWEEN :a AND :b AND i.longitude BETWEEN :c AND :d AND ({clause})'''), {**box, **params}).mappings().all()
        others = db.execute(text(_LIST.format(clause=scope_clause(user, 's.state', 's.community_id', include_uncovered=True)[0]) + ' AND s.id <> :sid'),
                            {**scope_clause(user, 's.state', 's.community_id', include_uncovered=True)[1], 'sid': station_id}).mappings().all()
    near = lambda rs, km: sorted(((round(st.distance_km(la, lo, r['latitude'], r['longitude']), 1), r) for r in rs if r['latitude'] is not None and st.distance_km(la, lo, r['latitude'], r['longitude']) <= km), key=lambda x: x[0])
    h, i, o = near(hot, 10), near(inc, 10), near(others, 20)
    return {'hotspots': {'count': len(h), 'items': [{'id': r['id'], 'km': km, 'satellite': r['satellite'], 'at': r['acq_datetime'].isoformat(), 'frp': r['frp']} for km, r in h[:8]]},
            'incidents': {'count': len(i), 'items': [{'id': r['id'], 'km': km, 'status': r['status'], 'source': r['source']} for km, r in i[:8]]},
            'stations': {'count': len(o), 'items': [{'id': r['id'], 'name': r['name'], 'km': km, 'status': st.status_of(r['last_heard'], r['expected_interval_s']), 'pm25': r['pm25']} for km, r in o[:8]]}}


class CheckBody(BaseModel):
    note: str = Field(default='', max_length=500)


@router.post('/stations/{station_id}/check', status_code=201, dependencies=[Depends(require_csrf)])
def create_check(station_id: int, body: CheckBody, user: dict = Depends(require_roles(*STAFF))) -> dict:
    """An operator turns a station's readings into an incident (source 'station') that goes through the normal queue and verification. One open check per station per 2 hours."""
    with engine.begin() as db:
        s = _shape(_one(db, station_id, user))
        old = db.execute(text('''SELECT id FROM resq_incidents WHERE source='station' AND client_key LIKE :k AND status <> 'closed' AND created_at >= now() - interval '2 hours' ORDER BY id DESC LIMIT 1'''),
                         {'k': f'station-{station_id}-%'}).scalar()
        if old: return {'created': False, 'incident_id': int(old)}
        parts = [f"Check created by an operator from lookout station '{s['name']}' (node {s['node_id']}).",
                 f"Last heard {s['age_s']} s ago ({s['status']}). Readings: PM2.5 {s['pm25']} ug/m3 (normal for this station about {s['pm25_normal']}), PM10 {s['pm10']}, {s['temp_c']} C, {s['humidity_pct']} % humidity.",
                 'These are sensor readings, not a person\'s report.']
        if body.note.strip(): parts.append(body.note.strip())
        cid = communities.at_point(db, s['latitude'], s['longitude']) if s['community_id'] is None else s['community_id']
        iid = db.execute(text('''INSERT INTO resq_incidents (reporter_id,client_key,source,size,notes,state,latitude,longitude,observed_at,community_id)
            VALUES (:u,:k,'station','unknown',:n,:st,:la,:lo,now(),:c) RETURNING id'''), {'u': user['id'], 'k': f'station-{station_id}-{int(time.time())}', 'n': ' '.join(parts), 'st': s['state'],
                                                                                      'la': s['latitude'], 'lo': s['longitude'], 'c': cid}).scalar()
        audit_log.write_audit_log(action='station_check_created', entity_type='incident', entity_id=str(iid), user_id=int(user['id']), metadata={'station_id': station_id}, connection=db)
    for rid in incident_staff_recipients(s['state'], community_id=cid):
        generate_alert(kind='station_check', message=f"Check #{iid} from station '{s['name']}' is ready for review.", state=s['state'], severity='info', entity_type='incident', entity_id=str(iid), user_id=rid)
    return {'created': True, 'incident_id': int(iid)}


class StationBody(BaseModel):
    node_id: int = Field(ge=1, le=253)
    name: str = Field(min_length=1, max_length=80)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    expected_interval_s: int = Field(default=600, ge=5, le=86400)
    notes: str = Field(default='', max_length=500)


@router.post('/stations', status_code=201, dependencies=[Depends(require_csrf)])
def register(body: StationBody, user: dict = Depends(require_roles())) -> dict:
    state = state_at(body.latitude, body.longitude)
    if state is None: raise HTTPException(status_code=422, detail='This position is outside India')
    with engine.begin() as db:
        if db.execute(text('SELECT 1 FROM resq_stations WHERE node_id=:n'), {'n': body.node_id}).first(): raise HTTPException(status_code=409, detail='That node is already registered')
        sid = db.execute(text('''INSERT INTO resq_stations (node_id,name,latitude,longitude,state,community_id,expected_interval_s,notes) VALUES (:n,:nm,:la,:lo,:st,:c,:iv,:no) RETURNING id'''),
                         {'n': body.node_id, 'nm': body.name, 'la': body.latitude, 'lo': body.longitude, 'st': state, 'c': communities.at_point(db, body.latitude, body.longitude),
                          'iv': body.expected_interval_s, 'no': body.notes}).scalar()
        db.execute(text('DELETE FROM resq_station_unknown WHERE node_id=:n'), {'n': body.node_id})
        audit_log.write_audit_log(action='station_registered', entity_type='station', entity_id=str(sid), user_id=int(user['id']), metadata={'node_id': body.node_id}, connection=db)
    return {'id': int(sid), 'state': state}
