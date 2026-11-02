"""Citizen reports that carry a compass reading, and the staff endpoint that turns them into wedges and a search area. Real PostgreSQL, real app."""
import sys
import uuid
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from app.database.session import engine, init_db  # noqa: E402
from app.services import bearings  # noqa: E402
from tests.test_auth import fresh_client, login, make_user  # noqa: E402
from tests.test_citizen_report_route import body, citizen  # noqa: E402

FIRE = (20.30, 85.80)


@pytest.fixture(scope="module", autouse=True)
def database():
    init_db()


def _toward_fire(lat, lon):
    return bearings.GEOD.inv(lon, lat, FIRE[1], FIRE[0])[0] % 360


def _report(lat, lon, **over):
    client, headers, _ = citizen()
    az = _toward_fire(lat, lon)
    resp = client.post("/api/citizen/reports", headers=headers, json=body(
        latitude=lat, longitude=lon, observed_at=_now(), bearing_deg=az, bearing_source="compass", distance_band="far",
        observer_latitude=lat, observer_longitude=lon, observer_accuracy_m=12, **over))
    assert resp.status_code == 201, resp.text
    return resp.json()["report"]["id"]


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


class _Staff:
    """A signed-in staff member: .get() sends the bearer token."""
    def __init__(self, role="control_room_operator", scopes=("OD",)):
        _, email = make_user(role, list(scopes))
        self.client = fresh_client()
        resp = login(self.client, email)
        assert resp.status_code == 200, resp.text
        self.headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    def get(self, path):
        return self.client.get(path, headers=self.headers)


def _staff():
    return _Staff()


def test_a_reading_is_stored_and_two_readings_make_a_search_area_around_the_fire():
    a, b = _report(20.27, 85.77), _report(20.27, 85.83)
    with engine.connect() as db:
        assert db.execute(text("SELECT count(*) FROM resq_report_bearings WHERE incident_id IN (:a,:b)"), {"a": a, "b": b}).scalar() == 2
    data = _staff().get("/api/bearings?since_hours=2").json()
    mine = [w for w in data["wedges"] if w["incident_id"] in (a, b)]
    assert len(mine) == 2 and all(len(w["coords"]) > 4 for w in mine)
    area = next(x for x in data["areas"] if {a, b} <= set(x["incident_ids"]))
    from shapely.geometry import Point, Polygon
    assert Polygon(area["coords"]).contains(Point(FIRE[1], FIRE[0])) and area["count"] >= 2 and "not a position" in data["label"]


def test_a_report_without_a_reading_still_works_and_adds_no_wedge():
    client, headers, _ = citizen()
    resp = client.post("/api/citizen/reports", headers=headers, json=body())
    assert resp.status_code == 201
    with engine.connect() as db:
        assert db.execute(text("SELECT count(*) FROM resq_report_bearings WHERE incident_id=:i"), {"i": resp.json()["report"]["id"]}).scalar() == 0


def test_a_bearing_without_the_observer_position_is_refused():
    client, headers, _ = citizen()
    resp = client.post("/api/citizen/reports", headers=headers, json=body(bearing_deg=90, bearing_source="rose"))
    assert resp.status_code == 422
    assert client.post("/api/citizen/reports", headers=headers, json=body(bearing_deg=400, bearing_source="rose", observer_latitude=20.3, observer_longitude=85.8)).status_code == 422
    assert client.post("/api/citizen/reports", headers=headers, json=body(bearing_deg=90, bearing_source="rose", observer_latitude=51.5, observer_longitude=-0.1)).status_code == 422   # outside India


def test_only_staff_in_scope_can_read_the_wedges():
    assert fresh_client().get("/api/bearings").status_code in (401, 403)
    client, _, _ = citizen()
    assert client.get("/api/bearings").status_code in (401, 403)
    other = _Staff(scopes=("KA",))          # no Odisha scope: sees none of the Odisha reports
    rid = _report(20.27, 85.77)
    assert rid not in {w["incident_id"] for w in other.get("/api/bearings?since_hours=2").json()["wedges"]}
