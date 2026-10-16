"""Fail-closed Fire Evidence Assessor adapter: artifact pre-flight, explicit UNAVAILABLE states, result sanitising, request-path safety.

Mocked vs real:
  * No database is used here. Artifact bundles are REAL bundles produced by the assessor's own tooling
    (tests/fixtures/fire_evidence, regenerate with the assessor's scripts/make_test_fixture_bundles.py); they are tiny toy fixtures, not models.
  * Tests marked `needs_assessor` import the REAL fire_assessor package (loader, architecture check, Assessor pipeline) from
    FIRE_EVIDENCE_TEST_ASSESSOR_REPO (or FIRE_EVIDENCE_REPO) and skip, with a reason, when it is not available.
  * The scorer is a STUB (no torch, no weights): inference itself is mocked; the contract around it is real.
"""
import asyncio
import copy
import json
import os
import shutil
import sys
import threading
import time
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services import image_assessment as ia  # noqa: E402

FIXTURES = Path(__file__).parent / "fixtures" / "fire_evidence"
FIXTURE_VERSION = "fire-assessor-fixture-0"
_repo = os.getenv("FIRE_EVIDENCE_TEST_ASSESSOR_REPO") or os.getenv("FIRE_EVIDENCE_REPO") or ""
ASSESSOR_REPO = Path(_repo) if _repo and (Path(_repo) / "src" / "fire_assessor").is_dir() else None
needs_assessor = pytest.mark.skipif(ASSESSOR_REPO is None, reason="set FIRE_EVIDENCE_TEST_ASSESSOR_REPO to a fire-evidence-assessor checkout")

JPEG = None


def jpeg_bytes() -> bytes:
    global JPEG
    if JPEG is None:
        import io
        import random
        from PIL import Image
        rnd = random.Random(1)
        img = Image.new("RGB", (160, 120))
        img.putdata([(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)) for _ in range(160 * 120)])
        buf = io.BytesIO(); img.save(buf, "JPEG"); JPEG = buf.getvalue()
    return JPEG


@pytest.fixture(autouse=True)
def clean_adapter(monkeypatch):
    for name in ("FIRE_EVIDENCE_REPO", "FIRE_EVIDENCE_ARTIFACT_DIR", "FIRE_EVIDENCE_MODEL_VERSION", "FIRE_EVIDENCE_INFERENCE_ENABLED",
                 "FIRE_EVIDENCE_TIMEOUT_S", "FIRE_EVIDENCE_MAX_PENDING", "FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY"):
        monkeypatch.delenv(name, raising=False)
    ia.reset_for_tests()
    yield
    ia.reset_for_tests()


@pytest.fixture
def bundle(tmp_path):
    d = tmp_path / "approved"
    shutil.copytree(FIXTURES / "approved", d)
    return d


def configure(monkeypatch, artifact_dir, *, enabled=True, repo=None, version=FIXTURE_VERSION):
    monkeypatch.setenv("FIRE_EVIDENCE_REPO", str(repo if repo is not None else (ASSESSOR_REPO or "/nonexistent-assessor")))
    monkeypatch.setenv("FIRE_EVIDENCE_ARTIFACT_DIR", str(artifact_dir))
    monkeypatch.setenv("FIRE_EVIDENCE_MODEL_VERSION", version)
    monkeypatch.setenv("FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY", (FIXTURES / "test-public-key.b64").read_text().strip())
    monkeypatch.setenv("FIRE_EVIDENCE_TRUSTED_KEY_ID", "terrawatch-test-only")
    if enabled:
        monkeypatch.setenv("FIRE_EVIDENCE_INFERENCE_ENABLED", "true")
    else:
        monkeypatch.delenv("FIRE_EVIDENCE_INFERENCE_ENABLED", raising=False)
    ia.reset_for_tests()


def edit(bundle: Path, fn, *, reapprove=False):
    """Mutate artifact.json. reapprove=True plays the human re-signing the changed content (test stand-in), keeping approval valid."""
    f = bundle / "artifact.json"
    meta = json.loads(f.read_text()); fn(meta)
    if reapprove:
        meta["approval"]["record"]["artifact_binding_sha256"] = ia.binding_digest(meta)
    f.write_text(json.dumps(meta, indent=2, sort_keys=True))


def make_stub_scorer(flames=3.0, smoke=-3.0, delay=0.0):
    sys.path.insert(0, str(ASSESSOR_REPO / "src"))
    import numpy as np
    from fire_assessor.scorer import ScorerOutput

    class Stub:
        def __init__(self):
            self.calls = 0

        def score(self, image):
            self.calls += 1
            if delay:
                time.sleep(delay)
            rng = np.random.default_rng(1)
            return ScorerOutput(flames, smoke, rng.normal(size=8), rng.normal(size=8))
    return Stub()


def use_stub(**kw):
    ia._scorer_factory = lambda weights_path: make_stub_scorer(**kw)


# ------------------------------------------------------------------------------------------- configuration states
def test_unconfigured_is_unavailable_with_explicit_code():
    r = ia.assess_image(b"x", "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == ia.NOT_CONFIGURED and r["scores"] is None and r["derived_label"] is None


@pytest.mark.parametrize("missing", ["FIRE_EVIDENCE_REPO", "FIRE_EVIDENCE_ARTIFACT_DIR"])
def test_half_configured_is_not_configured(monkeypatch, bundle, missing):
    configure(monkeypatch, bundle)
    monkeypatch.delenv(missing)
    assert ia.assess_image(b"x", "i")["error_code"] == ia.NOT_CONFIGURED


def test_disabled_by_default_even_with_an_approved_bundle_and_no_io(monkeypatch, bundle):
    configure(monkeypatch, bundle, enabled=False)
    monkeypatch.setattr(ia, "preflight_artifact", lambda *a, **k: pytest.fail("must not touch the artifact while inference is disabled"))
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["error_code"] == ia.INFERENCE_DISABLED and r["assessment_status"] == "UNAVAILABLE" and ia.load_state()["loaded"] is False


@pytest.mark.parametrize("value,expected", [("true", True), ("1", True), ("YES", True), ("on", True), ("false", False), ("", False), ("0", False), ("maybe", False)])
def test_enable_flag_parsing(monkeypatch, value, expected):
    monkeypatch.setenv("FIRE_EVIDENCE_INFERENCE_ENABLED", value)
    assert ia.inference_enabled() is expected


def test_all_error_codes_are_distinct_and_namespaced():
    assert len(set(ia.ALL_ERROR_CODES)) == len(ia.ALL_ERROR_CODES) and all(c.startswith("MODEL_") for c in ia.ALL_ERROR_CODES)


# ------------------------------------------------------------------------------------------- pre-flight (stdlib only)
def test_approved_fixture_passes_preflight(bundle):
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) is None


def test_missing_and_empty_artifact(tmp_path):
    assert ia.preflight_artifact(str(tmp_path / "nope"), FIXTURE_VERSION) == ia.NOT_FOUND
    (tmp_path / "empty").mkdir()
    assert ia.preflight_artifact(str(tmp_path / "empty"), FIXTURE_VERSION) == ia.NOT_FOUND


def test_malformed_json_and_wrong_shapes(bundle):
    f = bundle / "artifact.json"
    f.write_text("{not json"); assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.MALFORMED
    f.write_text("[]"); assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.MALFORMED


@pytest.mark.parametrize("fn", [lambda m: m.pop("calibration"), lambda m: m.pop("files"), lambda m: m.__setitem__("limitations", "x"),
                                lambda m: m.__setitem__("outputs", []), lambda m: m.__setitem__("schema_version", None)])
def test_missing_or_mistyped_metadata(bundle, fn):
    edit(bundle, fn)
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.MALFORMED


def test_unsupported_schema_version(bundle):
    edit(bundle, lambda m: m.__setitem__("schema_version", "fire-assessor-artifact/2"))
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.UNSUPPORTED_VERSION


def test_model_version_must_match_the_pin(bundle):
    assert ia.preflight_artifact(str(bundle), "fire-assessor-v1.0.0") == ia.VERSION_MISMATCH


@pytest.mark.parametrize("victim", ["weights.pt", "arrays.npz"])
def test_hash_mismatch_is_detected(bundle, victim):
    with open(bundle / victim, "ab") as f:
        f.write(b"0")
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.INTEGRITY_FAILED


def test_missing_declared_undeclared_and_inconsistent_checkpoint_hash(bundle, tmp_path):
    (bundle / "extra.bin").write_bytes(b"1")
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.INTEGRITY_FAILED
    (bundle / "extra.bin").unlink()
    edit(bundle, lambda m: m["checkpoint"].__setitem__("sha256", "0" * 64))
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.INTEGRITY_FAILED
    shutil.rmtree(bundle); shutil.copytree(FIXTURES / "approved", bundle)
    (bundle / "weights.pt").unlink()
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.INTEGRITY_FAILED


@pytest.mark.parametrize("fn", [lambda m: m["files"].__setitem__("../escape.bin", "0" * 64), lambda m: m["files"].__setitem__("weights.pt", "not-hex")])
def test_unsafe_files_entries_are_malformed(bundle, fn):
    edit(bundle, fn)
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.MALFORMED


@pytest.mark.parametrize("fn", [lambda m: m["outputs"].__setitem__("label_mapping", {"0": "smoke_visible", "1": "flames_visible"}),
                                lambda m: m["outputs"].__setitem__("names", ["smoke_visible", "flames_visible"]),
                                lambda m: m["outputs"].__setitem__("names", ["flames_visible"])])
def test_invalid_output_mapping(bundle, fn):
    edit(bundle, fn, reapprove=True)  # even a properly re-signed bundle is refused when the mapping is wrong
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.INVALID_OUTPUT_MAPPING


def test_incomplete_bundle_is_refused():
    assert ia.preflight_artifact(str(FIXTURES / "incomplete"), FIXTURE_VERSION) == ia.INCOMPLETE


@pytest.mark.parametrize("fn", [
    lambda m: m.__setitem__("thresholds", None), lambda m: m.__setitem__("temperatures", None), lambda m: m.__setitem__("uncertainty_margin", None),
    lambda m: m["calibration"].__setitem__("status", "NOT_PROVIDED"), lambda m: m["ood"].__setitem__("status", "NOT_PROVIDED"),
    lambda m: m["authenticity"].__setitem__("status", "NOT_PROVIDED"), lambda m: m["ood"].__setitem__("reason", ""),
    lambda m: m["calibration"]["policy"].__setitem__("alpha", None), lambda m: m["calibration"]["source"].__setitem__("partition", "test"),
    lambda m: m["calibration"]["source"].__setitem__("identity_status", "NOT_ESTABLISHED"), lambda m: m["provenance"].pop("source"),
    lambda m: m["temperatures"].__setitem__("flames", -1)])
def test_missing_calibration_ood_or_provenance_components_are_incomplete(bundle, fn):
    edit(bundle, fn, reapprove=True)  # re-signed on purpose: completeness is enforced independently of approval
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.INCOMPLETE


@pytest.mark.parametrize("fn", [
    lambda m: m["approval"].__setitem__("record", None), lambda m: m["approval"]["record"].__setitem__("approver", " "),
    lambda m: m["approval"]["record"].__setitem__("evidence", []), lambda m: m["approval"]["record"].__setitem__("artifact_binding_sha256", "0" * 64),
    lambda m: m["limitations"].append("edited after approval")])
def test_unapproved_or_modified_after_approval(bundle, fn):
    edit(bundle, fn)  # NOT re-signed: any change to the approved content voids the approval
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.NOT_APPROVED


def test_declared_approved_status_is_not_trusted(bundle):
    edit(bundle, lambda m: (m["approval"].__setitem__("record", None), m.__setitem__("artifact_status", "APPROVED"), m["approval"].__setitem__("status", "APPROVED")))
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) == ia.NOT_APPROVED


@needs_assessor
def test_binding_digest_matches_the_assessors_definition(bundle):
    sys.path.insert(0, str(ASSESSOR_REPO / "src"))
    from fire_assessor.artifact import binding_digest
    meta = json.loads((bundle / "artifact.json").read_text())
    assert ia.binding_digest(meta) == binding_digest(meta) == meta["approval"]["record"]["artifact_binding_sha256"]


# ------------------------------------------------------------------------------------------- real assessor loader + stub scorer
@needs_assessor
def test_approved_bundle_and_enabled_flag_runs_the_contract_end_to_end(monkeypatch, bundle):
    configure(monkeypatch, bundle); use_stub(flames=30.0, smoke=30.0)
    r = ia.assess_image(jpeg_bytes(), "img-1")
    assert r["assessment_status"] == "COMPLETED" and r["artifact_status"] == "APPROVED" and r["error_code"] is None
    assert r["derived_label"] in ia.DERIVED_LABELS and r["decision"] == "REQUIRES_REVIEW" and set(r["scores"]) == set(ia.OUTPUT_NAMES)
    assert 0.0 <= r["scores"]["flames_visible"] <= 1.0 and r["review_priority"] in ("HIGH", "STANDARD")
    assert not {"dispatch", "incident_status", "action"} & set(r)


@needs_assessor
def test_architecture_mismatch_between_declaration_and_weights(monkeypatch, bundle):
    edit(bundle, lambda m: m["architecture"]["lora"].__setitem__("rank", 4), reapprove=True)  # signed + complete, but weights are rank 2
    assert ia.preflight_artifact(str(bundle), FIXTURE_VERSION) is None  # the stdlib pre-flight cannot see tensors...
    configure(monkeypatch, bundle); use_stub()
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == ia.INCOMPATIBLE and r["scores"] is None  # ...the assessor's loader does


@needs_assessor
@pytest.mark.parametrize("fixture,code", [("incomplete", ia.INCOMPLETE)])
def test_incomplete_fixture_never_reaches_a_model(monkeypatch, tmp_path, fixture, code):
    d = tmp_path / fixture; shutil.copytree(FIXTURES / fixture, d)
    configure(monkeypatch, d); use_stub()
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["error_code"] == code and r["scores"] is None and ia.load_state()["loaded"] is False


@needs_assessor
def test_assessor_runtime_missing_is_explicit(monkeypatch, bundle, tmp_path):
    configure(monkeypatch, bundle, repo=tmp_path / "no-such-checkout")
    assert ia.assess_image(jpeg_bytes(), "i")["error_code"] == ia.RUNTIME_UNAVAILABLE


@needs_assessor
@pytest.mark.parametrize("exc,code", [(ImportError("no torch"), ia.RUNTIME_UNAVAILABLE), (RuntimeError("bad weights"), ia.LOAD_FAILED)])
def test_model_build_failures_are_explicit(monkeypatch, bundle, exc, code):
    configure(monkeypatch, bundle)
    def boom(path): raise exc
    ia._scorer_factory = boom
    assert ia.assess_image(jpeg_bytes(), "i")["error_code"] == code


@needs_assessor
def test_unreadable_image_is_unavailable_not_an_exception(monkeypatch, bundle):
    configure(monkeypatch, bundle); use_stub()
    r = ia.assess_image(b"not an image", "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["scores"] is None and r["decision"] == "REQUIRES_REVIEW"


@needs_assessor
def test_unexpected_exception_inside_inference_is_contained(monkeypatch, bundle):
    configure(monkeypatch, bundle); use_stub()
    ia._load_service()
    monkeypatch.setattr(ia._service, "assess_bytes", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("boom")))
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["error_code"] == ia.INFERENCE_FAILED and r["scores"] is None


# ------------------------------------------------------------------------------------------- never fabricate: sanitising
def good():
    return {"assessment_status": "COMPLETED", "model_version": "v", "scores": {"flames_visible": 0.9, "smoke_visible": 0.1}, "derived_label": "ACTIVE_FIRE",
            "decision": "REQUIRES_REVIEW", "review_priority": "HIGH", "quality_flags": [], "ood_flag": False,
            "authenticity": {"status": "INCONCLUSIVE", "signals": []}, "limitations": ["l"], "artifact_status": "APPROVED", "error_code": None}


def test_valid_result_is_admitted_and_unknown_fields_are_dropped():
    r = good(); r["dispatch_rangers"] = True; r["incident_status"] = "verified"
    out = ia.sanitize_assessment(r)
    assert out["assessment_status"] == "COMPLETED" and "dispatch_rangers" not in out and "incident_status" not in out


@pytest.mark.parametrize("mutate,code", [
    (lambda r: r.__setitem__("artifact_status", "NOT_APPROVED"), ia.NOT_APPROVED), (lambda r: r.__setitem__("artifact_status", None), ia.NOT_APPROVED),
    (lambda r: r["scores"].__setitem__("flames_visible", 1.5), ia.RESULT_INVALID), (lambda r: r["scores"].__setitem__("smoke_visible", -0.1), ia.RESULT_INVALID),
    (lambda r: r["scores"].__setitem__("smoke_visible", True), ia.RESULT_INVALID), (lambda r: r["scores"].__setitem__("extra", 0.5), ia.RESULT_INVALID),
    (lambda r: r["scores"].pop("smoke_visible"), ia.RESULT_INVALID), (lambda r: r.__setitem__("scores", None), ia.RESULT_INVALID),
    (lambda r: r.__setitem__("derived_label", "DEFINITELY_FIRE"), ia.RESULT_INVALID), (lambda r: r.__setitem__("decision", "DISPATCH"), ia.RESULT_INVALID),
    (lambda r: r.__setitem__("decision", "AUTO_VERIFY"), ia.RESULT_INVALID), (lambda r: r.__setitem__("review_priority", "CRITICAL"), ia.RESULT_INVALID),
    (lambda r: r["authenticity"].__setitem__("status", "VERIFIED_REAL"), ia.RESULT_INVALID), (lambda r: r.__setitem__("ood_flag", "no"), ia.RESULT_INVALID),
    (lambda r: r.__setitem__("authenticity", None), ia.RESULT_INVALID)])
def test_invalid_completed_results_become_unavailable_with_no_scores(mutate, code):
    r = good(); mutate(r)
    out = ia.sanitize_assessment(r)
    assert out["assessment_status"] == "UNAVAILABLE" and out["error_code"] == code and out["scores"] is None and out["derived_label"] is None


@pytest.mark.parametrize("junk", [None, "COMPLETED", [], 5])
def test_non_dict_results_are_unavailable(junk):
    assert ia.sanitize_assessment(junk)["error_code"] == ia.RESULT_INVALID


def test_scores_and_label_on_an_unavailable_result_are_stripped():
    r = good(); r["assessment_status"] = "UNAVAILABLE"; r["error_code"] = "DECODE_FAILED"
    out = ia.sanitize_assessment(r)
    assert out["scores"] is None and out["derived_label"] is None and out["error_code"] == "DECODE_FAILED" and out["authenticity"]["status"] == "INCONCLUSIVE"


def test_persistence_fields_never_store_authenticity_for_unavailable_results():
    un = ia.persistence_fields(ia.unavailable(ia.NOT_CONFIGURED))
    assert un["status"] == "UNAVAILABLE" and un["auth"] is None and un["error"] == ia.NOT_CONFIGURED and json.loads(un["assessment"])["scores"] is None
    ok = ia.persistence_fields(ia.sanitize_assessment(good()))
    assert ok["status"] == "COMPLETED" and ok["auth"] == "INCONCLUSIVE" and ok["error"] is None


def test_unavailable_payload_has_the_full_contract_shape():
    r = ia.unavailable(ia.TIMEOUT)
    assert {"assessment_status", "model_version", "error_code", "scores", "derived_label", "decision", "review_priority", "quality_flags", "ood_flag",
            "authenticity", "limitations"} <= set(r) and r["decision"] == "REQUIRES_REVIEW" and r["review_priority"] == "STANDARD"


# ------------------------------------------------------------------------------------------- request-path safety
def test_refusals_without_io_do_not_use_a_worker_thread(monkeypatch):
    monkeypatch.setattr(ia, "_get_pool", lambda: pytest.fail("no thread hop for a refusal that needs no I/O"))
    assert asyncio.run(ia.assess_image_async(b"x", "i"))["error_code"] == ia.NOT_CONFIGURED


@needs_assessor
def test_slow_inference_does_not_block_the_event_loop(monkeypatch, bundle):
    configure(monkeypatch, bundle); use_stub(delay=0.6)
    monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "10")

    async def scenario():
        ticks, stop = [], False

        async def ticker():
            while not stop:
                ticks.append(time.perf_counter()); await asyncio.sleep(0.02)
        t = asyncio.create_task(ticker())
        result = await ia.assess_image_async(jpeg_bytes(), "slow")
        stop = True; await t
        return result, ticks
    result, ticks = asyncio.run(scenario())
    gaps = [b - a for a, b in zip(ticks, ticks[1:])]
    assert result["assessment_status"] == "COMPLETED" and len(ticks) >= 15 and max(gaps) < 0.25, (len(ticks), max(gaps))


@needs_assessor
def test_timeout_and_busy_degrade_to_unavailable_then_recover(monkeypatch, bundle):
    configure(monkeypatch, bundle); use_stub(delay=0.8)
    monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "0.15"); monkeypatch.setenv("FIRE_EVIDENCE_MAX_PENDING", "1")

    async def scenario():
        first = await ia.assess_image_async(jpeg_bytes(), "a")           # worker still busy afterwards
        second = await ia.assess_image_async(jpeg_bytes(), "b")          # cap of 1 pending -> refused immediately
        await asyncio.sleep(1.4)                                         # let the slow job finish and release its slot
        monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "10")
        third = await ia.assess_image_async(jpeg_bytes(), "c")
        return first, second, third
    first, second, third = asyncio.run(scenario())
    assert first["error_code"] == ia.TIMEOUT and first["scores"] is None
    assert second["error_code"] == ia.BUSY and second["scores"] is None
    assert third["assessment_status"] == "COMPLETED"


@needs_assessor
def test_loading_and_hashing_happen_off_the_event_loop(monkeypatch, bundle):
    configure(monkeypatch, bundle); use_stub()
    seen = {}
    real = ia._build_service
    def spy():
        seen["thread"] = threading.current_thread().name
        return real()
    monkeypatch.setattr(ia, "_build_service", spy)
    r = asyncio.run(ia.assess_image_async(jpeg_bytes(), "i"))
    assert r["assessment_status"] == "COMPLETED" and seen["thread"].startswith("fire-evidence")


def test_adapter_module_cannot_reach_incident_or_dispatch_state():
    import ast
    tree = ast.parse(Path(ia.__file__).read_text())
    mods = [n.module or "" for n in ast.walk(tree) if isinstance(n, ast.ImportFrom)] + [a.name for n in ast.walk(tree) if isinstance(n, ast.Import) for a in n.names]
    assert not [m for m in mods if any(b in m.lower() for b in ("routers", "database", "sqlalchemy", "alert", "incident", "workflow", "dispatch", "requests", "httpx"))]


def test_worker_pool_failure_is_contained(monkeypatch, bundle):
    configure(monkeypatch, bundle)
    monkeypatch.setattr(ia, "_get_pool", lambda: (_ for _ in ()).throw(RuntimeError("pool broken")))
    r = asyncio.run(ia.assess_image_async(jpeg_bytes(), "i"))
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == ia.INFERENCE_FAILED and r["scores"] is None
