"""Product rules 2 and 3: community moderation has its OWN artifact configuration; shadow mode records without showing or using.

(b) community config: unset => UNAVAILABLE / NOT_CONFIGURED and the post is held, never the fire-report artifact; both configurations fail closed
    on unapproved or tampered artifacts and are approved separately.
(c) shadow mode: persisted, hidden on every route, no workflow effect, community unaffected, default off.
"""
import json
import shutil
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services import community_image_assessment as media  # noqa: E402
from app.services import image_assessment as ia  # noqa: E402
from tests.test_auth import fresh_client  # noqa: E402
from tests.test_community_media_moderation import community_env, enable, new_post, post_status, upload  # noqa: E402,F401
from tests.test_fire_evidence_adapter import (FIXTURE_VERSION, FIXTURES, bundle, clean_adapter, configure, edit, jpeg_bytes, needs_assessor, use_stub)  # noqa: E402,F401
from tests.test_fire_evidence_isolation import create_incident, world  # noqa: E402
from tests.test_fire_evidence_media_integrity import EXTREME_FIRE, completed, holder, staff_actor  # noqa: E402,F401
from tests.test_fire_evidence_routes import actor, citizen_report, database, db_scalar, files, image_row, isolated, with_csrf  # noqa: E402,F401

COMMUNITY_DIR, COMMUNITY_VERSION = "FIRE_EVIDENCE_COMMUNITY_ARTIFACT_DIR", "FIRE_EVIDENCE_COMMUNITY_MODEL_VERSION"
SHADOW = "FIRE_EVIDENCE_SHADOW_MODE"


@pytest.fixture(autouse=True)
def policy_env(monkeypatch):
    for name in (COMMUNITY_DIR, COMMUNITY_VERSION, SHADOW, "FIRE_EVIDENCE_REPORT_AUTHENTICITY_ENABLED"):
        monkeypatch.delenv(name, raising=False)
    ia.reset_for_tests()


def copy_bundle(tmp_path, name):
    d = tmp_path / name
    shutil.copytree(FIXTURES / "approved", d)
    return d


# ======================================================================================= (b) separate community configuration
def test_new_variables_default_unset_and_community_never_falls_back(monkeypatch, bundle):
    configure(monkeypatch, bundle)                                     # the fire-report artifact is configured AND inference is enabled
    assert ia.configuration_error(ia.REPORT) is None
    assert ia.configuration_error(ia.COMMUNITY) == ia.NOT_CONFIGURED
    built = []
    monkeypatch.setattr(ia, "_build_service", lambda config="report": built.append(config) or (None, ia.LOAD_FAILED))
    out = ia.assess_image(jpeg_bytes(), "i", ia.COMMUNITY)
    assert out["assessment_status"] == "UNAVAILABLE" and out["error_code"] == ia.NOT_CONFIGURED and built == []     # refused before any load
    # and the community policy turns that into a held post
    res = media.map_assessment(out)
    assert res["status"] == "UNAVAILABLE" and res["moderator_review_recommended"] is True and media.hold_reason(res)


def test_community_needs_the_shared_checkout_and_master_switch_but_its_own_directory(monkeypatch, bundle):
    monkeypatch.setenv(COMMUNITY_DIR, str(bundle))
    assert ia.configuration_error(ia.COMMUNITY) == ia.NOT_CONFIGURED                       # no FIRE_EVIDENCE_REPO
    monkeypatch.setenv("FIRE_EVIDENCE_REPO", "/nonexistent-assessor")
    assert ia.configuration_error(ia.COMMUNITY) == ia.INFERENCE_DISABLED                    # master switch off by default
    assert ia.configuration_error(ia.REPORT) == ia.NOT_CONFIGURED                           # the report path does not use the community directory
    monkeypatch.setenv("FIRE_EVIDENCE_INFERENCE_ENABLED", "true")
    assert ia.configuration_error(ia.COMMUNITY) is None and ia.configuration_error(ia.REPORT) == ia.NOT_CONFIGURED
    assert ia.model_version_for(ia.COMMUNITY) == ia.EXPECTED_MODEL_VERSION
    monkeypatch.setenv(COMMUNITY_VERSION, "community-v9")
    assert ia.model_version_for(ia.COMMUNITY) == "community-v9" and ia.model_version_for(ia.REPORT) == ia.EXPECTED_MODEL_VERSION


def test_unconfigured_community_holds_the_post_through_the_real_route_even_if_reports_are_configured(monkeypatch, bundle):
    configure(monkeypatch, bundle)
    enable(monkeypatch, assess=True)
    c, h, _ = actor("citizen"); pid = new_post(c, h)
    assert upload(c, h, pid).status_code == 201 and post_status(pid) == "held"
    assert db_scalar("SELECT error_code FROM resq_community_image_assessments a JOIN resq_community_post_images i ON i.id=a.image_id WHERE i.post_id=:p", p=pid) == ia.NOT_CONFIGURED


def test_the_community_path_requests_its_own_configuration(monkeypatch):
    from tests.test_community_media_moderation import model_returns
    calls = model_returns(monkeypatch, ia.unavailable(ia.TIMEOUT))
    enable(monkeypatch, assess=True)
    c, h, _ = actor("citizen"); pid = new_post(c, h)
    assert upload(c, h, pid).status_code == 201 and calls.configs == [ia.COMMUNITY]


@pytest.mark.parametrize("config", [ia.REPORT, ia.COMMUNITY])
@pytest.mark.parametrize("breaker,code", [
    ("limitations", ia.NOT_APPROVED),                                  # edited after approval
    ("weights", ia.INTEGRITY_FAILED), ("missing", ia.NOT_FOUND),
])
def test_both_configurations_fail_closed_on_unapproved_or_broken_artifacts(monkeypatch, tmp_path, config, breaker, code):
    d = copy_bundle(tmp_path, "art")
    if breaker == "limitations":
        edit(d, lambda m: m.__setitem__("limitations", [*m["limitations"], "changed after approval"]))
    elif breaker == "weights":
        (d / "weights.pt").write_bytes(b"tampered")
    else:
        shutil.rmtree(d)
    monkeypatch.setenv("FIRE_EVIDENCE_REPO", "/nonexistent-assessor")
    monkeypatch.setenv("FIRE_EVIDENCE_INFERENCE_ENABLED", "true")
    monkeypatch.setenv("FIRE_EVIDENCE_MODEL_VERSION", FIXTURE_VERSION)
    monkeypatch.setenv(COMMUNITY_VERSION, FIXTURE_VERSION)
    monkeypatch.setenv("FIRE_EVIDENCE_ARTIFACT_DIR" if config == ia.REPORT else COMMUNITY_DIR, str(d))
    ia.reset_for_tests()
    out = ia.assess_image(jpeg_bytes(), "i", config)
    assert out["assessment_status"] == "UNAVAILABLE" and out["error_code"] == code and out["scores"] is None and out["derived_label"] is None


def test_each_configuration_is_approved_and_loaded_separately(monkeypatch, tmp_path):
    good_dir, bad_dir = copy_bundle(tmp_path, "good"), copy_bundle(tmp_path, "bad")
    (bad_dir / "weights.pt").write_bytes(b"tampered")
    monkeypatch.setenv("FIRE_EVIDENCE_REPO", "/nonexistent-assessor")
    monkeypatch.setenv("FIRE_EVIDENCE_INFERENCE_ENABLED", "true")
    monkeypatch.setenv("FIRE_EVIDENCE_MODEL_VERSION", FIXTURE_VERSION)
    monkeypatch.setenv(COMMUNITY_VERSION, FIXTURE_VERSION)
    monkeypatch.setenv("FIRE_EVIDENCE_ARTIFACT_DIR", str(good_dir))
    monkeypatch.setenv(COMMUNITY_DIR, str(bad_dir))
    assert ia.preflight_artifact(str(good_dir), FIXTURE_VERSION) is None            # the report artifact is approved ...
    assert ia._build_service(ia.COMMUNITY)[1] == ia.INTEGRITY_FAILED                 # ... which approves nothing about the community one
    monkeypatch.setenv("FIRE_EVIDENCE_ARTIFACT_DIR", str(bad_dir)); monkeypatch.setenv(COMMUNITY_DIR, str(good_dir))
    assert ia._build_service(ia.REPORT)[1] == ia.INTEGRITY_FAILED and ia.preflight_artifact(str(good_dir), FIXTURE_VERSION) is None
    assert ia._build_service("nonsense") == (None, ia.NOT_CONFIGURED)
    assert ia.load_state()["community_configuration_error"] is None


@needs_assessor
def test_a_community_only_deployment_runs_its_own_artifact_and_keeps_report_unavailable(monkeypatch, bundle):
    from tests.test_fire_evidence_adapter import ASSESSOR_REPO
    monkeypatch.setenv("FIRE_EVIDENCE_REPO", str(ASSESSOR_REPO))
    monkeypatch.setenv("FIRE_EVIDENCE_INFERENCE_ENABLED", "true")
    monkeypatch.setenv(COMMUNITY_DIR, str(bundle)); monkeypatch.setenv(COMMUNITY_VERSION, FIXTURE_VERSION)
    monkeypatch.setenv("FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY", (FIXTURES / "test-public-key.b64").read_text().strip())
    monkeypatch.setenv("FIRE_EVIDENCE_TRUSTED_KEY_ID", "terrawatt-test-only")
    ia.reset_for_tests(); use_stub()
    assert ia.assess_image(jpeg_bytes(), "i")["error_code"] == ia.NOT_CONFIGURED
    com = ia.assess_image(jpeg_bytes(), "i", ia.COMMUNITY)
    assert com["assessment_status"] in ("COMPLETED", "UNAVAILABLE")
    if com["assessment_status"] == "COMPLETED":                                      # the fixture excludes authenticity: NOT_ASSESSED -> held
        assert media.map_assessment(com)["status"] == "INCONCLUSIVE"


def test_community_results_never_copy_fire_output(monkeypatch):
    monkeypatch.setattr(ia, "configuration_error", lambda *a: None)
    san = ia.sanitize_community_assessment(completed("NO_CONCERNS_FOUND", **EXTREME_FIRE))
    res = media.map_assessment(san)
    assert set(res) == set(media.RESULT_KEYS) and res["status"] == "AUTHENTIC_NO_CONCERN"
    blob = json.dumps(res)
    for leaked in ("flames_visible", "smoke_visible", "ACTIVE_FIRE", "review_priority", "ood_flag", "scores", "derived_label", "decision"):
        assert leaked not in blob
    for status in ("POSSIBLE_SYNTHETIC", "REUSED", "INCONCLUSIVE"):
        assert media.hold_reason(media.map_assessment(ia.sanitize_community_assessment(completed(status, **EXTREME_FIRE))))
    assert media.hold_reason(media.unavailable_result(ia.NOT_CONFIGURED))


# ======================================================================================= (c) shadow mode
def shadow_world(iid):
    return world(iid)


def test_shadow_mode_is_off_by_default_and_needs_enabled_inference(monkeypatch, holder):
    assert ia.shadow_requested() is False and ia.shadow_active() is False
    monkeypatch.setenv(SHADOW, "true")
    assert ia.shadow_active() is True
    monkeypatch.delenv("FIRE_EVIDENCE_INFERENCE_ENABLED")
    assert ia.shadow_requested() is True and ia.shadow_active() is False                  # inference off: not shadow, plain UNAVAILABLE
    assert ia.persistence_fields(ia.unavailable(ia.INFERENCE_DISABLED))["status"] == "UNAVAILABLE"


def test_shadow_view_shape():
    v = ia.shadow_view("fake-v1")
    assert v["assessment_status"] == "SHADOW" and v["model_version"] == "fake-v1" and v["review_required"] is False
    assert v["scores"] is None and v["derived_label"] is None and v["ood_flag"] is None and v["quality_flags"] == []
    assert v["authenticity"] == {"status": "NOT_ASSESSED", "signals": []} and set(v["indications"].values()) == {"NOT_ASSESSED"}
    assert v["limitations"] == ["Shadow mode: recorded for evaluation only"] and v["media_integrity"]["status"] == "NOT_ASSESSED"


def test_shadow_rows_are_persisted_in_full_but_hidden_on_every_route_and_change_nothing(monkeypatch, holder):
    monkeypatch.setenv(SHADOW, "true")
    monkeypatch.setenv("FIRE_EVIDENCE_REPORT_AUTHENTICITY_ENABLED", "true")
    holder.result = completed("POSSIBLE_SYNTHETIC", ["GENERATOR_TAG_IN_METADATA"], **EXTREME_FIRE)
    citizen, zh, uid = actor("citizen"); rid = citizen_report(uid)
    ranger, rh, ranger_id = actor("field_crew")
    control, ch, _ = actor("control_room_operator", scopes=["OD"])
    aid = control.post(f"/api/control-room/incidents/{rid}/assignments", headers=ch, json={"ranger_id": ranger_id}).json()["assignment"]["id"]
    bearer = staff_actor(); staff = fresh_client(); h = with_csrf(staff, bearer)
    other = create_incident(staff, h)
    before, other_before = world(rid), world(other)
    c = citizen.post(f"/api/citizen/reports/{rid}/evidence", headers=zh, files=files(jpeg_bytes()))
    r = ranger.post(f"/api/ranger/assignments/{aid}/evidence", headers=rh, files=files(jpeg_bytes()))
    up = staff.post(f"/api/incidents/{other}/images", headers=h, files=files(jpeg_bytes()))
    assert c.status_code == r.status_code == up.status_code == 201
    # persisted in full ...
    for iid in (rid, other):
        row = image_row(iid)
        assert row["assessment_status"] == "SHADOW" and row["authenticity_status"] is None and row["human_review_status"] == "NOT_REVIEWED"
        stored = row["assessment"]
        assert stored["shadow"] is True and stored["assessment_status"] == "COMPLETED" and stored["derived_label"] == "ACTIVE_FIRE" and stored["scores"]["flames_visible"] == 1.0
    # ... hidden everywhere
    assert c.json()["evidence"]["assessment_status"] == "SHADOW" and r.json()["evidence"]["assessment_status"] == "SHADOW"
    shown = up.json()["image"]["assessment"]
    assert shown == ia.shadow_view("fake-v1") or shown["assessment_status"] == "SHADOW"
    assert shown["scores"] is None and shown["derived_label"] is None and shown["review_required"] is False and up.json()["image"]["assessment_status"] == "SHADOW"
    detail = staff.get(f"/api/incidents/{other}", headers=bearer).json()
    assert detail["images"][0]["assessment"]["assessment_status"] == "SHADOW" and detail["images"][0]["authenticity_status"] is None
    listed = {i["id"]: i for i in staff.get("/api/incidents", headers=bearer).json()}
    assert listed[other]["image_assessment_status"] == "SHADOW" and listed[other]["image_media_integrity_status"] == "NOT_ASSESSED"
    surfaces = [c.text, r.text, up.text, json.dumps(detail, default=str), json.dumps(listed[other], default=str), citizen.get(f"/api/citizen/reports/{rid}", headers=zh).text,
                ranger.get(f"/api/ranger/assignments/{aid}", headers=rh).text]
    for text_ in surfaces:
        for leaked in ("flames_visible", "ACTIVE_FIRE", "POSSIBLE_SYNTHETIC", "GENERATOR_TAG", '"HIGH"'):
            assert leaked not in text_
    # no workflow effect
    assert world(rid) == before and world(other) == other_before
    assert db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=rid) == "reported"
    # still hidden after the flag is turned off (the rows were never validated for display)
    monkeypatch.delenv(SHADOW)
    assert staff.get(f"/api/incidents/{other}", headers=bearer).json()["images"][0]["assessment"]["assessment_status"] == "SHADOW"


def test_shadow_mode_also_records_unavailable_results_with_their_error_code(monkeypatch, holder):
    monkeypatch.setenv(SHADOW, "true")
    holder.result = {"assessment_status": "UNAVAILABLE", "error_code": ia.TIMEOUT}
    f = ia.persistence_fields(ia.sanitize_assessment(holder.result))
    assert f["status"] == "SHADOW" and f["error"] == ia.TIMEOUT and json.loads(f["assessment"])["shadow"] is True
    cfg = ia.persistence_fields(ia.unavailable(ia.NOT_CONFIGURED))
    assert cfg["status"] == "UNAVAILABLE"                                                  # a configuration refusal is not a shadow observation


def test_shadow_off_keeps_todays_behaviour(holder):
    f = ia.persistence_fields(ia.sanitize_assessment(completed("NO_CONCERNS_FOUND", **EXTREME_FIRE)))
    assert f["status"] == "COMPLETED" and "shadow" not in json.loads(f["assessment"])


def test_shadow_mode_does_not_affect_the_community_path(monkeypatch):
    raw = completed("POSSIBLE_SYNTHETIC", ["GENERATOR_TAG_IN_METADATA"], **EXTREME_FIRE)
    outs = []
    for value in ("true", "false"):
        monkeypatch.setenv(SHADOW, value)
        monkeypatch.setattr(ia, "configuration_error", lambda *a: None)
        monkeypatch.setattr(ia, "_load_service", lambda *a: __import__("tests.test_fire_evidence_media_integrity", fromlist=["Assessor"]).Assessor(raw, {"status": "PROVIDED"}))
        out = ia.assess_image(b"x", "i", ia.COMMUNITY)
        assert out["assessment_status"] == "COMPLETED" and out["authenticity"]["status"] == "POSSIBLE_SYNTHETIC"
        outs.append(media.map_assessment(out))
    assert outs[0] == outs[1] and outs[0]["status"] == "POSSIBLE_SYNTHETIC"
    src = Path(media.__file__).read_text()
    assert "shadow" not in src.lower().replace("shared_model", "")
