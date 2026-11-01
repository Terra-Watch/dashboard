"""A confirmed-fire alert made from an incident: urgent path, coarse circle, optional public photo, ends with the incident."""
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from app.database.session import engine, init_db  # noqa: E402
from tests.test_citizen_report_route import body, citizen  # noqa: E402
from tests.test_fire_evidence_routes import actor  # noqa: E402
from tests.test_public_photos import report_with_photo  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def database():
    init_db()


@pytest.fixture(autouse=True)
def switched_on(monkeypatch, tmp_path):
    monkeypatch.setenv("PUBLIC_REPORTS_ENABLED", "true"); monkeypatch.setenv("PUBLIC_PHOTO_STORAGE_DIR", str(tmp_path)); monkeypatch.setenv("PUBLIC_RATE_LIMIT_PER_MINUTE", "")


def confirmed_incident(staff, sh, rid):
    assert staff.patch(f"/api/incidents/{rid}/status", headers=sh, json={"status": "verified"}).status_code == 200


def make_report():
    client, headers, _ = citizen()
    rid = client.post("/api/citizen/reports", headers=headers, json=body(latitude=20.3, longitude=85.8)).json()["report"]["id"]
    return client, headers, rid


def test_only_a_confirmed_incident_can_be_alerted_and_only_by_staff():
    client, headers, rid = make_report()
    staff, sh, _ = actor("control_room_operator", scopes=["OD"])
    assert client.post(f"/api/notices/from-incident/{rid}", headers=headers, json={"radius_km": 5}).status_code == 403          # a citizen cannot
    assert staff.post(f"/api/notices/from-incident/{rid}", headers=sh, json={"radius_km": 5}).status_code == 409               # still only "reported"
    other, oh, _ = actor("control_room_operator", scopes=["MH"])
    confirmed_incident(staff, sh, rid)
    assert other.post(f"/api/notices/from-incident/{rid}", headers=oh, json={"radius_km": 5}).status_code == 403               # outside their states
    assert staff.post(f"/api/notices/from-incident/{rid}", headers=sh, json={"radius_km": 7.7}).status_code == 422             # not an allowed radius


def test_the_alert_reaches_citizens_as_a_coarse_circle_and_ends_when_the_incident_closes():
    client, headers, rid = make_report()
    staff, sh, _ = actor("control_room_operator", scopes=["OD"]); confirmed_incident(staff, sh, rid)
    made = staff.post(f"/api/notices/from-incident/{rid}", headers=sh, json={"radius_km": 5, "instructions": "Avoid the ridge road."})
    assert made.status_code == 201, made.text
    notice = made.json(); assert notice["urgent"] is True and notice["status"] == "published" and notice["regions"] == ["OD"]
    ring = notice["area_geojson"]["coordinates"][0]
    assert len(ring) == 33 and all(abs(lat - 20.3) < 0.2 and abs(lon - 85.8) < 0.2 for lon, lat in ring)
    assert not any(abs(lat - 20.3) < 1e-9 and abs(lon - 85.8) < 1e-9 for lon, lat in ring)                                       # not the exact pin
    assert staff.post(f"/api/notices/from-incident/{rid}", headers=sh, json={"radius_km": 5}).status_code == 409                # one alert at a time
    seen = client.get("/api/notices", params={"region": "OD"}, headers=headers).json()["items"]
    mine = [n for n in seen if n["id"] == notice["id"]]
    assert mine and "author_id" not in mine[0] and "urgent" not in mine[0] and mine[0]["incident_id"] == rid and "Avoid the ridge road." in mine[0]["body"]
    assert staff.patch(f"/api/incidents/{rid}/status", headers=sh, json={"status": "closed", "close_reason": "resolved"}).status_code == 200
    after = client.get("/api/notices", params={"region": "OD"}, headers=headers).json()["items"]
    assert not [n for n in after if n["id"] == notice["id"]]
    state = engine.connect().execute(text("SELECT status,withdrawn_reason FROM resq_notices WHERE id=:i"), {"i": notice["id"]}).one()
    assert state[0] == "withdrawn" and "closed" in state[1]


def test_a_photo_can_be_added_only_when_it_is_already_public():
    client, headers, rid, image_id = report_with_photo()
    staff, sh, _ = actor("control_room_operator", scopes=["OD"]); confirmed_incident(staff, sh, rid)
    assert staff.post(f"/api/incidents/{rid}/images/{image_id}/public", headers=sh, json={"action": "withdraw"}).status_code == 200
    assert staff.post(f"/api/notices/from-incident/{rid}", headers=sh, json={"radius_km": 5, "image_id": image_id}).status_code == 422
    assert staff.post(f"/api/incidents/{rid}/images/{image_id}/public", headers=sh, json={"action": "publish"}).status_code == 200
    made = staff.post(f"/api/notices/from-incident/{rid}", headers=sh, json={"radius_km": 5, "image_id": image_id})
    assert made.status_code == 201 and made.json()["image_id"] == image_id
