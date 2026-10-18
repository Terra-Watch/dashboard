"""Data feeds (FIRMS hotspots, weather context): real PostgreSQL, mocked HTTP (httpx.MockTransport)."""
import logging
import uuid
from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import text

from app.database.session import engine
from app.services import feeds as feeds_pkg
from app.services.feeds import FeedError, firms, freshness, weather
from tests.test_fire_evidence_routes import actor, citizen_report, database, db_one, db_scalar, isolated  # noqa: F401

FAKE_KEY = "FAKEKEY-9f3a1c77d0b2-not-real"
HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight\n"
BOX = (84, 19, 86, 21)
SNPP = "VIIRS_SNPP_NRT"


def csv_body(rows):
    return HEADER + "".join(f"{la},{lo},330.1,0.4,0.4,{d},{t},N,{c},2.0NRT,290.0,{frp},D\n" for la, lo, d, t, c, frp in rows)


@pytest.fixture(autouse=True)
def clean_and_key(monkeypatch):
    monkeypatch.setenv("FIRMS_MAP_KEY", FAKE_KEY)
    monkeypatch.delenv("FEED_STALE_MINUTES", raising=False)
    with engine.begin() as db:
        db.execute(text("DELETE FROM resq_hotspots"))
        db.execute(text("DELETE FROM resq_weather_context"))


def mock_client(body, status=200, seen=None):
    def handler(request):
        if seen is not None:
            seen.append(str(request.url))
        return httpx.Response(status, text=body)
    return httpx.Client(transport=httpx.MockTransport(handler))


def insert_hotspot(lat, lon, state=None, hours_ago=1, sat=SNPP):
    with engine.begin() as db:
        return db.execute(text("""INSERT INTO resq_hotspots (satellite,acq_datetime,latitude,longitude,frp,confidence,state)
            VALUES (:s, now()-make_interval(hours=>:h)-make_interval(secs=>:j), :la,:lo,5.5,'nominal',:st) RETURNING id"""),
                          {"s": sat, "h": hours_ago, "j": uuid.uuid4().int % 1000, "la": lat, "lo": lon, "st": state}).scalar()


def assignment_for(ranger_id, lat=20.3, lon=85.8, state="OD"):
    control, ch, owner = actor("control_room_operator", scopes=["OD"])
    rid = citizen_report(owner)
    with engine.begin() as db:
        db.execute(text("UPDATE resq_incidents SET latitude=:la, longitude=:lo, state=:s WHERE id=:i"), {"la": lat, "lo": lon, "s": state, "i": rid})
    resp = control.post(f"/api/control-room/incidents/{rid}/assignments", headers=ch, json={"ranger_id": ranger_id})
    assert resp.status_code == 201, resp.text
    return resp.json()["assignment"]["id"]


# ---------- parsing and ingestion ----------

def test_parse_and_idempotent_upsert():
    body = csv_body([(20.1, 85.1, "2026-10-16", "0612", "n", 4.2), (20.2, 85.2, "2026-10-16", "0612", "h", 9.0)])
    client = mock_client(body)
    first = firms.fetch_area(BOX, 1, [SNPP], client=client)
    second = firms.fetch_area(BOX, 1, [SNPP], client=client)
    assert (first["fetched"], first["inserted"]) == (2, 2)
    assert (second["fetched"], second["inserted"]) == (2, 0)
    assert db_scalar("SELECT count(*) FROM resq_hotspots") == 2
    row = db_one("SELECT * FROM resq_hotspots WHERE latitude=20.2")
    assert row["confidence"] == "high" and row["brightness"] == 330.1 and row["daynight"] == "D" and row["state"] == "OD"


def test_unknown_region_has_null_state_and_bad_rows_are_skipped():
    body = csv_body([(60.0, 10.0, "2026-10-16", "0100", "n", 1)]) + "x,y,330,1,1,2026-10-16,0100,N,n,2,1,1,D\n"
    rows = firms.parse(body, SNPP)
    assert len(rows) == 1 and rows[0]["state"] is None


def test_firms_errors_are_typed_and_safe():
    with pytest.raises(FeedError) as e:
        firms.fetch_area(BOX, 1, [SNPP], client=mock_client("Invalid MAP_KEY.", 200))
    assert FAKE_KEY not in str(e.value)
    with pytest.raises(FeedError, match="HTTP 500"):
        firms.fetch_area(BOX, 1, [SNPP], client=mock_client("", 500))

    def boom(request):
        raise httpx.ConnectError("failed " + str(request.url))
    with pytest.raises(FeedError) as e:
        firms.fetch_area(BOX, 1, [SNPP], client=httpx.Client(transport=httpx.MockTransport(boom)))
    assert FAKE_KEY not in str(e.value) and "http" not in str(e.value)
    with pytest.raises(FeedError):
        firms.fetch_area((86, 19, 84, 21), 1)
    with pytest.raises(FeedError):
        firms.fetch_area(BOX, 9)


# ---------- GET /api/hotspots ----------

def test_hotspots_role_matrix_scope_and_bbox():
    inside = insert_hotspot(20.5, 85.5, "OD")
    other_state = insert_hotspot(19.0, 79.0, "MH")
    nowhere = insert_hotspot(20.6, 85.6, None)
    far = insert_hotspot(25.0, 90.0, "OD")
    for role in ("citizen", "field_crew"):
        c, h, _ = actor(role)
        assert c.get("/api/hotspots", headers=h).status_code == 403
    op, oh, _ = actor("control_room_operator", scopes=["OD"])
    body = op.get("/api/hotspots", headers=oh).json()
    ids = {i["id"] for i in body["items"]}
    assert {inside, nowhere, far} <= ids and other_state not in ids
    assert body["label"] == "Satellite signal, not confirmed by a person"
    assert set(body["items"][0]) == {"id", "satellite", "acq_datetime", "latitude", "longitude", "frp", "confidence", "age_minutes"}
    boxed = op.get("/api/hotspots", headers=oh, params={"min_lat": 20, "min_lon": 85, "max_lat": 21, "max_lon": 86}).json()
    assert {i["id"] for i in boxed["items"]} == {inside, nowhere}
    assert op.get("/api/hotspots", headers=oh, params={"min_lat": 20}).status_code == 422
    assert op.get("/api/hotspots", headers=oh, params={"since_hours": 169}).status_code == 422
    c, h, _ = actor("incident_commander", scopes=["MH"])
    assert other_state in {i["id"] for i in c.get("/api/hotspots", headers=h).json()["items"]}
    # legacy 'officer' role cannot use the redesign login, so mint its token directly
    from app.core.security import make_access_token
    from tests.test_auth import fresh_client, make_user
    uid, _email = make_user("officer", scopes=["MH"])
    resp = fresh_client().get("/api/hotspots", headers={"Authorization": f"Bearer {make_access_token(uid, 'officer')}"})
    assert resp.status_code == 200 and other_state in {i["id"] for i in resp.json()["items"]}
    rc, rh2, _ = actor("range_officer", scopes=["OD"])
    assert rc.get("/api/hotspots", headers=rh2).status_code == 403
    ad, ah, _ = actor("admin")
    assert {inside, other_state, far} <= {i["id"] for i in ad.get("/api/hotspots", headers=ah).json()["items"]}
    noscope, nh, _ = actor("control_room_operator", scopes=[])
    assert noscope.get("/api/hotspots", headers=nh).json()["items"] == []


def test_since_hours_filters_old_rows():
    old = insert_hotspot(20.5, 85.5, "OD", hours_ago=30)
    new = insert_hotspot(20.5, 85.6, "OD", hours_ago=2)
    ad, ah, _ = actor("admin")
    assert {i["id"] for i in ad.get("/api/hotspots?since_hours=24", headers=ah).json()["items"]} == {new}
    assert {old, new} <= {i["id"] for i in ad.get("/api/hotspots?since_hours=48", headers=ah).json()["items"]}


# ---------- near-task ----------

def test_near_task_own_assignment_only_and_radius():
    ranger, rh, rid = actor("field_crew", scopes=["OD"])
    aid = assignment_for(rid)
    near = insert_hotspot(20.31, 85.81, "OD")   # about 1.5 km
    mid = insert_hotspot(20.45, 85.8, "OD")     # about 16.7 km
    far = insert_hotspot(21.5, 85.8, "OD")
    got = ranger.get(f"/api/hotspots/near-task/{aid}", headers=rh).json()
    assert [i["id"] for i in got["items"]] == [near] and got["radius_km"] == 10
    assert got["items"][0]["distance_km"] < 3 and got["label"].startswith("Satellite signal")
    wide = {i["id"] for i in ranger.get(f"/api/hotspots/near-task/{aid}?radius_km=25", headers=rh).json()["items"]}
    assert wide == {near, mid} and far not in wide
    assert ranger.get(f"/api/hotspots/near-task/{aid}?radius_km=26", headers=rh).status_code == 422
    other, oh, _ = actor("field_crew", scopes=["OD"])
    assert other.get(f"/api/hotspots/near-task/{aid}", headers=oh).status_code == 404
    for role in ("citizen", "control_room_operator", "admin"):
        c, h, _ = actor(role, scopes=["OD"] if role != "citizen" else None)
        assert c.get(f"/api/hotspots/near-task/{aid}", headers=h).status_code == 403
    with engine.begin() as db:
        db.execute(text("UPDATE resq_incident_assignments SET status='completed' WHERE id=:i"), {"i": aid})
    assert ranger.get(f"/api/hotspots/near-task/{aid}", headers=rh).status_code == 409
    assert ranger.get("/api/hotspots/near-task/999999999", headers=rh).status_code == 404


# ---------- freshness ----------

def test_freshness_stale_null_without_env_and_bool_with_env(monkeypatch):
    insert_hotspot(20.5, 85.5, "OD")
    ad, ah, _ = actor("admin")
    f = ad.get("/api/hotspots", headers=ah).json()["freshness"]
    assert set(f) == {"source", "fetched_at", "age_seconds", "stale"} and f["stale"] is None and f["source"] == "nasa-firms"
    monkeypatch.setenv("FEED_STALE_MINUTES", "60")
    assert ad.get("/api/hotspots", headers=ah).json()["freshness"]["stale"] is False
    with engine.begin() as db:
        db.execute(text("UPDATE resq_hotspots SET fetched_at = now() - interval '3 hours'"))
    assert ad.get("/api/hotspots", headers=ah).json()["freshness"]["stale"] is True
    monkeypatch.setenv("FEED_STALE_MINUTES", "abc")
    assert freshness("x", None)["stale"] is None


# ---------- weather ----------

def om_payload():
    return {"current": {"time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M"), "wind_speed_10m": 4.5,
                        "wind_direction_10m": 225, "temperature_2m": 31.2, "relative_humidity_2m": 40}}


def test_weather_cache_hit_vs_fetch_and_roles(monkeypatch):
    calls = []

    def handler(request):
        calls.append(str(request.url))
        return httpx.Response(200, json=om_payload())
    monkeypatch.setattr(feeds_pkg, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(handler)))
    lat, lon = 23.11, 83.42
    op, oh, _ = actor("control_room_operator", scopes=["OD"])
    a = op.get("/api/weather/context", headers=oh, params={"lat": lat, "lon": lon}).json()
    b = op.get("/api/weather/context", headers=oh, params={"lat": lat + 0.05, "lon": lon - 0.05}).json()
    assert len(calls) == 1 and a["cached"] is False and b["cached"] is True
    assert "wind_speed_unit=ms" in calls[0] and "wind_speed_10m" in calls[0]
    assert a["wind_speed_ms"] == 4.5 and a["wind_dir_deg"] == 225 and a["humidity_pct"] == 40 and a["lat_cell"] == 23.0
    assert a["freshness"]["source"] == "open-meteo" and a["freshness"]["stale"] is None
    ranger, rh, _ = actor("field_crew", scopes=["OD"])
    r = ranger.get("/api/weather/context", headers=rh, params={"lat": lat, "lon": lon}).json()
    assert "humidity_pct" not in r and "temperature_c" not in r and r["wind_speed_ms"] == 4.5
    cz, ch, _ = actor("citizen")
    assert cz.get("/api/weather/context", headers=ch, params={"lat": lat, "lon": lon}).status_code == 403
    with engine.begin() as db:
        db.execute(text("UPDATE resq_weather_context SET fetched_at = now() - interval '4 hours'"))
    assert op.get("/api/weather/context", headers=oh, params={"lat": lat, "lon": lon}).json()["cached"] is False
    assert len(calls) == 2


def test_weather_feed_failure_is_502_without_internals(monkeypatch):
    monkeypatch.setattr(feeds_pkg, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500))))
    op, oh, _ = actor("control_room_operator", scopes=["OD"])
    resp = op.get("/api/weather/context", headers=oh, params={"lat": -10.0, "lon": 10.0})
    assert resp.status_code == 502 and "open-meteo.com" not in resp.text


def test_era5_without_cdsapi_and_with_fake_client():
    import importlib.util
    if importlib.util.find_spec("cdsapi") is None:
        with pytest.raises(FeedError, match="cdsapi not installed"):
            weather.fetch_era5(20.0, 85.0, "2025-04-01")

    class Fake:
        def retrieve(self, name, request, target):
            assert name == "reanalysis-era5-single-levels" and "10m_u_component_of_wind" in request["variable"]
    out = weather.fetch_era5(20.0, 85.0, "2025-04-01", 6, cds_client=Fake(), reader=lambda p, la, lo: {"u10": 3.0, "v10": 4.0, "t2m": 300.15})
    assert out["source"] == "era5" and abs(out["wind_speed_ms"] - 5.0) < 1e-9 and abs(out["temperature_c"] - 27.0) < 1e-9
    assert abs(weather.uv_to_wind(0.0, -5.0)[1]) < 1e-9 or abs(weather.uv_to_wind(0.0, -5.0)[1] - 360) < 1e-9  # northerly: from 0/360
    weather.store(20.0, 85.0, out)
    assert db_scalar("SELECT count(*) FROM resq_weather_context WHERE source='era5' AND lat_cell=20.0 AND lon_cell=85.0") == 1


# ---------- admin refresh and credentials ----------

def test_refresh_admin_only_csrf_503_and_no_credentials(monkeypatch, caplog):
    seen = []
    body = csv_body([(20.1, 85.1, "2026-10-16", "0612", "n", 4.2)])
    monkeypatch.setattr(feeds_pkg, "http_client", lambda: mock_client(body, seen=seen))
    caplog.set_level(logging.DEBUG)
    payload = {"bbox": list(BOX), "days": 1}
    ad, ah, _ = actor("admin")
    resp = ad.post("/api/admin/feeds/refresh", headers=ah, json=payload)
    assert resp.status_code == 200, resp.text
    assert resp.json()["inserted"] == 3 and resp.json()["fetched"] == 3
    assert len(seen) == 3 and all(FAKE_KEY in u for u in seen)  # the key is used on the wire only
    assert ad.post("/api/admin/feeds/refresh", headers=ah, json=payload).json()["inserted"] == 0
    assert FAKE_KEY not in resp.text and FAKE_KEY not in caplog.text
    assert FAKE_KEY not in str(db_scalar("SELECT coalesce(string_agg(metadata::text,' '),'') FROM resq_audit_log WHERE action='feeds_refresh'"))
    no_csrf = {k: v for k, v in ah.items() if k.lower() == "authorization"}
    assert ad.post("/api/admin/feeds/refresh", headers=no_csrf, json=payload).status_code == 403
    for role in ("control_room_operator", "citizen", "field_crew"):
        c, h, _ = actor(role, scopes=["OD"] if role != "citizen" else None)
        assert c.post("/api/admin/feeds/refresh", headers=h, json=payload).status_code == 403
    assert ad.post("/api/admin/feeds/refresh", headers=ah, json={"bbox": [1, 2, 3], "days": 1}).status_code == 422
    assert ad.post("/api/admin/feeds/refresh", headers=ah, json={"bbox": list(BOX), "days": 9}).status_code == 422
    monkeypatch.delenv("FIRMS_MAP_KEY")
    missing = ad.post("/api/admin/feeds/refresh", headers=ah, json=payload)
    assert missing.status_code == 503 and "FIRMS_MAP_KEY is not set" in missing.json()["detail"]


def test_upstream_failure_surfaces_as_502_without_key(monkeypatch, caplog):
    monkeypatch.setattr(feeds_pkg, "http_client", lambda: mock_client("denied", 403))
    caplog.set_level(logging.DEBUG)
    ad, ah, _ = actor("admin")
    resp = ad.post("/api/admin/feeds/refresh", headers=ah, json={"bbox": list(BOX), "days": 1})
    assert resp.status_code == 502 and FAKE_KEY not in resp.text and FAKE_KEY not in caplog.text
