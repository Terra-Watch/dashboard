"""Public map policy (D-14) and emergency contacts (D-02) against the real database."""
import json
import random
import re
import uuid

import pytest
from sqlalchemy import text

from app.database.session import engine
from app.routers_ext import public
from app.services.h3_coarsen import to_cell
from tests.test_fire_evidence_routes import actor, database, db_scalar, isolated  # noqa: F401
from tests.test_auth import fresh_client

ENV = ("PUBLIC_MAP_ENABLED", "PUBLIC_MAP_H3_RESOLUTION", "PUBLIC_MAP_DELAY_MINUTES", "PUBLIC_RATE_LIMIT_PER_MINUTE", "EMERGENCY_CONTACTS")


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    for name in ENV:
        monkeypatch.delenv(name, raising=False)
    yield


@pytest.fixture
def reporter():
    return actor("citizen")[2]


def enable(monkeypatch, res="5", delay="10"):
    monkeypatch.setenv("PUBLIC_MAP_ENABLED", "true")
    monkeypatch.setenv("PUBLIC_MAP_H3_RESOLUTION", res)
    monkeypatch.setenv("PUBLIC_MAP_DELAY_MINUTES", delay)


def incident(reporter, lat, lon, status, minutes_old=60):
    with engine.begin() as db:
        return db.execute(text("""INSERT INTO resq_incidents (reporter_id,source,size,notes,status,state,latitude,longitude,updated_at)
            VALUES (:r,'citizen','small',:n,:s,'OD',:la,:lo,now()-make_interval(mins=>:m)) RETURNING id"""),
                          {"r": reporter, "n": f"secret-note-{uuid.uuid4().hex}", "s": status, "la": lat, "lo": lon, "m": minutes_old}).scalar()


def get(path):
    return fresh_client().get(path)


def item_for(lat, lon, res=5):
    cell = to_cell(lat, lon, res)
    return next((i for i in get("/api/public/incidents").json()["items"] if i["cell"] == cell), None)


# random spots in a remote patch of ocean so reruns and other agents' rows never share a cell
def spot(res=5, near=False):
    """A random point; with near=True returns two points about 100 m apart that fall in the same cell at `res`."""
    while True:
        lat, lon = round(random.uniform(-60, -30), 4), round(random.uniform(-170, -100), 4)
        if not near:
            return lat, lon
        if to_cell(lat, lon, res) == to_cell(lat + 0.001, lon + 0.001, res):
            return (lat, lon), (lat + 0.001, lon + 0.001)


def test_disabled_without_config():
    assert get("/api/public/incidents").json() == {"enabled": False, "items": []}
    assert get("/api/public/status").json() == {"enabled": False, "summary": None}


@pytest.mark.parametrize("env", [
    {"PUBLIC_MAP_ENABLED": "false", "PUBLIC_MAP_H3_RESOLUTION": "5", "PUBLIC_MAP_DELAY_MINUTES": "10"},
    {"PUBLIC_MAP_ENABLED": "true", "PUBLIC_MAP_DELAY_MINUTES": "10"},
    {"PUBLIC_MAP_ENABLED": "true", "PUBLIC_MAP_H3_RESOLUTION": "5"},
    {"PUBLIC_MAP_ENABLED": "true", "PUBLIC_MAP_H3_RESOLUTION": "2", "PUBLIC_MAP_DELAY_MINUTES": "10"},
    {"PUBLIC_MAP_ENABLED": "true", "PUBLIC_MAP_H3_RESOLUTION": "10", "PUBLIC_MAP_DELAY_MINUTES": "10"},
    {"PUBLIC_MAP_ENABLED": "true", "PUBLIC_MAP_H3_RESOLUTION": "5.5", "PUBLIC_MAP_DELAY_MINUTES": "10"},
    {"PUBLIC_MAP_ENABLED": "true", "PUBLIC_MAP_H3_RESOLUTION": "abc", "PUBLIC_MAP_DELAY_MINUTES": "10"},
    {"PUBLIC_MAP_ENABLED": "true", "PUBLIC_MAP_H3_RESOLUTION": "5", "PUBLIC_MAP_DELAY_MINUTES": "-1"},
    {"PUBLIC_MAP_ENABLED": "true", "PUBLIC_MAP_H3_RESOLUTION": "5", "PUBLIC_MAP_DELAY_MINUTES": ""},
])
def test_missing_or_invalid_config_disables(monkeypatch, reporter, env):
    incident(reporter, *spot(), "verified")
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    assert get("/api/public/incidents").json() == {"enabled": False, "items": []}
    assert get("/api/public/status").json() == {"enabled": False, "summary": None}


def test_only_verified_responding_contained_and_exact_keys(monkeypatch, reporter):
    enable(monkeypatch)
    spots = {name: spot() for name in ("reported", "closed", "verified", "responding", "contained")}
    for status, (lat, lon) in spots.items():
        incident(reporter, lat, lon, status)
    assert item_for(*spots["reported"]) is None and item_for(*spots["closed"]) is None
    for status in ("verified", "responding", "contained"):
        item = item_for(*spots[status])
        assert item["status"] == status and item["count"] == 1
        assert set(item) == {"cell", "count", "status", "as_of"}
    payload = get("/api/public/incidents").json()
    assert set(payload) == {"enabled", "resolution", "delay_minutes", "generated_at", "items"}
    assert payload["enabled"] is True and payload["resolution"] == 5 and payload["delay_minutes"] == 10
    raw = json.dumps(payload)
    assert "secret-note" not in raw and "latitude" not in raw and "reporter" not in raw


def test_delay_respected(monkeypatch, reporter):
    enable(monkeypatch, delay="30")
    young, old = spot(), spot()
    incident(reporter, *young, "verified", minutes_old=5)
    assert item_for(*young) is None
    incident(reporter, *old, "verified", minutes_old=45)
    assert item_for(*old)["count"] == 1


def test_nearby_incidents_share_a_cell_with_most_severe_status(monkeypatch, reporter):
    enable(monkeypatch, res="4")
    a, b = spot(4, near=True)
    incident(reporter, *a, "contained")
    incident(reporter, *b, "verified")
    item = item_for(*a, res=4)
    assert item["count"] == 2 and item["status"] == "verified"
    assert get("/api/public/incidents").json()["resolution"] == 4


def test_resolution_changes_cell_granularity(monkeypatch, reporter):
    a = spot()
    b = (a[0] + 0.3, a[1] + 0.3)
    incident(reporter, *a, "verified")
    incident(reporter, *b, "verified")
    enable(monkeypatch, res="9")
    assert item_for(*a, res=9)["count"] == 1 and item_for(*b, res=9)["count"] == 1
    enable(monkeypatch, res="3")
    assert to_cell(*a, 9) != to_cell(*b, 9)


def test_as_of_rounded_to_fifteen_minutes(monkeypatch, reporter):
    enable(monkeypatch, delay="0")
    a = spot()
    incident(reporter, *a, "verified", minutes_old=1)
    as_of = item_for(*a)["as_of"]
    assert re.search(r"T\d\d:(00|15|30|45):00", as_of)


def test_status_summary(monkeypatch, reporter):
    enable(monkeypatch, delay="0")
    incident(reporter, *spot(), "verified")
    summary = get("/api/public/status").json()
    assert summary["enabled"] is True and re.fullmatch(r"\d+ verified areas? · updated \d+ min ago", summary["summary"])


def test_public_endpoints_are_get_only_and_unauthenticated(monkeypatch):
    enable(monkeypatch)
    client = fresh_client()
    assert client.get("/api/public/incidents").status_code == 200
    for path in ("/api/public/incidents", "/api/public/status", "/api/public/contacts"):
        for method in ("post", "put", "patch", "delete"):
            assert getattr(client, method)(path).status_code in (403, 405)


def test_rate_limit_applies_only_when_configured(monkeypatch):
    client = fresh_client()
    assert all(client.get("/api/public/status").status_code == 200 for _ in range(5))
    with engine.begin() as db:
        db.execute(text("DELETE FROM resq_public_hits"))
    monkeypatch.setenv("PUBLIC_RATE_LIMIT_PER_MINUTE", "3")
    codes = [client.get("/api/public/status").status_code for _ in range(5)]
    assert codes == [200, 200, 200, 429, 429]


# ------------------------------------------------------------------------------------------------ emergency contacts (D-02)
def test_contacts_unset_is_not_configured():
    assert get("/api/public/contacts").json() == {"configured": False, "items": []}


def test_contacts_valid(monkeypatch):
    monkeypatch.setenv("EMERGENCY_CONTACTS", json.dumps([{"label": "Control room", "number": "+91 674 123456"}, {"label": "Fire", "number": "101", "region": "OD"}]))
    data = get("/api/public/contacts").json()
    assert data["configured"] is True and data["items"][1] == {"label": "Fire", "number": "101", "region": "OD"}


@pytest.mark.parametrize("value", ["not json", "{}", "[]", '[{"label":"x","number":"abc"}]', '[{"label":"x","number":"1"}]',
                                  '[{"label":"x","number":"+91 12; DROP"}]', '[{"number":"112"}]', '[{"label":"x","number":"112","extra":1}]',
                                  '[{"label":"ok","number":"112"},{"label":"bad","number":"x"}]'])
def test_contacts_invalid_config_not_configured_and_logged(monkeypatch, caplog, value):
    monkeypatch.setenv("EMERGENCY_CONTACTS", value)
    with caplog.at_level("WARNING"):
        resp = get("/api/public/contacts")
    assert resp.status_code == 200 and resp.json() == {"configured": False, "items": []}
    assert "EMERGENCY_CONTACTS" in caplog.text
