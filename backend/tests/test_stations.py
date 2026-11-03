"""Lookout stations: payload decoding and status (pure), then the real app against PostgreSQL: signed ingest, registry, scope, detail, nearby and "create a check"."""
import hashlib
import hmac
import json
import os
import struct
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from app.database.session import engine, init_db  # noqa: E402
from app.services import stations as st  # noqa: E402
from tests.test_auth import csrf_headers, fresh_client, login, make_user  # noqa: E402
from tests.test_citizen_report_route import citizen  # noqa: E402

LAT, LON = 20.30, 85.80


def payload(flags=3, pm25=18, pm10=25, temp=3041, hum=7120, batt=0xFFFF):
    return struct.pack("<BBBHHHhHH", 0x53, 1, flags, pm25, pm10, 0xFFFF, temp, hum, batt)


def test_payload_decodes_and_marks_missing_fields():
    d = st.decode_payload(payload())
    assert d == {"flags": 3, "pm25": 18, "pm10": 25, "temp_c": 30.41, "humidity_pct": 71.2, "battery_mv": None}
    no_pms = st.decode_payload(payload(flags=1, pm25=0xFFFF, pm10=0xFFFF))
    assert no_pms["pm25"] is None and no_pms["temp_c"] == 30.41
    assert st.decode_payload(payload()[:-1]) is None and st.decode_payload(b"X" + payload()[1:]) is None
    assert st.decode_payload(payload(temp=-512))["temp_c"] == -5.12


def test_sound_alert_payload():
    assert st.decode_sound(bytes([0x41, 1, 1, 61])) == {"kind": "chainsaw", "confidence": 61}
    assert st.decode_sound(bytes([0x41, 1, 2, 100])) == {"kind": "blast", "confidence": 100}
    assert st.decode_sound(bytes([0x41, 1, 3, 50])) is None and st.decode_sound(bytes([0x41, 1, 1, 101])) is None and st.decode_sound(bytes([0x41, 1, 1])) is None
    assert st.decode_payload(bytes([0x41, 1, 1, 61])) is None       # not a reading


def test_status_scales_with_the_stations_own_interval():
    now = datetime.now(timezone.utc)
    s = lambda age, iv: st.status_of(now - timedelta(seconds=age), iv, now)
    assert s(20, 15) == "online" and s(40, 15) == "late" and s(100, 15) == "offline" and s(1100, 600) == "online" and s(2500, 600) == "late" and s(5000, 600) == "offline" and st.status_of(None, 15) == "never"


def test_distance_and_bearing():
    assert abs(st.distance_km(20.0, 85.0, 20.0, 86.0) - 104.5) < 1.0
    assert st.compass_point(st.bearing_deg(20.0, 85.0, 21.0, 85.0)) == "N" and st.compass_point(st.bearing_deg(20.0, 85.0, 20.0, 86.0)) == "E"


@pytest.fixture(scope="module", autouse=True)
def database():
    init_db()
    yield
    with engine.begin() as db: db.execute(text("DELETE FROM resq_stations WHERE name LIKE 'test-%'"))


class Who:
    def __init__(self, role, scopes=("OD",)):
        _, email = make_user(role, list(scopes)); self.client = fresh_client(); r = login(self.client, email); assert r.status_code == 200, r.text
        self.h = {"Authorization": f"Bearer {r.json()['access_token']}", **csrf_headers(self.client)}
    def get(self, p): return self.client.get(p, headers=self.h)
    def post(self, p, **kw): return self.client.post(p, headers=self.h, **kw)


def ingest(readings, key="k1", gid="gw1", secret="s3cret"):
    body = json.dumps({"readings": readings}).encode()
    sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return fresh_client().post("/api/stations/ingest", content=body, headers={"x-gateway-id": gid, "x-signature": sig, "content-type": "application/json"})


@pytest.fixture()
def setup(monkeypatch):
    monkeypatch.setenv("STATION_GATEWAY_KEYS", "gw1:s3cret")
    node = (uuid.uuid4().int % 200) + 20
    with engine.begin() as db: db.execute(text("DELETE FROM resq_stations WHERE node_id=:n"), {"n": node}); db.execute(text("DELETE FROM resq_station_unknown WHERE node_id=:n"), {"n": node})
    admin = Who("admin", ())
    r = admin.post("/api/stations", json={"node_id": node, "name": f"test-{node}", "latitude": LAT, "longitude": LON, "expected_interval_s": 15})
    assert r.status_code == 201, r.text
    return node, r.json()["id"], admin


def reading(node, seq, ago=0, **kw):
    return {"node_id": node, "seq": seq, "received_at": (datetime.now(timezone.utc) - timedelta(seconds=ago)).isoformat(), "rssi": -92, "snr": 8.5, "hops": 1, "payload_hex": payload(**kw).hex()}


def test_ingest_stores_dedupes_and_rejects(setup):
    node, sid, admin = setup
    r = reading(node, 1)
    assert ingest([r, r, reading(node, 2, pm25=0xFFFF, flags=1)]).json() == {"stored": 2, "duplicate": 1, "unknown_node": 0, "invalid": 0}
    out = ingest([{**reading(node, 3), "payload_hex": "00" * 15}, reading(node + 1 if node < 250 else 19, 4)]).json()
    assert out["invalid"] == 1 and out["unknown_node"] == 1
    assert ingest([r], secret="wrong").status_code == 401 and ingest([r], gid="nope").status_code == 401
    assert any(x["node_id"] == (node + 1 if node < 250 else 19) for x in admin.get("/api/stations/unknown").json()["items"])


def test_sound_alert_is_stored_shown_and_alerts_staff(setup):
    node, sid, admin = setup
    op = Who("control_room_operator", ("OD",))
    snd = lambda seq, k, c: {**reading(node, seq), "payload_hex": bytes([0x41, 1, k, c]).hex()}
    first = snd(1, 1, 61)
    out = ingest([first, first, snd(2, 2, 97), {**reading(node, 3), "payload_hex": bytes([0x41, 1, 9, 50]).hex()}]).json()
    assert out == {"stored": 2, "duplicate": 1, "unknown_node": 0, "invalid": 1}
    d = op.get(f"/api/stations/{sid}").json(); assert {x["kind"] for x in d["sounds"]} == {"chainsaw", "blast"} and any(x["confidence"] == 97 for x in d["sounds"])


def test_ingest_is_off_without_keys(setup, monkeypatch):
    monkeypatch.delenv("STATION_GATEWAY_KEYS"); assert ingest([reading(setup[0], 9)]).status_code == 503


def test_list_detail_scope_and_status(setup):
    node, sid, admin = setup
    ingest([reading(node, i, ago=3600 - i * 30, pm25=15 + (i % 3)) for i in range(40)] + [reading(node, 99, ago=2, pm25=60)])
    op = Who("control_room_operator", ("OD",)); other = Who("control_room_operator", ("KA",)); ranger = Who("field_crew", ("OD",))
    item = next(x for x in op.get("/api/stations").json()["items"] if x["id"] == sid)
    assert item["status"] == "online" and item["pm25"] == 60 and item["pm25_normal"] is not None and item["pm25_vs_normal"] > 2 and item["temp_c"] == 30.41
    assert sid not in [x["id"] for x in other.get("/api/stations").json()["items"]] and other.get(f"/api/stations/{sid}").status_code == 404
    d = op.get(f"/api/stations/{sid}?hours=1").json(); assert d["station"]["name"] == f"test-{node}" and len(d["series"]) >= 5 and "not a fire" in d["label"]
    near = ranger.get(f"/api/stations?lat={LAT + 0.05}&lon={LON}").json()["items"]; me = next(x for x in near if x["id"] == sid)
    assert 4 < me["distance_km"] < 7 and me["bearing"] == "S"
    assert ranger.get(f"/api/stations/{sid}/nearby").status_code == 403 and ranger.post(f"/api/stations/{sid}/check", json={}).status_code == 403
    assert fresh_client().get("/api/stations").status_code in (401, 403)
    c, _, _ = citizen(); assert c.get("/api/stations").status_code in (401, 403)


def test_silent_station_is_offline(setup):
    node, sid, admin = setup
    ingest([reading(node, 1, ago=3600)]); item = next(x for x in admin.get("/api/stations").json()["items"] if x["id"] == sid)
    assert item["status"] == "offline" and item["age_s"] >= 3600


def test_nearby_and_create_check_makes_one_incident(setup):
    node, sid, admin = setup
    ingest([reading(node, 1, ago=5, pm25=80)])
    with engine.begin() as db:
        db.execute(text("INSERT INTO resq_hotspots (satellite,acq_datetime,latitude,longitude,frp,confidence,daynight) VALUES ('N',now() - interval '1 hour',:la,:lo,9.5,'n','D')"), {"la": LAT + 0.03, "lo": LON})
    op = Who("control_room_operator", ("OD",))
    n = op.get(f"/api/stations/{sid}/nearby").json(); assert n["hotspots"]["count"] >= 1 and n["hotspots"]["items"][0]["km"] < 5
    r = op.post(f"/api/stations/{sid}/check", json={"note": "smoke seen on camera"}); assert r.status_code == 201 and r.json()["created"] is True
    iid = r.json()["incident_id"]
    with engine.connect() as db: row = db.execute(text("SELECT source,state,notes,latitude FROM resq_incidents WHERE id=:i"), {"i": iid}).mappings().first()
    assert row["source"] == "station" and row["state"] == "OD" and "sensor readings" in row["notes"] and "smoke seen on camera" in row["notes"] and row["latitude"] == LAT
    again = op.post(f"/api/stations/{sid}/check", json={}); assert again.json() == {"created": False, "incident_id": iid}


def test_register_needs_admin_and_a_place_in_india(setup):
    node, sid, admin = setup
    op = Who("control_room_operator", ("OD",))
    assert op.post("/api/stations", json={"node_id": 77, "name": "x", "latitude": LAT, "longitude": LON}).status_code == 403
    assert admin.post("/api/stations", json={"node_id": 78, "name": "test-uk", "latitude": 51.5, "longitude": -0.1}).status_code == 422
    assert admin.post("/api/stations", json={"node_id": node, "name": "test-dup", "latitude": LAT, "longitude": LON}).status_code == 409


def test_hotspots_near_is_limited_to_the_rangers_states_and_sorted():
    with engine.begin() as db:
        db.execute(text("DELETE FROM resq_hotspots WHERE latitude BETWEEN 20.29 AND 20.40 AND longitude BETWEEN 85.79 AND 85.81"))
        for la in (20.31, 20.38): db.execute(text("INSERT INTO resq_hotspots (satellite,acq_datetime,latitude,longitude,frp,confidence,daynight,state) VALUES ('N',now() - interval '30 minutes',:la,85.80,5,'n','D','OD')"), {"la": la})
    ranger = Who("field_crew", ("OD",)); other = Who("field_crew", ("KA",))
    items = ranger.get(f"/api/hotspots/near?lat={LAT}&lon={LON}&radius_km=20").json()["items"]
    assert [round(i["distance_km"]) for i in items[:2]] == [1, 9] and items[0]["bearing"] == "N" and items[0]["age_minutes"] >= 29
    assert other.get(f"/api/hotspots/near?lat={LAT}&lon={LON}&radius_km=20").json()["items"] == []
    assert fresh_client().get(f"/api/hotspots/near?lat={LAT}&lon={LON}").status_code in (401, 403)
