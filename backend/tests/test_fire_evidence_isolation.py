"""Incident-evidence routes with the production assessment path and a FAKE model: a COMPLETED result with the most extreme fire output must never
change incident status, create assignments/alerts/notices, or dispatch anyone; the staff view follows the typed contract; failures (timeout, busy,
not configured, crash) never block the upload or the report; the incident-image upload route is CSRF-protected.

Real: FastAPI app, auth, routers, SQL (PostgreSQL). Fake: the assessor service (no torch, no weights, no assessor checkout needed).
FIRE_EVIDENCE_INFERENCE_ENABLED=true appears only here, inside monkeypatched test environments that use the fake service.
"""
import ast
import json
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.core.security import make_token  # noqa: E402
from app.routers import citizen, operations, workflow  # noqa: E402
from app.services import image_assessment as ia  # noqa: E402
from tests.test_auth import fresh_client, make_user  # noqa: E402
from tests.test_fire_evidence_adapter import jpeg_bytes, needs_assessor, use_stub  # noqa: E402,F401
from tests.test_fire_evidence_contract import COMPLETED_KEYS  # noqa: E402
from tests.test_fire_evidence_routes import (FIXTURES, actor, approved_bundle, citizen_report, configure, database, db_one, db_scalar, files,  # noqa: E402,F401
                                             image_row, isolated, operational_state, with_csrf)

EXTREME = {"assessment_status": "COMPLETED", "model_version": "fake-v1", "scores": {"flames_visible": 1.0, "smoke_visible": 1.0}, "derived_label": "ACTIVE_FIRE",
           "decision": "REQUIRES_REVIEW", "review_priority": "HIGH", "quality_flags": [], "ood_flag": False,
           "authenticity": {"status": "POSSIBLE_SYNTHETIC", "signals": ["GENERATOR_TAG_IN_METADATA"]}, "limitations": [], "artifact_status": "APPROVED", "error_code": None,
           # fields a hostile or buggy model might add; none may have any effect
           "dispatch_rangers": True, "incident_status": "verified", "close_incident": True, "assign_to": 1, "notify": ["everyone"]}


class FakeService:
    artifact = SimpleNamespace(model_version="fake-v1", authenticity={"status": "PROVIDED"})

    def assess_bytes(self, data, image_id):
        return SimpleNamespace(model_dump=lambda: dict(EXTREME))


@pytest.fixture
def fake_model(monkeypatch):
    """Production path (configuration_error -> _load_service -> sanitize_assessment) with a fake assessor; the in-thread seam avoids a subprocess."""
    monkeypatch.setenv("FIRE_EVIDENCE_REPO", "/nonexistent-assessor")
    monkeypatch.setenv("FIRE_EVIDENCE_ARTIFACT_DIR", "/nonexistent-artifact")
    monkeypatch.setenv("FIRE_EVIDENCE_INFERENCE_ENABLED", "true")
    ia.reset_for_tests()
    monkeypatch.setattr(ia, "_scorer_factory", lambda *a: None)
    monkeypatch.setattr(ia, "_load_service", lambda: FakeService())


def world(incident_id: int) -> dict:
    """Everything an assessment must not be able to move."""
    return {
        **operational_state(incident_id),
        "incident": dict(db_one("SELECT status,state,close_reason,source,size FROM resq_incidents WHERE id=:i", i=incident_id)),
        "assignments_total": db_scalar("SELECT count(*) FROM resq_incident_assignments"),
        "alerts_total": db_scalar("SELECT count(*) FROM resq_alerts"),
        "notices_total": db_scalar("SELECT count(*) FROM resq_notices"),
        "verifications_total": db_scalar("SELECT count(*) FROM resq_field_verifications"),
    }


def create_incident(client, bearer, state="OD") -> int:
    r = client.post("/api/incidents", headers=bearer, json={"client_key": f"iso-{uuid.uuid4().hex[:8]}", "source": "lookout_tower", "size": "small", "notes": "iso", "state": state})
    assert r.status_code == 201, r.text
    return r.json()["id"]


# ======================================================================================= COMPLETED never moves the incident
def test_completed_extreme_result_changes_nothing_operational_via_every_upload_route(fake_model):
    control, ch, _ = actor("control_room_operator", scopes=["OD"])
    citizen_client, zh, citizen_uid = actor("citizen"); rid = citizen_report(citizen_uid)
    ranger, rh, ranger_id = actor("field_crew")
    a = control.post(f"/api/control-room/incidents/{rid}/assignments", headers=ch, json={"ranger_id": ranger_id})
    assert a.status_code == 201, a.text
    aid = a.json()["assignment"]["id"]
    officer_id = make_user("officer", scopes=["OD"])[0]
    bearer = {"Authorization": f"Bearer {make_token(officer_id, 'officer')}"}
    staff = fresh_client()
    other = create_incident(staff, with_csrf(staff, bearer))   # staff route on its own incident; created BEFORE the snapshots (creating one raises alerts)
    before, other_before = world(rid), world(other)

    assert citizen_client.post(f"/api/citizen/reports/{rid}/evidence", headers=zh, files=files(jpeg_bytes())).status_code == 201
    assert ranger.post(f"/api/ranger/assignments/{aid}/evidence", headers=rh, files=files(jpeg_bytes())).status_code == 201
    up = staff.post(f"/api/incidents/{other}/images", headers=with_csrf(staff, bearer), files=files(jpeg_bytes()))
    assert up.status_code == 201, up.text

    row = image_row(rid)
    assert row["assessment_status"] == "COMPLETED" and row["assessment"]["derived_label"] == "ACTIVE_FIRE" and row["assessment"]["scores"]["flames_visible"] == 1.0
    assert world(rid) == before                              # status, assignments, alerts, notices, verifications: untouched
    assert world(other) == other_before
    assert db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=rid) == "reported"
    assert not any(k in json.dumps(image_row(other)["assessment"]) for k in ("dispatch_rangers", "close_incident", "assign_to", "notify", "incident_status"))


def test_staff_view_of_a_completed_assessment_follows_the_typed_contract(fake_model):
    officer_id = make_user("officer", scopes=["OD"])[0]
    bearer = {"Authorization": f"Bearer {make_token(officer_id, 'officer')}"}
    client = fresh_client()
    iid = create_incident(client, with_csrf(client, bearer))
    up = client.post(f"/api/incidents/{iid}/images", headers=with_csrf(client, bearer), files=files(jpeg_bytes()))
    assert up.status_code == 201
    shown = up.json()["image"]["assessment"]
    assert set(shown) == COMPLETED_KEYS and shown["review_required"] is True and shown["decision"] == "REQUIRES_REVIEW"
    assert shown["indications"] == {"synthetic": "POSSIBLE", "edited": "NOT_ASSESSED", "reused": "NOT_ASSESSED"}
    assert up.json()["image"]["authenticity_status"] == "POSSIBLE_SYNTHETIC"
    detail = client.get(f"/api/incidents/{iid}", headers=bearer).json()
    assert set(detail["images"][0]["assessment"]) == COMPLETED_KEYS
    assert detail["status"] == "reported" or detail["status"] == db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=iid)


def test_citizen_and_ranger_responses_stay_minimal(fake_model):
    citizen_client, zh, citizen_uid = actor("citizen"); rid = citizen_report(citizen_uid)
    r = citizen_client.post(f"/api/citizen/reports/{rid}/evidence", headers=zh, files=files(jpeg_bytes()))
    assert r.status_code == 201
    assert set(r.json()["evidence"]) == {"id", "original_filename", "size_bytes", "assessment_status", "created_at"}
    text = json.dumps(r.json()) + json.dumps(citizen_client.get(f"/api/citizen/reports/{rid}", headers=zh).json())
    for leaked in ("flames_visible", "smoke_visible", "ACTIVE_FIRE", "derived_label", "POSSIBLE_SYNTHETIC", "indications", "review_priority"):
        assert leaked not in text


# ======================================================================================= failures never block the upload or the report
@pytest.mark.parametrize("code", [ia.TIMEOUT, ia.BUSY, ia.NOT_CONFIGURED, ia.INFERENCE_FAILED])
def test_unavailable_model_still_persists_the_upload_and_shows_unavailable_not_negative(monkeypatch, code):
    async def refuse(data, image_id):
        return ia.unavailable(code)
    for module in (citizen, operations, workflow):
        monkeypatch.setattr(module, "assess_image_async", refuse)
    citizen_client, zh, citizen_uid = actor("citizen"); rid = citizen_report(citizen_uid)
    assert citizen_client.post(f"/api/citizen/reports/{rid}/evidence", headers=zh, files=files(jpeg_bytes())).status_code == 201
    row = image_row(rid)
    assert row["assessment_status"] == "UNAVAILABLE" and row["assessment_error"] == code and row["authenticity_status"] is None
    officer_id = make_user("officer", scopes=["OD"])[0]
    bearer = {"Authorization": f"Bearer {make_token(officer_id, 'officer')}"}
    staff = fresh_client()
    iid = create_incident(staff, with_csrf(staff, bearer))
    up = staff.post(f"/api/incidents/{iid}/images", headers=with_csrf(staff, bearer), files=files(jpeg_bytes()))
    assert up.status_code == 201
    shown = up.json()["image"]["assessment"]
    assert shown["assessment_status"] == "UNAVAILABLE" and shown["error_code"] == code and shown["scores"] is None and shown["derived_label"] is None
    assert shown["ood_flag"] is None and shown["authenticity"]["status"] == "NOT_ASSESSED" and shown["review_required"] is True


def test_a_citizen_report_and_its_evidence_persist_while_the_model_is_not_configured():
    client, headers, uid = actor("citizen")
    r = client.post("/api/citizen/reports", headers=headers, json={"client_key": f"iso-{uuid.uuid4().hex[:8]}", "latitude": 20.3, "longitude": 85.8, "state": "OD",
                                                                  "description": "Smoke near the ridge", "observed_at": "2026-10-16T08:00:00+00:00"})
    assert r.status_code == 201, r.text
    rid = r.json()["report"]["id"]
    assert client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes())).status_code == 201
    assert image_row(rid)["assessment_status"] == "UNAVAILABLE" and image_row(rid)["assessment_error"] == ia.NOT_CONFIGURED
    assert db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=rid) == "reported"


@needs_assessor
def test_a_real_timeout_degrades_to_unavailable_and_the_upload_still_persists(monkeypatch, approved_bundle):
    configure(monkeypatch, approved_bundle); use_stub(flames=30.0, smoke=30.0, delay=1.5)
    monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "0.2")
    client, headers, uid = actor("citizen"); rid = citizen_report(uid)
    before = world(rid)
    assert client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(jpeg_bytes())).status_code == 201
    row = image_row(rid)
    assert row["assessment_status"] == "UNAVAILABLE" and row["assessment_error"] == ia.TIMEOUT and world(rid) == before


# ======================================================================================= CSRF on the incident-image upload (finding B)
def test_incident_image_upload_requires_the_csrf_pair(fake_model):
    officer_id = make_user("officer", scopes=["OD"])[0]
    bearer = {"Authorization": f"Bearer {make_token(officer_id, 'officer')}"}
    client = fresh_client()
    iid = create_incident(client, with_csrf(client, bearer))
    url = f"/api/incidents/{iid}/images"
    count = lambda: db_scalar("SELECT count(*) FROM resq_incident_images WHERE incident_id=:i", i=iid)  # noqa: E731
    bare = fresh_client()
    no_pair = bare.post(url, headers=bearer, files=files(jpeg_bytes()))
    assert no_pair.status_code == 403 and "CSRF" in no_pair.json()["detail"]
    header_only = bare.post(url, headers={**bearer, "x-resq-csrf": "abc"}, files=files(jpeg_bytes()))
    assert header_only.status_code == 403 and "CSRF" in header_only.json()["detail"]
    cookie_only = fresh_client(); cookie_only.cookies.set("resq_csrf", "abc")
    assert cookie_only.post(url, headers=bearer, files=files(jpeg_bytes())).status_code == 403
    mismatch = fresh_client(); mismatch.cookies.set("resq_csrf", "abc")
    assert mismatch.post(url, headers={**bearer, "x-resq-csrf": "different"}, files=files(jpeg_bytes())).status_code == 403
    assert count() == 0                                     # every refusal left nothing behind and ran no assessment
    ok = fresh_client()
    assert ok.post(url, headers=with_csrf(ok, bearer), files=files(jpeg_bytes())).status_code == 201 and count() == 1


def test_csrf_is_checked_before_the_model_runs(monkeypatch):
    async def must_not_run(data, image_id):
        pytest.fail("assessment ran for a request that failed the CSRF check")
    monkeypatch.setattr(operations, "assess_image_async", must_not_run)
    officer_id = make_user("officer", scopes=["OD"])[0]
    bearer = {"Authorization": f"Bearer {make_token(officer_id, 'officer')}"}
    client = fresh_client()
    iid = create_incident(client, with_csrf(client, bearer))
    assert fresh_client().post(f"/api/incidents/{iid}/images", headers=bearer, files=files(jpeg_bytes())).status_code == 403


# ======================================================================================= source scans: routers cannot act on model output
ROUTERS = BACKEND / "app" / "routers"
FORBIDDEN_LITERALS = {"COMPLETED", "scores", "derived_label", "review_priority", "flames_visible", "smoke_visible", "ood_flag", "REQUIRES_REVIEW", "UNAVAILABLE"}


@pytest.mark.parametrize("name", ["operations.py", "citizen.py", "workflow.py", "community.py", "redesign.py", "auth.py"])
def test_routers_never_branch_on_or_read_model_scores_labels_or_status(name):
    tree = ast.parse((ROUTERS / name).read_text())
    for node in ast.walk(tree):  # string constants: dict keys, comparisons, subscripts (docstrings are statements, skipped below)
        if isinstance(node, ast.Constant) and isinstance(node.value, str) and node.value in FORBIDDEN_LITERALS:
            pytest.fail(f"{name}:{node.lineno} refers to model output field/status {node.value!r}; routers must only persist and present it via image_assessment")


def test_routers_use_the_model_only_through_persistence_and_presentation_helpers():
    for name in ("operations.py", "citizen.py", "workflow.py"):
        tree = ast.parse((ROUTERS / name).read_text())
        used = {n.attr if isinstance(n, ast.Attribute) else n.id for n in ast.walk(tree) if isinstance(n, (ast.Name, ast.Attribute))}
        assert not {"sanitize_assessment", "indications_for", "sanitize_experimental", "unavailable"} & used, name
