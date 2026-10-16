"""Regression tests for POST /api/citizen/reports against a REAL PostgreSQL and the REAL app (no rows are inserted directly).

The route's INSERT ... RETURNING omitted reporter_id, which the next statement reads for the ownership check, so the first creation
returned HTTP 500 on PostgreSQL. Requires DATABASE_URL reachable (default postgresql+psycopg://resq:resq@localhost:55432/resq).
"""
import sys
import uuid
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from app.database.session import engine, init_db  # noqa: E402
from tests.test_auth import csrf_headers, fresh_client, login, make_user  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def database():
    init_db()


def citizen():
    client = fresh_client()
    resp = client.post("/api/auth/citizen/register", json={"name": "Report Citizen", "email": f"rc-{uuid.uuid4().hex[:10]}@resq.local",
                                                           "password": "correct-horse-battery-staple-9"})
    assert resp.status_code == 201, resp.text
    return client, {"Authorization": f"Bearer {resp.json()['access_token']}", **csrf_headers(client)}, resp.json()["user"]["id"]


def body(key=None, **over):
    data = {"client_key": key or f"reg-{uuid.uuid4().hex[:12]}", "latitude": 20.3, "longitude": 85.8, "state": "OD",
            "description": "Smoke on the ridge", "observed_at": "2026-10-16T08:00:00+00:00"}
    data.update(over)
    return data


def row(report_id):
    with engine.connect() as db:
        return db.execute(text("SELECT * FROM resq_incidents WHERE id=:i"), {"i": report_id}).mappings().first()


def count_by_key(key):
    with engine.connect() as db:
        return db.execute(text("SELECT count(*) FROM resq_incidents WHERE client_key=:k"), {"k": key}).scalar()


def test_create_report_returns_201_with_every_response_field_and_stores_the_authenticated_owner():
    client, headers, uid = citizen()
    payload = body()
    resp = client.post("/api/citizen/reports", headers=headers, json=payload)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["created"] is True
    report = data["report"]
    assert set(report) == {"id", "status", "state", "latitude", "longitude", "observed_at", "created_at", "updated_at"}
    assert all(report[k] is not None for k in report)
    assert "reporter_id" not in report and "reporter_id" not in data
    stored = row(report["id"])
    assert stored["reporter_id"] == uid and stored["source"] == "citizen" and stored["client_key"] == payload["client_key"]
    assert stored["state"] == "OD" and stored["notes"] == "Smoke on the ridge"


def test_reporter_ownership_comes_from_the_token_never_from_the_request_body():
    client, headers, uid = citizen()
    other_uid = citizen()[2]
    resp = client.post("/api/citizen/reports", headers=headers, json=body(reporter_id=other_uid))
    assert resp.status_code == 201, resp.text
    assert row(resp.json()["report"]["id"])["reporter_id"] == uid != other_uid


def test_created_report_is_listed_and_readable_only_by_its_owner():
    client, headers, _ = citizen()
    rid = client.post("/api/citizen/reports", headers=headers, json=body()).json()["report"]["id"]
    assert [r["id"] for r in client.get("/api/citizen/reports", headers=headers).json()["items"]] == [rid]
    assert client.get(f"/api/citizen/reports/{rid}", headers=headers).status_code == 200
    other, otherh, _ = citizen()
    assert other.get(f"/api/citizen/reports/{rid}", headers=otherh).status_code == 404


def test_retry_with_the_same_key_is_idempotent_for_the_owner_and_creates_no_duplicate():
    client, headers, _ = citizen()
    payload = body()
    first = client.post("/api/citizen/reports", headers=headers, json=payload)
    again = client.post("/api/citizen/reports", headers=headers, json=payload)
    assert first.status_code == 201 and again.status_code == 201, again.text
    assert first.json()["created"] is True and again.json()["created"] is False
    assert first.json()["report"]["id"] == again.json()["report"]["id"]
    assert count_by_key(payload["client_key"]) == 1


def test_another_account_cannot_take_over_an_existing_report_key():
    owner, oh, owner_uid = citizen()
    payload = body()
    rid = owner.post("/api/citizen/reports", headers=oh, json=payload).json()["report"]["id"]
    intruder, ih, _ = citizen()
    resp = intruder.post("/api/citizen/reports", headers=ih, json=payload)
    assert resp.status_code == 409
    assert count_by_key(payload["client_key"]) == 1 and row(rid)["reporter_id"] == owner_uid


def test_creation_requires_authentication_csrf_and_the_citizen_role():
    client, headers, _ = citizen()
    payload = body()
    assert fresh_client().post("/api/citizen/reports", json=payload).status_code in (401, 403)
    no_csrf = {k: v for k, v in headers.items() if k.lower() != "x-resq-csrf"}
    assert client.post("/api/citizen/reports", headers=no_csrf, json=payload).status_code == 403
    staff = fresh_client()
    _, email = make_user("field_crew")
    token = login(staff, email).json()["access_token"]
    resp = staff.post("/api/citizen/reports", headers={"Authorization": f"Bearer {token}", **csrf_headers(staff)}, json=payload)
    assert resp.status_code == 403
    assert count_by_key(payload["client_key"]) == 0   # every refusal left no row


def test_invalid_input_is_rejected_without_creating_a_row():
    client, headers, _ = citizen()
    for over in ({"state": "ZZ"}, {"observed_at": "2026-10-16T08:00:00"}, {"latitude": 123.0}):
        payload = body(**over)
        assert client.post("/api/citizen/reports", headers=headers, json=payload).status_code == 422
        assert count_by_key(payload["client_key"]) == 0


def test_a_new_report_waits_for_human_review_no_assignment_and_no_status_progress():
    client, headers, _ = citizen()
    rid = client.post("/api/citizen/reports", headers=headers, json=body()).json()["report"]["id"]
    with engine.connect() as db:
        assignments = db.execute(text("SELECT count(*) FROM resq_incident_assignments WHERE incident_id=:i"), {"i": rid}).scalar()
        images = db.execute(text("SELECT count(*) FROM resq_incident_images WHERE incident_id=:i"), {"i": rid}).scalar()
    assert assignments == 0 and images == 0
    assert row(rid)["status"] == "reported"
