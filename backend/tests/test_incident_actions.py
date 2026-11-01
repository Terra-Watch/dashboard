"""Questions to the reporter, merging duplicate incidents, and the second-person review of an urgent alert."""
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from app.database.session import engine, init_db  # noqa: E402
from tests.test_citizen_report_route import body, citizen  # noqa: E402
from tests.test_fire_evidence_routes import actor  # noqa: E402
from tests.test_incident_alert import confirmed_incident  # noqa: E402
from tests.test_public_photos import photo_with_exif, report_with_photo  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def database():
    init_db()


@pytest.fixture(autouse=True)
def switched_on(monkeypatch, tmp_path):
    monkeypatch.setenv("PUBLIC_REPORTS_ENABLED", "true"); monkeypatch.setenv("PUBLIC_PHOTO_STORAGE_DIR", str(tmp_path)); monkeypatch.setenv("PUBLIC_RATE_LIMIT_PER_MINUTE", "")


def make_report(**over):
    client, headers, _ = citizen()
    rid = client.post("/api/citizen/reports", headers=headers, json=body(latitude=20.3, longitude=85.8, **over)).json()["report"]["id"]
    return client, headers, rid


def test_staff_ask_and_the_reporter_answers_once():
    client, headers, rid = make_report()
    staff, sh, _ = actor("control_room_operator", scopes=["OD"])
    assert client.post(f"/api/incidents/{rid}/question", headers=headers, json={"question": "Which side of the river?"}).status_code == 403
    asked = staff.post(f"/api/incidents/{rid}/question", headers=sh, json={"question": "Which side of the river is the smoke on?"})
    assert asked.status_code == 201, asked.text
    mine = client.get(f"/api/citizen/reports/{rid}/questions", headers=headers).json()["items"]
    assert len(mine) == 1 and mine[0]["answer"] is None
    inbox = client.get("/api/inbox", headers=headers).json()["items"]
    assert any(i["kind"] == "report_question" and str(rid) in i["message"] for i in inbox)
    url = f"/api/citizen/reports/{rid}/questions/{mine[0]['id']}/answer"
    assert client.post(url, headers=headers, json={"answer": "North side, near the temple."}).status_code == 200
    assert client.post(url, headers=headers, json={"answer": "again"}).status_code == 409
    seen = staff.get(f"/api/incidents/{rid}/questions", headers=sh).json()["items"]
    assert seen[0]["answer"] == "North side, near the temple."
    other, oh, _ = actor("control_room_operator", scopes=["MH"])
    assert other.post(f"/api/incidents/{rid}/question", headers=oh, json={"question": "Which side of the river?"}).status_code == 403   # outside their states


def test_merging_moves_the_photos_closes_the_copy_and_keeps_the_record():
    _, _, a, photo_a = report_with_photo()
    _, _, b, _ = report_with_photo(data=photo_with_exif((800, 600)))      # a different picture, so nothing is treated as the same file
    staff, sh, _ = actor("control_room_operator", scopes=["OD"])
    assert staff.post(f"/api/incidents/{a}/merge", headers=sh, json={"into": a}).status_code == 422
    merged = staff.post(f"/api/incidents/{a}/merge", headers=sh, json={"into": b})
    assert merged.status_code == 200 and merged.json()["photos_moved"] == 1
    with engine.connect() as db:
        status, reason, into = db.execute(text("SELECT status,close_reason,merged_into FROM resq_incidents WHERE id=:i"), {"i": a}).one()
        owner = db.execute(text("SELECT incident_id FROM resq_incident_images WHERE id=:i"), {"i": photo_a}).scalar()
    assert (status, reason, into, owner) == ("closed", "duplicate", b, b)
    assert staff.post(f"/api/incidents/{a}/merge", headers=sh, json={"into": b}).status_code == 409                                   # already closed
    mh, mhh, _ = actor("control_room_operator", scopes=["MH"])
    assert mh.post(f"/api/incidents/{b}/merge", headers=mhh, json={"into": b + 100000}).status_code in (403, 404)


def test_an_urgent_alert_gets_a_second_review_from_someone_else():
    client, headers, rid = make_report()
    author, ah, _ = actor("control_room_operator", scopes=["OD"]); confirmed_incident(author, ah, rid)
    notice = author.post(f"/api/notices/from-incident/{rid}", headers=ah, json={"radius_km": 5}).json()
    reviewer, rh, _ = actor("incident_commander", scopes=["OD"])
    assert author.post(f"/api/notices/{notice['id']}/review", headers=ah, json={"decision": "ok"}).status_code == 403              # not an approver
    assert reviewer.post(f"/api/notices/{notice['id']}/review", headers=rh, json={"decision": "concern"}).status_code == 422       # a concern needs words
    ok = reviewer.post(f"/api/notices/{notice['id']}/review", headers=rh, json={"decision": "concern", "note": "Radius too wide for this ridge."})
    assert ok.status_code == 200 and ok.json()["review_decision"] == "concern"
    assert reviewer.post(f"/api/notices/{notice['id']}/review", headers=rh, json={"decision": "ok"}).status_code == 409             # once only
