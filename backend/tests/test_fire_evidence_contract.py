"""Staff-facing assessment contract of the Fire Evidence adapter: exact keys, indications mapping, UNAVAILABLE never reading as a negative,
calibration/threshold behaviour at the adapter boundary, optional Ed25519 verification, and legacy-row presentation.

No database is used. Tests marked `needs_assessor` use the REAL fire_assessor package (set FIRE_EVIDENCE_TEST_ASSESSOR_REPO) with a stub
scorer; everything else uses fakes. No torch, no real checkpoint.
"""
import base64
import copy
import json
import math
import shutil
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services import image_assessment as ia  # noqa: E402
from tests.test_fire_evidence_adapter import (FIXTURE_VERSION, FIXTURES, ASSESSOR_REPO, bundle, clean_adapter, configure, edit, good,  # noqa: E402,F401
                                              jpeg_bytes, needs_assessor, use_stub)

COMPLETED_KEYS = {"assessment_status", "artifact_status", "model_version", "error_code", "scores", "derived_label", "decision", "review_required",
                  "review_priority", "quality_flags", "ood_flag", "authenticity", "indications", "media_integrity", "limitations"}


@pytest.fixture(autouse=True)
def report_authenticity_on(monkeypatch):
    """This file tests the exposed-authenticity contract; the flag-off behaviour is tested in test_fire_evidence_media_integrity.py."""
    monkeypatch.setenv("FIRE_EVIDENCE_REPORT_AUTHENTICITY_ENABLED", "true")


def completed(status="NO_CONCERNS_FOUND", signals=(), **overrides):
    r = good()
    r["authenticity"] = {"status": status, "signals": list(signals)}
    r.update(overrides)
    return r


# ------------------------------------------------------------------------------------------- exact COMPLETED contract
def test_completed_result_exposes_exactly_the_contract_keys():
    r = completed(); r.update({"dispatch_rangers": True, "incident_status": "verified", "raw_logits": {"flames_visible": 9.0}, "embedding": [1, 2]})
    out = ia.sanitize_assessment(r)
    assert set(out) == COMPLETED_KEYS
    assert out["assessment_status"] == "COMPLETED" and out["artifact_status"] == "APPROVED" and out["error_code"] is None
    assert out["decision"] == "REQUIRES_REVIEW" and out["review_required"] is True
    assert set(out["scores"]) == {"flames_visible", "smoke_visible"} and set(out["authenticity"]) == {"status", "signals"}
    assert set(out["indications"]) == {"synthetic", "edited", "reused"}


def test_review_is_required_for_every_status_the_adapter_can_emit():
    assert ia.sanitize_assessment(completed(), "v")["review_required"] is True
    assert ia.unavailable(ia.TIMEOUT)["review_required"] is True
    exp = {"assessment_status": "EXPERIMENTAL", "artifact_status": ia.EXPERIMENTAL_ARTIFACT_STATUS, "checkpoint_sha256": ia.EXPERIMENTAL_ALLOWED_SHA256,
           "raw_logits": {"flames_visible": 1.5, "smoke_visible": -2.0}, "model_version": "exp"}
    out = ia.sanitize_experimental(exp)
    assert out["assessment_status"] == "EXPERIMENTAL" and out["review_required"] is True and out["scores"] is None and out["derived_label"] is None
    assert out["raw_logits"] == {"flames_visible": 1.5, "smoke_visible": -2.0} and out["scores_calibrated"] is False
    assert out["authenticity"]["status"] == "NOT_ASSESSED" and set(out["indications"].values()) == {"NOT_ASSESSED"}


def test_unknown_signal_and_limitation_shapes_are_normalised():
    out = ia.sanitize_assessment(completed("POSSIBLE_EDITED", ["LEARNED_EDITED_SCORE:0.91"] + ["x"] * 50, limitations=[1, "two"]))
    assert len(out["authenticity"]["signals"]) == ia.MAX_SIGNALS and out["limitations"] == ["1", "two"]


def test_reused_signal_never_carries_other_image_ids_into_the_response():
    out = ia.sanitize_assessment(completed("REUSED", ["REUSED_MATCHES:7/abc.jpg,9/def.jpg"]))
    assert out["authenticity"]["signals"] == ["REUSED_MATCHES"] and "abc" not in json.dumps(out)


# ------------------------------------------------------------------------------------------- indications mapping
@pytest.mark.parametrize("status,signals,expected", [
    ("POSSIBLE_SYNTHETIC", [], ("POSSIBLE", "NOT_ASSESSED", "NOT_ASSESSED")),
    ("POSSIBLE_EDITED", [], ("NOT_ASSESSED", "POSSIBLE", "NOT_ASSESSED")),
    ("REUSED", ["REUSED_MATCHES:a"], ("NOT_ASSESSED", "NOT_ASSESSED", "POSSIBLE")),
    ("INCONSISTENT", ["EXIF_CAPTURE_AFTER_UPLOAD"], ("NOT_ASSESSED", "POSSIBLE", "NOT_ASSESSED")),
    ("INCONCLUSIVE", [], ("NOT_ASSESSED", "NOT_ASSESSED", "NOT_ASSESSED")),
    ("NOT_ASSESSED", [], ("NOT_ASSESSED", "NOT_ASSESSED", "NOT_ASSESSED")),
    # the status is the highest-priority concern only; the signals still say what else fired
    ("REUSED", ["REUSED_MATCHES:a", "GENERATOR_TAG_IN_METADATA", "LEARNED_EDITED_SCORE:0.80"], ("POSSIBLE", "POSSIBLE", "POSSIBLE")),
    ("POSSIBLE_SYNTHETIC", ["IPTC_DIGITAL_SOURCE_ALGORITHMIC", "LEARNED_SYNTHETIC_SCORE:0.97"], ("POSSIBLE", "NOT_ASSESSED", "NOT_ASSESSED")),
    # weak, informational signals never become an indication
    ("INCONCLUSIVE", ["EDITING_SOFTWARE_TAG", "C2PA_MANIFEST_PRESENT_UNVERIFIED", "EXIF_CAPTURE_OLD"], ("NOT_ASSESSED", "NOT_ASSESSED", "NOT_ASSESSED")),
])
def test_indications_are_derived_from_status_and_signals(status, signals, expected):
    out = ia.sanitize_assessment(completed(status, signals))
    assert (out["indications"]["synthetic"], out["indications"]["edited"], out["indications"]["reused"]) == expected
    assert all(v in ia.INDICATION_VALUES for v in out["indications"].values())


def test_no_concerns_found_is_none_found_only_for_what_was_assessed():
    out = ia.sanitize_assessment(completed("NO_CONCERNS_FOUND"))
    assert out["indications"] == {"synthetic": "NONE_FOUND", "edited": "NONE_FOUND", "reused": "NOT_ASSESSED"}  # the website adapter has no reuse index
    assert ia.REUSE_CHECK_ACTIVE is False


def test_reuse_none_found_requires_an_active_reuse_check(monkeypatch):
    monkeypatch.setattr(ia, "REUSE_CHECK_ACTIVE", True)
    assert ia.sanitize_assessment(completed("NO_CONCERNS_FOUND"))["indications"]["reused"] == "NONE_FOUND"


def test_inconsistent_is_a_possible_edit_with_an_explanatory_limitation_and_is_idempotent():
    once = ia.sanitize_assessment(completed("INCONSISTENT", ["EXIF_GPS_FAR_FROM_REPORTED_LOCATION"]))
    assert once["authenticity"]["status"] == "INCONSISTENT" and once["indications"]["edited"] == "POSSIBLE"
    assert ia.INCONSISTENT_NOTE in once["limitations"]
    assert ia.sanitize_assessment(once) == once  # re-presenting a stored row changes nothing and does not duplicate the note


def test_authenticity_excluded_by_the_artifact_is_not_assessed_whatever_the_model_returned():
    r = completed("NO_CONCERNS_FOUND", ["GENERATOR_TAG_IN_METADATA"])
    out = ia.sanitize_assessment(r, authenticity_assessed=False)
    assert out["authenticity"] == {"status": "NOT_ASSESSED", "signals": []} and set(out["indications"].values()) == {"NOT_ASSESSED"}
    assert ia.NOT_ASSESSED_NOTE in out["limitations"] and ia.sanitize_assessment(out) == out


def test_authenticity_provided_helper_follows_the_loaded_artifact():
    mk = lambda auth: SimpleNamespace(artifact=SimpleNamespace(authenticity=auth))  # noqa: E731
    assert ia._authenticity_provided(mk({"status": "PROVIDED"})) is True
    assert ia._authenticity_provided(mk({"status": "EXCLUDED_BY_POLICY", "reason": "x"})) is False
    assert ia._authenticity_provided(mk({})) is False
    assert ia._authenticity_provided(SimpleNamespace(artifact=SimpleNamespace())) is True  # a fake without the attribute


# ------------------------------------------------------------------------------------------- UNAVAILABLE is never a negative result
@pytest.mark.parametrize("code", [ia.NOT_CONFIGURED, ia.INFERENCE_DISABLED, ia.TIMEOUT, ia.BUSY, ia.INFERENCE_FAILED, ia.NOT_APPROVED, ia.SIGNATURE_INVALID])
def test_unavailable_never_looks_like_a_negative_finding(code):
    out = ia.unavailable(code)
    assert out["assessment_status"] == "UNAVAILABLE" and out["error_code"] == code and out["review_required"] is True
    assert out["scores"] is None and out["derived_label"] is None and out["artifact_status"] is None
    assert out["ood_flag"] is None                                    # false would read as "in distribution"
    assert out["authenticity"] == {"status": "NOT_ASSESSED", "signals": []}
    assert out["indications"] == {"synthetic": "NOT_ASSESSED", "edited": "NOT_ASSESSED", "reused": "NOT_ASSESSED"}
    assert out["quality_flags"] == [] and out["decision"] == "REQUIRES_REVIEW" and out["review_priority"] == "STANDARD"
    assert set(out) == COMPLETED_KEYS


def test_invalid_or_unapproved_model_results_degrade_to_the_same_unavailable_shape():
    for bad in (completed(artifact_status="NOT_APPROVED"), completed(scores={"flames_visible": 3.2, "smoke_visible": -1.0}), "junk", None):
        out = ia.sanitize_assessment(bad)
        assert out["assessment_status"] == "UNAVAILABLE" and out["scores"] is None and out["derived_label"] is None and out["indications"]["synthetic"] == "NOT_ASSESSED"
        assert set(out) == COMPLETED_KEYS


# ------------------------------------------------------------------------------------------- stored rows (written by earlier versions)
def test_legacy_rows_are_presented_in_the_current_shape():
    legacy_completed = {"assessment_status": "COMPLETED", "model_version": "v", "error_code": None, "scores": {"flames_visible": 0.9, "smoke_visible": 0.1},
                        "derived_label": "ACTIVE_FIRE", "decision": "REQUIRES_REVIEW", "review_priority": "HIGH", "quality_flags": [], "ood_flag": False,
                        "authenticity": {"status": "POSSIBLE_SYNTHETIC", "signals": []}, "limitations": ["l"], "artifact_status": "APPROVED", "secret_extra": 1}
    out = ia.present_assessment(legacy_completed, "COMPLETED")
    assert set(out) == COMPLETED_KEYS and out["indications"]["synthetic"] == "POSSIBLE" and "secret_extra" not in out
    legacy_unavailable = {"assessment_status": "UNAVAILABLE", "model_version": "unconfigured", "error_code": ia.TIMEOUT, "scores": None, "derived_label": None,
                          "decision": "REQUIRES_REVIEW", "review_priority": "STANDARD", "quality_flags": [], "ood_flag": False,
                          "authenticity": {"status": "INCONCLUSIVE", "signals": []}, "limitations": [], "artifact_status": None}
    old = ia.present_assessment(legacy_unavailable, "UNAVAILABLE")
    assert old["error_code"] == ia.TIMEOUT and old["authenticity"]["status"] == "NOT_ASSESSED" and old["ood_flag"] is None and old["review_required"] is True


@pytest.mark.parametrize("stored", [None, {}, "x", [], 7, {"assessment_status": "COMPLETED"}, {"assessment_status": "WHATEVER"}])
def test_unreadable_stored_assessments_are_unavailable_never_clean(stored):
    out = ia.present_assessment(stored, "PENDING", "MODEL_TIMEOUT")
    assert out["assessment_status"] == "UNAVAILABLE" and out["scores"] is None and out["review_required"] is True and set(out) == COMPLETED_KEYS


def test_operations_image_row_uses_the_typed_presentation():
    from app.routers import operations
    row = {"id": 1, "incident_id": 2, "original_filename": "a.jpg", "content_type": "image/jpeg", "size_bytes": 3, "assessment_status": "UNAVAILABLE",
           "assessment": {"assessment_status": "UNAVAILABLE", "scores": {"flames_visible": 1.0, "smoke_visible": 1.0}, "derived_label": "ACTIVE_FIRE", "error_code": "MODEL_TIMEOUT"},
           "human_review_status": "NOT_REVIEWED", "created_at": "t"}
    shown = operations._image_row(row)["assessment"]
    assert shown["scores"] is None and shown["derived_label"] is None and shown["error_code"] == "MODEL_TIMEOUT"
    assert operations._image_row({**row, "assessment": None})["assessment"]["assessment_status"] == "UNAVAILABLE"


def test_persistence_fields_store_the_presented_shape():
    f = ia.persistence_fields(ia.sanitize_assessment(completed("POSSIBLE_EDITED", ["LEARNED_EDITED_SCORE:0.9"])))
    stored = json.loads(f["assessment"])
    assert f["status"] == "COMPLETED" and f["auth"] == "POSSIBLE_EDITED" and set(stored) == COMPLETED_KEYS and stored["indications"]["edited"] == "POSSIBLE"
    un = ia.persistence_fields(ia.unavailable(ia.BUSY))
    assert un["status"] == "UNAVAILABLE" and un["auth"] is None and set(json.loads(un["assessment"])) == COMPLETED_KEYS


# ------------------------------------------------------------------------------------------- calibration / thresholds at the adapter boundary
class FakeAssessor:
    """Stands in for fire_assessor.pipeline.Assessor: returns whatever dict it is given, like model_dump()."""
    def __init__(self, result, authenticity=None):
        self.result, self.artifact = result, SimpleNamespace(model_version="fake-v1", authenticity=authenticity or {"status": "PROVIDED"})

    def assess_bytes(self, data, image_id):
        return SimpleNamespace(model_dump=lambda: copy.deepcopy(self.result))


def run_with(monkeypatch, result, authenticity=None):
    monkeypatch.setattr(ia, "configuration_error", lambda *a: None)
    monkeypatch.setattr(ia, "_load_service", lambda *a: FakeAssessor(result, authenticity))
    return ia.assess_image(b"x", "img")


def test_raw_logits_or_uncalibrated_numbers_are_never_accepted_as_scores(monkeypatch):
    for scores in ({"flames_visible": 4.2, "smoke_visible": 0.1}, {"flames_visible": -3.0, "smoke_visible": 0.1}, {"flames_visible": float("nan"), "smoke_visible": 0.1},
                   {"flames_visible": 0.9}, {"flames_visible": 0.9, "smoke_visible": 0.1, "logit": 3.0}, {"flames_visible": True, "smoke_visible": 0.1}):
        out = run_with(monkeypatch, completed(scores=scores))
        assert out["assessment_status"] == "UNAVAILABLE" and out["error_code"] == ia.RESULT_INVALID and out["scores"] is None and out["derived_label"] is None


@pytest.mark.parametrize("artifact_status", [None, "NOT_APPROVED", "INCOMPLETE", "EXPERIMENTAL_UNAPPROVED", "approved"])
def test_label_and_scores_are_absent_unless_the_artifact_is_approved(monkeypatch, artifact_status):
    out = run_with(monkeypatch, completed(artifact_status=artifact_status))
    assert out["assessment_status"] == "UNAVAILABLE" and out["error_code"] == ia.NOT_APPROVED and out["derived_label"] is None and out["scores"] is None


def test_the_label_must_come_from_the_policy_vocabulary_and_decision_can_only_be_review(monkeypatch):
    for mutate in (lambda r: r.__setitem__("derived_label", "CONFIRMED_FIRE"), lambda r: r.__setitem__("derived_label", None), lambda r: r.__setitem__("decision", "DISPATCH")):
        r = completed(); mutate(r)
        assert run_with(monkeypatch, r)["assessment_status"] == "UNAVAILABLE"
    for label in sorted(ia.DERIVED_LABELS):
        ok = run_with(monkeypatch, completed(derived_label=label))
        assert ok["derived_label"] == label and ok["decision"] == "REQUIRES_REVIEW" and ok["review_required"] is True


def test_fire_and_smoke_output_contract_through_the_adapter(monkeypatch):
    out = run_with(monkeypatch, completed(scores={"flames_visible": 0.0, "smoke_visible": 1.0}, derived_label="SMOKE_ONLY", review_priority="HIGH", quality_flags=["TOO_DARK"], ood_flag=True))
    assert out["scores"] == {"flames_visible": 0.0, "smoke_visible": 1.0} and out["derived_label"] == "SMOKE_ONLY"
    assert out["review_priority"] == "HIGH" and out["quality_flags"] == ["TOO_DARK"] and out["ood_flag"] is True and out["model_version"] == "v"


def test_artifact_that_excludes_authenticity_reports_not_assessed_through_the_adapter(monkeypatch):
    out = run_with(monkeypatch, completed("INCONCLUSIVE"), authenticity={"status": "EXCLUDED_BY_POLICY", "reason": "no head"})
    assert out["authenticity"]["status"] == "NOT_ASSESSED" and out["assessment_status"] == "COMPLETED"
    assert run_with(monkeypatch, completed("INCONCLUSIVE"))["authenticity"]["status"] == "INCONCLUSIVE"


def _sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))


@needs_assessor
@pytest.mark.parametrize("flames,smoke,label,priority", [(30.0, -30.0, "ACTIVE_FIRE", "HIGH"), (-30.0, 30.0, "SMOKE_ONLY", "HIGH"), (-30.0, -30.0, "NO_VISIBLE_FIRE", "STANDARD"),
                                                         (-1.0, -1.0, "NO_VISIBLE_FIRE", "STANDARD")])
def test_scores_are_temperature_calibrated_probabilities_and_the_label_follows_the_artifact_thresholds(monkeypatch, bundle, flames, smoke, label, priority):
    meta = json.loads((bundle / "artifact.json").read_text())
    T = meta["temperatures"]
    configure(monkeypatch, bundle); use_stub(flames=flames, smoke=smoke)
    out = ia.assess_image(jpeg_bytes(), "img")
    assert out["assessment_status"] == "COMPLETED" and out["artifact_status"] == "APPROVED"
    assert out["scores"]["flames_visible"] == pytest.approx(_sigmoid(flames / T["flames"]), abs=1e-9)   # sigmoid(logit / T), not the raw logit
    assert out["scores"]["smoke_visible"] == pytest.approx(_sigmoid(smoke / T["smoke"]), abs=1e-9)
    assert all(0.0 <= v <= 1.0 for v in out["scores"].values())
    assert out["derived_label"] == label and out["review_priority"] == priority and out["review_required"] is True
    th = meta["thresholds"]   # the thresholds come from the signed artifact, not from the website
    assert (out["scores"]["flames_visible"] >= th["flames"]) == (label == "ACTIVE_FIRE")
    assert out["authenticity"]["status"] == "NOT_ASSESSED"   # the fixture artifact excludes authenticity by policy
    assert set(out) == COMPLETED_KEYS


@needs_assessor
def test_a_score_exactly_at_the_decision_band_is_uncertain_not_a_confident_label(monkeypatch, bundle):
    meta = json.loads((bundle / "artifact.json").read_text())
    T, th = meta["temperatures"], meta["thresholds"]
    logit = T["flames"] * math.log(th["flames"] / (1 - th["flames"]))  # calibrated probability == the flames threshold
    configure(monkeypatch, bundle); use_stub(flames=logit, smoke=-30.0)
    out = ia.assess_image(jpeg_bytes(), "img")
    assert out["scores"]["flames_visible"] == pytest.approx(th["flames"], abs=1e-6) and out["derived_label"] == "UNCERTAIN"


@needs_assessor
def test_non_approved_artifact_produces_neither_scores_nor_label(monkeypatch, bundle):
    edit(bundle, lambda m: m.__setitem__("limitations", [*m["limitations"], "changed after approval"]))  # content changed, binding no longer matches
    configure(monkeypatch, bundle, version=FIXTURE_VERSION); use_stub(flames=30.0, smoke=30.0)
    monkeypatch.delenv("FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY")
    out = ia.assess_image(jpeg_bytes(), "img")
    assert out["assessment_status"] == "UNAVAILABLE" and out["scores"] is None and out["derived_label"] is None and out["error_code"] == ia.NOT_APPROVED


# ------------------------------------------------------------------------------------------- optional Ed25519 signature verification
def _signed_bundle(bundle):
    return json.loads((bundle / "artifact.json").read_text())


def test_signature_is_not_checked_when_no_trusted_key_is_configured(bundle):
    edit(bundle, lambda m: m["approval"]["record"].__setitem__("scope", "re-bound but unsigned"), reapprove=True)
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) is None   # known limitation: without the key, only the content-digest binding is enforced


def test_valid_signature_passes_when_the_trusted_key_is_configured(monkeypatch, bundle):
    monkeypatch.setenv("FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY", (FIXTURES / "test-public-key.b64").read_text().strip())
    monkeypatch.setenv("FIRE_EVIDENCE_TRUSTED_KEY_ID", "terrawatch-test-only")
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) is None
    assert ia.signing_payload(_signed_bundle(bundle)) == ia.signing_payload({**_signed_bundle(bundle), "approval": {**_signed_bundle(bundle)["approval"], "signature": {"x": 1}}})


@pytest.mark.parametrize("mutate", [
    lambda m: m["approval"]["record"].__setitem__("scope", "edited and re-bound after signing"),
    lambda m: m["approval"].pop("signature"),
    lambda m: m["approval"]["signature"].__setitem__("value", base64.b64encode(b"\x00" * 64).decode()),
    lambda m: m["approval"]["signature"].__setitem__("value", "not base64!"),
    lambda m: m["approval"]["signature"].__setitem__("algorithm", "RSA"),
    lambda m: m["approval"]["signature"].__setitem__("key_id", "someone-else"),
    lambda m: m.__setitem__("limitations", [*m["limitations"], "added after signing"]),
])
def test_missing_forged_or_stale_signature_fails_closed_when_the_key_is_configured(monkeypatch, bundle, mutate):
    edit(bundle, mutate, reapprove=True)   # re-bound so every earlier check passes: only the signature can refuse it
    monkeypatch.setenv("FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY", (FIXTURES / "test-public-key.b64").read_text().strip())
    monkeypatch.setenv("FIRE_EVIDENCE_TRUSTED_KEY_ID", "terrawatch-test-only")
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.SIGNATURE_INVALID


def test_a_different_trusted_key_or_a_malformed_key_refuses_a_genuinely_signed_bundle(monkeypatch, bundle):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    other = Ed25519PrivateKey.generate().public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    monkeypatch.setenv("FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY", base64.b64encode(other).decode())
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.SIGNATURE_INVALID
    monkeypatch.setenv("FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY", "###")
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.SIGNATURE_INVALID


def test_signature_failure_stops_inference_with_the_explicit_code(monkeypatch, bundle):
    edit(bundle, lambda m: m["approval"]["record"].__setitem__("scope", "re-bound, unsigned"), reapprove=True)
    configure(monkeypatch, bundle)   # configure() sets the trusted key
    out = ia.assess_image(jpeg_bytes(), "img")
    assert out["assessment_status"] == "UNAVAILABLE" and out["error_code"] == ia.SIGNATURE_INVALID and out["scores"] is None
