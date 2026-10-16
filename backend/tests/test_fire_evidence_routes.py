"""Evidence-upload routes with the Fire Evidence Assessor adapter: persistence, authorization, human-review and incident-status isolation,
and request-path behaviour when inference is unavailable.

Mocked vs real:
  * REAL: the FastAPI app, authentication (JWT + cookies + CSRF), the routers, SQL, and a REAL PostgreSQL (needs DATABASE_URL reachable,
    default postgresql+psycopg://resq:resq@localhost:55432/resq; these tests ERROR rather than skip if it is down, like tests/test_auth.py).
  * REAL: the artifact bundle (tiny toy fixture built by the assessor tooling) and the assessor's loader/pipeline when
    FIRE_EVIDENCE_TEST_ASSESSOR_REPO is set (those tests skip with a reason otherwise).
  * MOCKED: the scorer (a stub; no torch, no weights) and the stored-image directory (a tmp dir).
"""
import asyncio
import hashlib
import io
import os
import random
import shutil
import sys
import time
import uuid
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
os.environ.setdefault("RESQ_SECRET_KEY", "test-signing-secret-key-at-least-32-bytes-long")

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core.security import make_token  # noqa: E402
from app.database.session import engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.routers import operations  # noqa: E402
from app.services import image_assessment as ia  # noqa: E402
from tests.test_auth import csrf_headers, fresh_client, login, make_user  # noqa: E402
from tests.test_fire_evidence_adapter import (FIXTURE_VERSION, FIXTURES, configure, jpeg_bytes, make_stub_scorer, needs_assessor, use_stub)  # noqa: E402,F401


@pytest.fixture(scope="module", autouse=True)
def database():
    init_db()


@pytest.fixture(autouse=True)
def isolated(monkeypatch, tmp_path):
    for name in ("FIRE_EVIDENCE_REPO", "FIRE_EVIDENCE_ARTIFACT_DIR", "FIRE_EVIDENCE_MODEL_VERSION", "FIRE_EVIDENCE_INFERENCE_ENABLED",
                 "FIRE_EVIDENCE_TIMEOUT_S", "FIRE_EVIDENCE_MAX_PENDING"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(operations, "IMAGE_ROOT", tmp_path / "images")
    ia.reset_for_tests()
    yield
    ia.reset_for_tests()


@pytest.fixture
def approved_bundle(tmp_path):
    d = tmp_path / "approved"
    shutil.copytree(FIXTURES / "approved", d)
    return d


def other_jpeg(seed: int) -> bytes:
    from PIL import Image
    rnd = random.Random(seed)
    img = Image.new("RGB", (96, 72)); img.putdata([(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)) for _ in range(96 * 72)])
    buf = io.BytesIO(); img.save(buf, "JPEG"); return buf.getvalue()


def files(data: bytes, name="evidence.jpg"):
    return {"image": (name, data, "image/jpeg")}


def actor(role: str, scopes=None):
    """Log a real user in through the redesign login: bearer token + CSRF cookie/header."""
    client = fresh_client()
    if role == "citizen":  # citizens self-register and use their own auth endpoints
        resp = client.post("/api/auth/citizen/register", json={"name": "Test Citizen", "email": f"citizen-{uuid.uuid4().hex[:10]}@resq.local",
                                                               "password": "correct-horse-battery-staple-9"})
        assert resp.status_code == 201, resp.text
        return client, {"Authorization": f"Bearer {resp.json()['access_token']}", **csrf_headers(client)}, resp.json()["user"]["id"]
    user_id, email = make_user(role, scopes=scopes)
    resp = login(client, email)
    assert resp.status_code == 200, resp.text
    return client, {"Authorization": f"Bearer {resp.json()['access_token']}", **csrf_headers(client)}, user_id


def db_one(sql: str, **params):
    with engine.connect() as db:
        return db.execute(text(sql), params).mappings().first()


def db_scalar(sql: str, **params):
    with engine.connect() as db:
        return db.execute(text(sql), params).scalar()


def citizen_report(reporter_id: int) -> int:
    """Create the citizen's report row directly in SQL (these tests need only an owned incident row).

    POST /api/citizen/reports itself is covered against real PostgreSQL by tests/test_citizen_report_route.py.
    """
    with engine.begin() as db:
        return db.execute(text("""INSERT INTO resq_incidents (reporter_id,client_key,source,size,notes,state,latitude,longitude,observed_at)
            VALUES (:r,:k,'citizen','unknown','Smoke on the ridge','OD',20.3,85.8,'2026-10-16T08:00:00+00:00') RETURNING id"""),
                          {"r": reporter_id, "k": f"fe-{uuid.uuid4().hex[:10]}"}).scalar()


def operational_state(incident_id: int) -> dict:
    return {
        "status": db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=incident_id),
        "assignments": db_scalar("SELECT count(*) FROM resq_incident_assignments WHERE incident_id=:i", i=incident_id),
        "alerts": db_scalar("SELECT count(*) FROM resq_alerts WHERE entity_type='incident' AND entity_id=:e", e=str(incident_id)),
    }


def image_row(incident_id: int):
    return db_one("SELECT * FROM resq_incident_images WHERE incident_id=:i ORDER BY id DESC LIMIT 1", i=incident_id)


# ======================================================================================= unavailable inference never blocks a report
def test_citizen_upload_with_no_artifact_persists_an_explicit_unavailable_assessment():
    client, headers, client_uid = actor("citizen")
    report_id = citizen_report(client_uid)
    before = operational_state(report_id)
    r = client.post(f"/api/citizen/reports/{report_id}/evidence", headers=headers, files=files(jpeg_bytes()))
    assert r.status_code == 201 and r.json()["evidence"]["assessment_status"] == "UNAVAILABLE"
    assert "advisory" in r.json()["message"].lower()
    row = image_row(report_id)
    assert row["assessment_status"] == "UNAVAILABLE" and row["assessment_error"] == ia.NOT_CONFIGURED and row["authenticity_status"] is None
    assert row["assessment"]["scores"] is None and row["assessment"]["derived_label"] is None and row["assessment"]["decision"] == "REQUIRES_REVIEW"
    assert row["human_review_status"] == "NOT_REVIEWED" and row["human_reviewed_by"] is None
    assert row["sha256"] == hashlib.sha256(jpeg_bytes()).hexdigest()
    assert (operations.IMAGE_ROOT / row["storage_key"]).is_file()           # the evidence itself is persisted regardless
    assert operational_state(report_id) == before                            # nothing operational changed


def test_citizen_response_does_not_leak_model_output_or_error_internals():
    client, headers, client_uid = actor("citizen")
    rid = citizen_report(client_uid)
    ev = client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes())).json()["evidence"]
    assert set(ev) == {"id", "original_filename", "size_bytes", "assessment_status", "created_at"}


def test_inference_disabled_flag_is_persisted_as_its_own_code(monkeypatch, approved_bundle):
    configure(monkeypatch, approved_bundle, enabled=False, repo=BACKEND.parent)
    client, headers, client_uid = actor("citizen")
    rid = citizen_report(client_uid)
    assert client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes())).status_code == 201
    assert image_row(rid)["assessment_error"] == ia.INFERENCE_DISABLED


@pytest.mark.parametrize("breaker,code", [
    (lambda d: (d / "weights.pt").write_bytes(b"tampered"), ia.INTEGRITY_FAILED),
    (lambda d: shutil.rmtree(d) or d.mkdir(), ia.NOT_FOUND),
])
def test_broken_artifact_still_accepts_the_upload_and_records_why_it_is_unavailable(monkeypatch, tmp_path, breaker, code):
    d = tmp_path / "broken"; shutil.copytree(FIXTURES / "approved", d); breaker(d)
    configure(monkeypatch, d, repo=BACKEND.parent)
    client, headers, client_uid = actor("citizen"); rid = citizen_report(client_uid)
    r = client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes()))
    assert r.status_code == 201 and image_row(rid)["assessment_error"] == code and image_row(rid)["assessment_status"] == "UNAVAILABLE"


def test_incomplete_bundle_is_recorded_as_incomplete(monkeypatch, tmp_path):
    d = tmp_path / "inc"; shutil.copytree(FIXTURES / "incomplete", d)
    configure(monkeypatch, d, repo=BACKEND.parent)
    client, headers, client_uid = actor("citizen"); rid = citizen_report(client_uid)
    client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes()))
    assert image_row(rid)["assessment_error"] == ia.INCOMPLETE


def test_an_unexpected_adapter_failure_is_contained_and_never_blocks_the_report(monkeypatch, approved_bundle):
    configure(monkeypatch, approved_bundle, repo=BACKEND.parent)
    monkeypatch.setattr(ia, "_load_service", lambda: (_ for _ in ()).throw(RuntimeError("boom")))
    client, headers, client_uid = actor("citizen"); rid = citizen_report(client_uid)
    r = client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes()))
    assert r.status_code == 201 and image_row(rid)["assessment_error"] == ia.INFERENCE_FAILED


# ======================================================================================= approved bundle + stub scorer: real contract, no side effects
@needs_assessor
def test_completed_assessment_is_persisted_but_changes_nothing_operational(monkeypatch, approved_bundle):
    configure(monkeypatch, approved_bundle); use_stub(flames=30.0, smoke=30.0)        # the strongest possible "fire" signal
    client, headers, client_uid = actor("citizen"); rid = citizen_report(client_uid)
    before = operational_state(rid)
    assert client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes())).status_code == 201
    row = image_row(rid)
    assert row["assessment_status"] == "COMPLETED" and row["model_version"] == FIXTURE_VERSION and row["assessment_error"] is None
    assert row["assessment"]["decision"] == "REQUIRES_REVIEW" and row["assessment"]["artifact_status"] == "APPROVED"
    assert row["authenticity_status"] == row["assessment"]["authenticity"]["status"]
    assert row["human_review_status"] == "NOT_REVIEWED"
    assert operational_state(rid) == before                                          # no status change, no assignment, no alert from model output
    assert db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=rid) == "reported"


@needs_assessor
def test_reupload_refreshes_every_assessment_column_in_both_directions(monkeypatch, approved_bundle):
    client, headers, client_uid = actor("citizen"); rid = citizen_report(client_uid)
    configure(monkeypatch, approved_bundle, enabled=False)
    client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes()))
    assert image_row(rid)["assessment_status"] == "UNAVAILABLE"
    configure(monkeypatch, approved_bundle); use_stub(flames=30.0, smoke=-30.0)
    client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes()))
    row = image_row(rid)
    assert db_scalar("SELECT count(*) FROM resq_incident_images WHERE incident_id=:i", i=rid) == 1
    assert (row["assessment_status"], row["model_version"], row["assessment_error"]) == ("COMPLETED", FIXTURE_VERSION, None)
    assert row["assessment"]["assessment_status"] == "COMPLETED" and row["authenticity_status"] is not None
    configure(monkeypatch, approved_bundle, enabled=False)                            # and back: no stale scores, label or authenticity left behind
    client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes()))
    row = image_row(rid)
    assert row["assessment_status"] == "UNAVAILABLE" and row["assessment_error"] == ia.INFERENCE_DISABLED and row["authenticity_status"] is None
    assert row["assessment"]["scores"] is None and row["assessment"]["derived_label"] is None


# ======================================================================================= authentication and authorization
def test_citizen_upload_requires_authentication_csrf_role_and_ownership():
    owner, oh, owner_uid = actor("citizen"); rid = citizen_report(owner_uid)
    anon = fresh_client()
    assert anon.post(f"/api/citizen/reports/{rid}/evidence", files=files(jpeg_bytes())).status_code in (401, 403)
    no_csrf = {k: v for k, v in oh.items() if k.lower() != "x-resq-csrf"}
    assert owner.post(f"/api/citizen/reports/{rid}/evidence", headers=no_csrf, files=files(jpeg_bytes())).status_code == 403
    other, otherh, other_uid = actor("citizen")
    assert other.post(f"/api/citizen/reports/{rid}/evidence", headers=otherh, files=files(jpeg_bytes())).status_code == 404
    ranger, rh, _ = actor("field_crew")
    assert ranger.post(f"/api/citizen/reports/{rid}/evidence", headers=rh, files=files(jpeg_bytes())).status_code == 403
    assert db_scalar("SELECT count(*) FROM resq_incident_images WHERE incident_id=:i", i=rid) == 0   # every refusal left no image and no assessment


def test_incident_image_upload_requires_authentication_role_and_state_scope():
    officer = make_user("officer", scopes=["OD"])[0]
    bearer = {"Authorization": f"Bearer {make_token(officer, 'officer')}"}
    client = fresh_client()
    created = client.post("/api/incidents", headers=bearer, json={"client_key": f"fe-{uuid.uuid4().hex[:8]}", "source": "lookout_tower", "size": "small",
                                                                  "notes": "authz", "state": "OD"})
    assert created.status_code == 201, created.text
    iid = created.json()["id"]
    assert client.post(f"/api/incidents/{iid}/images", files=files(jpeg_bytes())).status_code in (401, 403)             # anonymous
    crew = make_user("field_crew", scopes=["OD"])[0]
    assert client.post(f"/api/incidents/{iid}/images", headers={"Authorization": f"Bearer {make_token(crew, 'field_crew')}"}, files=files(jpeg_bytes())).status_code in (401, 403)
    out_of_scope = make_user("officer", scopes=["MH"])[0]
    r = client.post(f"/api/incidents/{iid}/images", headers={"Authorization": f"Bearer {make_token(out_of_scope, 'officer')}"}, files=files(jpeg_bytes()))
    assert r.status_code == 403
    assert db_scalar("SELECT count(*) FROM resq_incident_images WHERE incident_id=:i", i=iid) == 0


def test_ranger_evidence_requires_the_ranger_role_and_an_assignment_of_their_own():
    control, ch, _ = actor("control_room_operator", scopes=["OD"])
    citizen, zh, citizen_uid = actor("citizen"); rid = citizen_report(citizen_uid)
    ranger, rh, ranger_id = actor("field_crew")
    a = control.post(f"/api/control-room/incidents/{rid}/assignments", headers=ch, json={"ranger_id": ranger_id})
    assert a.status_code == 201, a.text
    aid = a.json()["assignment"]["id"]
    assert citizen.post(f"/api/ranger/assignments/{aid}/evidence", headers=zh, files=files(jpeg_bytes())).status_code == 403   # wrong role
    stranger, sh, _ = actor("field_crew")
    assert stranger.post(f"/api/ranger/assignments/{aid}/evidence", headers=sh, files=files(jpeg_bytes())).status_code == 404  # someone else's assignment
    anon = fresh_client()
    assert anon.post(f"/api/ranger/assignments/{aid}/evidence", files=files(jpeg_bytes())).status_code in (401, 403)
    assert db_scalar("SELECT count(*) FROM resq_incident_images WHERE incident_id=:i", i=rid) == 0


# ======================================================================================= human review and incident status are separate from the model
@needs_assessor
def test_ranger_upload_persists_unavailable_then_completed_without_touching_assignment_or_incident(monkeypatch, approved_bundle):
    control, ch, _ = actor("control_room_operator", scopes=["OD"])
    citizen, zh, citizen_uid = actor("citizen"); rid = citizen_report(citizen_uid)
    ranger, rh, ranger_id = actor("field_crew")
    aid = control.post(f"/api/control-room/incidents/{rid}/assignments", headers=ch, json={"ranger_id": ranger_id}).json()["assignment"]["id"]
    snapshot = lambda: (operational_state(rid), db_scalar("SELECT status FROM resq_incident_assignments WHERE id=:a", a=aid))
    before = snapshot()
    r = ranger.post(f"/api/ranger/assignments/{aid}/evidence", headers=rh, files=files(jpeg_bytes()))
    assert r.status_code == 201 and r.json()["evidence"]["assessment_status"] == "UNAVAILABLE" and image_row(rid)["assessment_error"] == ia.NOT_CONFIGURED
    configure(monkeypatch, approved_bundle); use_stub(flames=30.0, smoke=30.0)
    assert ranger.post(f"/api/ranger/assignments/{aid}/evidence", headers=rh, files=files(jpeg_bytes())).status_code == 201
    row = image_row(rid)   # re-upload of identical evidence must refresh status AND stored assessment together (it used to refresh only the status)
    assert row["assessment_status"] == "COMPLETED" and row["assessment"]["assessment_status"] == "COMPLETED" and row["model_version"] == FIXTURE_VERSION
    assert snapshot() == before and row["human_review_status"] == "NOT_REVIEWED"


def test_human_review_and_status_changes_are_independent_of_the_automated_assessment():
    officer_id = make_user("officer", scopes=["OD"])[0]
    bearer = {"Authorization": f"Bearer {make_token(officer_id, 'officer')}"}
    client = fresh_client()
    iid = client.post("/api/incidents", headers=bearer, json={"client_key": f"fe-{uuid.uuid4().hex[:8]}", "source": "lookout_tower", "size": "small",
                                                               "notes": "review", "state": "OD"}).json()["id"]
    up = client.post(f"/api/incidents/{iid}/images", headers=bearer, files=files(jpeg_bytes()))
    assert up.status_code == 201
    image = up.json()["image"]
    assert image["assessment_status"] == "UNAVAILABLE" and image["human_review_status"] == "NOT_REVIEWED"
    assessed_before = db_one("SELECT assessment, assessment_status, model_version, assessment_error FROM resq_incident_images WHERE id=:i", i=image["id"])
    status_before = operational_state(iid)

    rev = client.patch(f"/api/incidents/{iid}/images/{image['id']}/review", headers=bearer, json={"status": "VERIFIED_AUTHENTIC", "note": "ranger confirmed on site"})
    assert rev.status_code == 200 and rev.json()["image"]["human_review_status"] == "VERIFIED_AUTHENTIC"
    after = db_one("SELECT assessment, assessment_status, model_version, assessment_error, human_reviewed_by FROM resq_incident_images WHERE id=:i", i=image["id"])
    assert after["human_reviewed_by"] == officer_id
    assert {k: after[k] for k in assessed_before} == dict(assessed_before)            # the human decision never rewrites the automated assessment
    assert operational_state(iid) == status_before                                    # ...and reviewing an image does not move the incident

    st = client.patch(f"/api/incidents/{iid}/status", headers=bearer, json={"status": "verified"})   # the human-driven transition works with an UNAVAILABLE assessment
    assert st.status_code == 200 and db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=iid) == "verified"
    bad = client.patch(f"/api/incidents/{iid}/images/{image['id']}/review", headers=bearer, json={"status": "AUTO_DISPATCH"})
    assert bad.status_code == 422


def test_no_route_reads_assessment_output_to_change_state():
    """Static guarantee: the only code that touches model output is the adapter + the three persistence calls; none of the state-changing
    statements in the routers reference assessment columns."""
    import re
    for name in ("citizen.py", "workflow.py", "operations.py"):
        src = (BACKEND / "app" / "routers" / name).read_text()
        for stmt in re.findall(r"UPDATE resq_incidents[^'\"]*", src) + re.findall(r"UPDATE resq_incident_assignments[^'\"]*", src):
            assert "assessment" not in stmt.lower() and "derived_label" not in stmt.lower(), (name, stmt[:80])
        assert "derived_label" not in src and "review_priority" not in src and "REQUIRES_REVIEW" not in src


# ======================================================================================= request path: the event loop is not blocked
@needs_assessor
def test_slow_inference_does_not_stall_other_requests_on_the_event_loop(monkeypatch, approved_bundle):
    import httpx
    configure(monkeypatch, approved_bundle); use_stub(delay=0.7)
    monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "10")
    citizen, zh, citizen_uid = actor("citizen"); rid = citizen_report(citizen_uid)
    token, csrf = zh["Authorization"], zh["x-resq-csrf"]

    async def scenario():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="https://testserver") as c:
            c.cookies.set("resq_csrf", csrf)
            upload = asyncio.create_task(c.post(f"/api/citizen/reports/{rid}/evidence", headers={"Authorization": token, "x-resq-csrf": csrf}, files=files(jpeg_bytes())))
            latencies = []
            while not upload.done():
                t0 = time.perf_counter(); health = await c.get("/health"); latencies.append(time.perf_counter() - t0)
                assert health.status_code == 200
                await asyncio.sleep(0.02)
            return await upload, latencies
    resp, latencies = asyncio.run(scenario())
    assert resp.status_code == 201 and image_row(rid)["assessment_status"] == "COMPLETED"
    assert len(latencies) >= 8 and max(latencies) < 0.3, (len(latencies), max(latencies))   # a blocked loop would show one ~0.7 s gap


@needs_assessor
def test_a_timeout_degrades_to_unavailable_and_the_report_still_goes_to_human_review(monkeypatch, approved_bundle):
    configure(monkeypatch, approved_bundle); use_stub(delay=0.9)
    monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "0.2")
    client, headers, client_uid = actor("citizen"); rid = citizen_report(client_uid)
    t0 = time.perf_counter()
    r = client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes()))
    assert r.status_code == 201 and time.perf_counter() - t0 < 0.85                     # answered at the timeout, not after the model
    row = image_row(rid)
    assert row["assessment_status"] == "UNAVAILABLE" and row["assessment_error"] == ia.TIMEOUT and row["assessment"]["scores"] is None
    time.sleep(1.0)                                                                      # let the abandoned job drain so it cannot affect later tests
