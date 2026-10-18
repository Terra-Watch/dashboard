"""Development-only EXPERIMENTAL inference through the real routes, real app and REAL PostgreSQL. EXPERIMENTAL / NOT FOR OPERATIONAL USE.

Mocked vs real: real app, auth (JWT + CSRF), routers, SQL and PostgreSQL (tests ERROR rather than skip if DATABASE_URL is down). The
checkpoint is a tiny toy file and the scorer a stub, except `test_real_checkpoint_*`, which runs the REAL audited checkpoint and
TorchScorer through the same routes (skipped unless FIRE_EVIDENCE_REAL_CHECKPOINT is set).
"""
import asyncio
import math
import sys
import time
import uuid
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.core.security import make_token  # noqa: E402
from app.main import app  # noqa: E402
from app.services import image_assessment as ia  # noqa: E402
from tests.test_auth import fresh_client, make_user  # noqa: E402
from tests.test_fire_evidence_adapter import jpeg_bytes, make_stub_scorer, needs_assessor  # noqa: E402,F401
from tests.test_fire_evidence_experimental import ENV_NAMES, REAL, _real_image, needs_real, setup_dev  # noqa: E402,F401
from tests.test_fire_evidence_experimental import PROVENANCE_FILE  # noqa: E402,F401
from tests.test_fire_evidence_routes import (actor, citizen_report, with_csrf, database, db_one, db_scalar, files, image_row, isolated,  # noqa: E402,F401
                                             operational_state)

pytestmark = needs_assessor


@pytest.fixture(autouse=True)
def experimental_env_clean(monkeypatch):
    for n in ENV_NAMES:
        monkeypatch.delenv(n, raising=False)
    ia.reset_for_tests()
    yield
    ia.reset_for_tests()


def incident_count():
    return db_scalar("SELECT count(*) FROM resq_incidents")


def test_citizen_upload_records_an_experimental_assessment_and_changes_nothing_operational(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    client, headers, uid = actor("citizen"); rid = citizen_report(uid)
    before, incidents = operational_state(rid), incident_count()
    r = client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes()))
    assert r.status_code == 201, r.text
    ev = r.json()["evidence"]
    assert set(ev) == {"id", "original_filename", "size_bytes", "assessment_status", "created_at"} and ev["assessment_status"] == "EXPERIMENTAL"
    assert "2.5" not in r.text and "raw_logits" not in r.text                         # the citizen is not shown model output
    row = image_row(rid)
    assert row["assessment_status"] == "EXPERIMENTAL" and row["assessment_error"] is None and row["authenticity_status"] is None
    assert row["assessment"]["raw_logits"] == {"flames_visible": 2.5, "smoke_visible": -1.25}
    assert row["assessment"]["notice"] == "EXPERIMENTAL / NOT FOR OPERATIONAL USE" and row["assessment"]["artifact_status"] == "EXPERIMENTAL_UNAPPROVED"
    assert row["assessment"]["derived_label"] is None and row["assessment"]["scores"] is None and "APPROVED" not in row["assessment"]["artifact_status"].replace("UNAPPROVED", "")
    assert row["human_review_status"] == "NOT_REVIEWED" and row["human_reviewed_by"] is None
    assert operational_state(rid) == before and incident_count() == incidents          # no incident created, no status move, no assignment, no alert
    assert db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=rid) == "reported"
    assert db_scalar("SELECT count(*) FROM resq_incident_assignments WHERE incident_id=:i", i=rid) == 0


def test_a_very_confident_experimental_output_still_moves_nothing(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    ia._scorer_factory = lambda p: make_stub_scorer(flames=500.0, smoke=500.0)
    client, headers, uid = actor("citizen"); rid = citizen_report(uid)
    before = operational_state(rid)
    assert client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes())).status_code == 201
    assert image_row(rid)["assessment"]["raw_logits"]["flames_visible"] == 500.0
    assert operational_state(rid) == before and db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=rid) == "reported"


def test_staff_upload_review_and_status_remain_human_driven(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    officer_id = make_user("officer", scopes=["OD"])[0]
    bearer = {"Authorization": f"Bearer {make_token(officer_id, 'officer')}"}
    client = fresh_client()
    iid = client.post("/api/incidents", headers=bearer, json={"client_key": f"fe-{uuid.uuid4().hex[:8]}", "source": "lookout_tower", "size": "small",
                                                               "notes": "exp", "state": "OD"}).json()["id"]
    up = client.post(f"/api/incidents/{iid}/images", headers=with_csrf(client, bearer), files=files(jpeg_bytes()))
    assert up.status_code == 201, up.text
    image = up.json()["image"]
    assert image["assessment_status"] == "EXPERIMENTAL" and image["assessment"]["raw_logits"]["smoke_visible"] == -1.25
    assert image["human_review_status"] == "NOT_REVIEWED" and image["authenticity_status"] is None
    listed = client.get("/api/incidents", headers=bearer).json()
    row = next(i for i in (listed if isinstance(listed, list) else listed.get("items", [])) if i["id"] == iid)
    assert row["image_assessment_status"] == "EXPERIMENTAL" and row["status"] == "reported"
    state = operational_state(iid)
    rev = client.patch(f"/api/incidents/{iid}/images/{image['id']}/review", headers=bearer, json={"status": "POTENTIALLY_SYNTHETIC", "note": "person decided"})
    assert rev.status_code == 200 and rev.json()["image"]["human_review_status"] == "POTENTIALLY_SYNTHETIC"
    after = image_row(iid)
    assert after["assessment_status"] == "EXPERIMENTAL" and after["assessment"]["raw_logits"] == image["assessment"]["raw_logits"] and after["human_reviewed_by"] == officer_id
    assert operational_state(iid) == state                                             # reviewing does not move the incident either
    assert client.patch(f"/api/incidents/{iid}/status", headers=bearer, json={"status": "verified"}).status_code == 200
    assert db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=iid) == "verified"      # only the human call changes status


def test_ranger_evidence_is_assessed_experimentally_without_touching_the_assignment(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    control, ch, _ = actor("control_room_operator", scopes=["OD"])
    citizen, zh, uid = actor("citizen"); rid = citizen_report(uid)
    ranger, rh, ranger_id = actor("field_crew")
    aid = control.post(f"/api/control-room/incidents/{rid}/assignments", headers=ch, json={"ranger_id": ranger_id}).json()["assignment"]["id"]
    snapshot = lambda: (operational_state(rid), db_scalar("SELECT status FROM resq_incident_assignments WHERE id=:a", a=aid))
    before = snapshot()
    r = ranger.post(f"/api/ranger/assignments/{aid}/evidence", headers=rh, files=files(jpeg_bytes()))
    assert r.status_code == 201 and r.json()["evidence"]["assessment_status"] == "EXPERIMENTAL"
    row = image_row(rid)
    assert row["assessment"]["raw_logits"]["flames_visible"] == 2.5 and row["human_review_status"] == "NOT_REVIEWED"
    assert snapshot() == before


def test_production_environment_records_an_explicit_refusal_and_stores_no_model_output(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path, env="production")
    client, headers, uid = actor("citizen"); rid = citizen_report(uid)
    assert client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes())).status_code == 201
    row = image_row(rid)
    assert row["assessment_status"] == "UNAVAILABLE" and row["assessment_error"] == ia.EXPERIMENTAL_NOT_PERMITTED
    assert "raw_logits" not in row["assessment"] and row["assessment"]["scores"] is None


def test_reupload_refreshes_the_stored_assessment_in_both_directions(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    client, headers, uid = actor("citizen"); rid = citizen_report(uid)
    client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes()))
    assert image_row(rid)["assessment_status"] == "EXPERIMENTAL"
    monkeypatch.setenv("TERRAWATCH_ENV", "production"); ia.reset_for_tests()                 # the same evidence, re-uploaded where it is not permitted
    client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes()))
    row = image_row(rid)
    assert db_scalar("SELECT count(*) FROM resq_incident_images WHERE incident_id=:i", i=rid) == 1
    assert row["assessment_status"] == "UNAVAILABLE" and row["assessment_error"] == ia.EXPERIMENTAL_NOT_PERMITTED
    assert "raw_logits" not in row["assessment"] and row["model_version"] != "" and row["authenticity_status"] is None   # no stale logits left behind
    setup_dev(monkeypatch, tmp_path)
    client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes()))
    again = image_row(rid)
    assert again["assessment_status"] == "EXPERIMENTAL" and again["assessment_error"] is None and again["assessment"]["raw_logits"]["flames_visible"] == 2.5


def test_invalid_uploads_are_rejected_safely(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    stub = make_stub_scorer(); ia._scorer_factory = lambda p: stub
    client, headers, uid = actor("citizen"); rid = citizen_report(uid)
    for name, data in (("a.jpg", b"not an image at all"), ("b.jpg", b""), ("c.jpg", b"MZ\x90\x00 pe header")):
        r = client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(data, name))
        assert 400 <= r.status_code < 500, (name, r.status_code)
    r = client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes()[:300], "trunc.jpg"))   # JPEG magic, truncated body
    if r.status_code == 201:
        row = image_row(rid)
        assert row["assessment_status"] == "UNAVAILABLE" and "raw_logits" not in row["assessment"] and row["assessment_error"] == "DECODE_FAILED"
    else:
        assert 400 <= r.status_code < 500
    assert stub.calls == 0                                                              # nothing invalid ever reached the model
    assert not db_one("SELECT 1 FROM resq_incident_images WHERE incident_id=:i AND assessment_status='EXPERIMENTAL'", i=rid)
    assert operational_state(rid)["alerts"] >= 0 and db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=rid) == "reported"


def test_missing_weights_still_accept_the_upload_with_an_explicit_unavailable(monkeypatch, tmp_path):
    weights, _, _ = setup_dev(monkeypatch, tmp_path)
    weights.unlink(); ia.reset_for_tests(); setup_dev_pin = None  # noqa: F841
    client, headers, uid = actor("citizen"); rid = citizen_report(uid)
    assert client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes())).status_code == 201
    row = image_row(rid)
    assert row["assessment_status"] == "UNAVAILABLE" and row["assessment"]["scores"] is None and "raw_logits" not in row["assessment"]
    assert (ia.persistence_fields(ia.assess_image(jpeg_bytes(), "x"))["status"]) == "UNAVAILABLE"


def test_slow_experimental_inference_does_not_stall_the_event_loop(monkeypatch, tmp_path):
    import httpx
    setup_dev(monkeypatch, tmp_path)
    ia._scorer_factory = lambda p: make_stub_scorer(delay=0.7)
    monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "10")
    citizen, zh, uid = actor("citizen"); rid = citizen_report(uid)
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
    assert resp.status_code == 201 and image_row(rid)["assessment_status"] == "EXPERIMENTAL"
    assert len(latencies) >= 8 and max(latencies) < 0.3, (len(latencies), max(latencies))


def test_timeout_and_saturation_degrade_to_unavailable_and_the_report_survives(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    ia._scorer_factory = lambda p: make_stub_scorer(delay=0.9)
    monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "0.2")
    client, headers, uid = actor("citizen"); rid = citizen_report(uid)
    before = operational_state(rid)
    assert client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes())).status_code == 201
    row = image_row(rid)
    assert row["assessment_status"] == "UNAVAILABLE" and row["assessment_error"] == ia.TIMEOUT and "raw_logits" not in row["assessment"]
    assert operational_state(rid) == before


def test_no_router_consumes_experimental_output():
    for name in ("citizen.py", "workflow.py", "operations.py", "community.py"):
        src = (BACKEND / "app" / "routers" / name).read_text()
        assert "raw_logits" not in src and "EXPERIMENTAL" not in src and "experimental" not in src.lower().replace("image_assessment", ""), name


@needs_real
def test_real_checkpoint_through_the_real_citizen_route(monkeypatch):
    pytest.importorskip("torch"); pytest.importorskip("open_clip")
    monkeypatch.setenv("FIRE_EVIDENCE_REPO", str(Path(sys.modules["tests.test_fire_evidence_adapter"].ASSESSOR_REPO)))
    monkeypatch.setenv("TERRAWATCH_ENV", "development"); monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_ENABLED", "true")
    monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT", REAL); monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_PROVENANCE", str(PROVENANCE_FILE))
    monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "120"); ia.reset_for_tests()
    client, headers, uid = actor("citizen"); rid = citizen_report(uid)
    before = operational_state(rid)
    r = client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(_real_image()))
    assert r.status_code == 201, r.text
    row = image_row(rid)
    assert row["assessment_status"] == "EXPERIMENTAL", row["assessment"]
    logits = row["assessment"]["raw_logits"]
    assert set(logits) == {"flames_visible", "smoke_visible"} and all(math.isfinite(v) for v in logits.values())
    assert row["assessment"]["checkpoint_sha256"] == "7bd5498f04838fe19240da2b7339d794cc5fc3948074a0d826c33303d5c42dfa"
    assert operational_state(rid) == before and row["human_review_status"] == "NOT_REVIEWED"
