"""Development-only EXPERIMENTAL inference path of the fail-closed adapter. EXPERIMENTAL / NOT FOR OPERATIONAL USE.

Mocked vs real:
  * No database here (route-level tests with real PostgreSQL are in test_fire_evidence_routes.py).
  * The checkpoint files are TINY TOY files (tests/fixtures/fire_evidence/approved/weights.pt, zeros); the scorer is a STUB. Their SHA-256
    is substituted for the pinned production-audited hash only inside the test. The real adapter/assessor code, hash checks, provenance
    checks, architecture check, image validation and sanitising are exercised for real.
  * `test_real_checkpoint_*` run the REAL 345 MB checkpoint through the REAL TorchScorer on a synthetic image. They skip unless
    FIRE_EVIDENCE_REAL_CHECKPOINT points at the audited weights.pt (never committed, never copied into fixtures) and torch/open_clip import.
"""
import asyncio
import hashlib
import json
import math
import os
import shutil
import sys
import time
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services import image_assessment as ia  # noqa: E402
from tests.test_fire_evidence_adapter import (ASSESSOR_REPO, FIXTURES, jpeg_bytes, make_stub_scorer, needs_assessor)  # noqa: E402,F401

pytestmark = needs_assessor
PROVENANCE_FILE = (ASSESSOR_REPO / "docs/provenance/lora_s0_provenance.json") if ASSESSOR_REPO else None
ENV_NAMES = ("FIRE_EVIDENCE_REPO", "FIRE_EVIDENCE_ARTIFACT_DIR", "FIRE_EVIDENCE_MODEL_VERSION", "FIRE_EVIDENCE_INFERENCE_ENABLED",
             "FIRE_EVIDENCE_TIMEOUT_S", "FIRE_EVIDENCE_MAX_PENDING", "FIRE_EVIDENCE_EXPERIMENTAL_ENABLED", "FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT",
             "FIRE_EVIDENCE_EXPERIMENTAL_PROVENANCE", "TERRAWATCH_ENV")


@pytest.fixture(autouse=True)
def clean(monkeypatch):
    for n in ENV_NAMES:
        monkeypatch.delenv(n, raising=False)
    ia.reset_for_tests()
    yield
    ia.reset_for_tests()


def toy_spec():
    sys.path.insert(0, str(ASSESSOR_REPO / "src"))
    from fire_assessor.checkpoint import ArchitectureSpec
    return ArchitectureSpec.from_dict(json.loads((FIXTURES / "approved" / "artifact.json").read_text())["architecture"])


def write_provenance(path: Path, weights: Path, **over):
    sha = hashlib.sha256(weights.read_bytes()).hexdigest()
    rec = {"record_version": 1, "subject": "TOY FIXTURE for tests", "checkpoint": {"sha256": sha, "size_bytes": weights.stat().st_size}}
    rec.update(over)
    path.write_text(json.dumps(rec))
    return sha


def setup_dev(monkeypatch, tmp_path, *, pin=True, toy=True, env="development", **prov_over):
    """A toy 'experimental checkpoint' + provenance in tmp_path, configured as a local development run."""
    weights, prov = tmp_path / "weights.pt", tmp_path / "provenance.json"
    shutil.copy(FIXTURES / "approved" / "weights.pt", weights)
    sha = write_provenance(prov, weights, **prov_over)
    monkeypatch.setenv("FIRE_EVIDENCE_REPO", str(ASSESSOR_REPO))
    monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_ENABLED", "true")
    monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT", str(weights))
    monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_PROVENANCE", str(prov))
    if env is not None:
        monkeypatch.setenv("TERRAWATCH_ENV", env)
    ia.reset_for_tests()
    if pin:
        ia.EXPERIMENTAL_ALLOWED_SHA256 = sha
    if toy:
        ia._experimental_spec = toy_spec()
    ia._scorer_factory = lambda weights_path: make_stub_scorer(flames=2.5, smoke=-1.25)
    return weights, prov, sha


def reload_service():
    """Drop only the cached experimental service (keeps the test's pin, spec and stub) so the next call re-verifies the files on disk."""
    with ia._lock:
        ia._exp_service, ia._exp_error = None, None


def assert_never_operational(r):
    assert r["assessment_status"] in ("EXPERIMENTAL", "UNAVAILABLE")
    assert r.get("artifact_status") in (None, "EXPERIMENTAL_UNAPPROVED")
    assert r["decision"] == "REQUIRES_REVIEW" and r["derived_label"] is None
    assert "APPROVED" not in json.dumps(r).replace("EXPERIMENTAL_UNAPPROVED", "") and "COMPLETED" not in json.dumps(r)


# ------------------------------------------------------------------------------------------- gating: off by default, never in production
def test_default_configuration_has_no_experimental_path_and_production_stays_disabled():
    assert ia.experimental_requested() is False and ia.inference_enabled() is False
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == ia.NOT_CONFIGURED


@pytest.mark.parametrize("env", [None, "", "production", "prod", "staging", "Production "])
def test_experimental_is_refused_unless_the_environment_is_explicitly_development(monkeypatch, tmp_path, env):
    setup_dev(monkeypatch, tmp_path, env=None)
    if env is not None:
        monkeypatch.setenv("TERRAWATCH_ENV", env)
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == ia.EXPERIMENTAL_NOT_PERMITTED
    assert r["scores"] is None and "raw_logits" not in r


@pytest.mark.parametrize("env", ["development", "dev", "local", "test", "Development"])
def test_explicit_development_environments_are_permitted(monkeypatch, tmp_path, env):
    setup_dev(monkeypatch, tmp_path, env=env)
    assert ia.assess_image(jpeg_bytes(), "i")["assessment_status"] == "EXPERIMENTAL"


def test_experimental_flag_must_be_a_true_value(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_ENABLED", "false")
    assert ia.assess_image(jpeg_bytes(), "i")["error_code"] == ia.NOT_CONFIGURED   # falls through to the (unconfigured, disabled) production path


def test_experimental_and_production_flags_never_mix(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    monkeypatch.setenv("FIRE_EVIDENCE_INFERENCE_ENABLED", "true")
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == ia.EXPERIMENTAL_CONFLICT


@pytest.mark.parametrize("missing", ["FIRE_EVIDENCE_REPO", "FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT", "FIRE_EVIDENCE_EXPERIMENTAL_PROVENANCE"])
def test_unconfigured_experimental_path_is_explicit(monkeypatch, tmp_path, missing):
    setup_dev(monkeypatch, tmp_path)
    monkeypatch.delenv(missing)
    assert ia.assess_image(jpeg_bytes(), "i")["error_code"] == ia.EXPERIMENTAL_NOT_CONFIGURED


# ------------------------------------------------------------------------------------------- the happy path, labelled
def test_valid_image_reaches_the_scorer_and_returns_labelled_finite_raw_logits(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    r = ia.assess_image(jpeg_bytes(), "img-1")
    assert r["assessment_status"] == "EXPERIMENTAL" and r["experimental"] is True
    assert r["notice"] == "EXPERIMENTAL / NOT FOR OPERATIONAL USE"
    assert r["raw_logits"] == {"flames_visible": 2.5, "smoke_visible": -1.25}
    assert r["scores_calibrated"] is False and r["scores"] is None and r["ood_flag"] is None
    assert r["authenticity"]["status"] == "NOT_ASSESSED" and r["quality_flags"] == []
    assert r["checkpoint_sha256"] == ia.EXPERIMENTAL_ALLOWED_SHA256
    assert_never_operational(r)
    assert any("NOT FOR OPERATIONAL USE" in x for x in r["limitations"])


def test_persistence_fields_record_experimental_without_authenticity_or_completion(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    f = ia.persistence_fields(ia.assess_image(jpeg_bytes(), "i"))
    assert f["status"] == "EXPERIMENTAL" and f["auth"] is None and f["error"] is None
    assert json.loads(f["assessment"])["raw_logits"]["flames_visible"] == 2.5


def test_the_worker_pool_is_reused_and_the_model_loads_once(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    built = []
    stub = make_stub_scorer()
    ia._scorer_factory = lambda p: built.append(p) or stub
    for _ in range(3):
        assert ia.assess_image(jpeg_bytes(), "i")["assessment_status"] == "EXPERIMENTAL"
    assert len(built) == 1 and stub.calls == 3


# ------------------------------------------------------------------------------------------- invalid images
@pytest.mark.parametrize("data,code", [(b"", "EMPTY_FILE"), (b"hello, not an image", "UNSUPPORTED_TYPE"), (b"\xff\xd8\xff\xe0 truncated", "DECODE_FAILED"),
                                       (jpeg_bytes()[:200], "DECODE_FAILED"), (b"MZ\x90\x00 executable bytes", "UNSUPPORTED_TYPE")])
def test_invalid_images_are_rejected_safely_without_scores_or_a_scorer_call(monkeypatch, tmp_path, data, code):
    setup_dev(monkeypatch, tmp_path)
    stub = make_stub_scorer()
    ia._scorer_factory = lambda p: stub
    r = ia.assess_image(data, "bad")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == code and r["scores"] is None and "raw_logits" not in r
    assert stub.calls == 0 and ia.persistence_fields(r)["status"] == "UNAVAILABLE"


def test_a_tiny_but_valid_image_is_rejected_by_the_assessor_limits(monkeypatch, tmp_path):
    import io
    from PIL import Image
    setup_dev(monkeypatch, tmp_path)
    b = io.BytesIO(); Image.new("RGB", (8, 8)).save(b, "JPEG")
    r = ia.assess_image(b.getvalue(), "tiny")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == "IMAGE_TOO_SMALL"


# ------------------------------------------------------------------------------------------- missing / tampered checkpoint
def test_missing_weights_are_explicitly_unavailable(monkeypatch, tmp_path):
    weights, _, _ = setup_dev(monkeypatch, tmp_path)
    weights.unlink(); reload_service()
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == "MODEL_EXPERIMENTAL_NOT_FOUND" and r["scores"] is None


def test_missing_or_unreadable_provenance_is_refused(monkeypatch, tmp_path):
    _, prov, _ = setup_dev(monkeypatch, tmp_path)
    prov.write_text("{not json"); reload_service()
    assert ia.assess_image(jpeg_bytes(), "i")["error_code"] == "MODEL_EXPERIMENTAL_PROVENANCE_INVALID"
    prov.unlink(); reload_service()
    assert ia.assess_image(jpeg_bytes(), "i")["error_code"] == "MODEL_EXPERIMENTAL_PROVENANCE_INVALID"


def test_hash_mismatch_is_rejected(monkeypatch, tmp_path):
    weights, _, _ = setup_dev(monkeypatch, tmp_path)
    raw = bytearray(weights.read_bytes()); raw[len(raw) // 2] ^= 0xFF; weights.write_bytes(bytes(raw))   # same size, one corrupted byte
    reload_service()
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == "MODEL_EXPERIMENTAL_INTEGRITY_FAILED"


def test_size_mismatch_is_rejected(monkeypatch, tmp_path):
    weights, _, _ = setup_dev(monkeypatch, tmp_path)
    weights.write_bytes(weights.read_bytes() + b"\0"); reload_service()
    assert ia.assess_image(jpeg_bytes(), "i")["error_code"] == "MODEL_EXPERIMENTAL_INTEGRITY_FAILED"


def test_only_the_pinned_checkpoint_is_accepted_even_with_self_consistent_provenance(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path, pin=False)   # file + provenance agree with each other, but are not the audited, pinned checkpoint
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == "MODEL_EXPERIMENTAL_PROVENANCE_INVALID"


@pytest.mark.parametrize("extra", [{"approval": {"approver": "x"}}, {"approved": True}, {"artifact_status": "APPROVED"}, {"artifact_binding_sha256": "0" * 64}])
def test_provenance_that_claims_approval_is_rejected(monkeypatch, tmp_path, extra):
    setup_dev(monkeypatch, tmp_path, **extra)
    assert ia.assess_image(jpeg_bytes(), "i")["error_code"] == "MODEL_EXPERIMENTAL_PROVENANCE_INVALID"


def test_provenance_naming_a_different_hash_or_version_is_rejected(monkeypatch, tmp_path):
    _, prov, _ = setup_dev(monkeypatch, tmp_path)
    rec = json.loads(prov.read_text()); good = rec["checkpoint"]["sha256"]
    rec["checkpoint"]["sha256"] = "0" * 64; prov.write_text(json.dumps(rec)); reload_service()
    assert ia.assess_image(jpeg_bytes(), "i")["error_code"] == "MODEL_EXPERIMENTAL_PROVENANCE_INVALID"
    rec["checkpoint"]["sha256"] = good; rec["record_version"] = 99; prov.write_text(json.dumps(rec)); reload_service()
    assert ia.assess_image(jpeg_bytes(), "i")["error_code"] == "MODEL_EXPERIMENTAL_PROVENANCE_INVALID"


def test_architecture_mismatch_is_rejected(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path, toy=False)   # toy-shaped tensors checked against the real ViT-B/16 + LoRA r8 spec
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == "MODEL_EXPERIMENTAL_INCOMPATIBLE"


def test_a_non_checkpoint_file_with_matching_hash_is_rejected_as_incompatible(monkeypatch, tmp_path):
    weights, prov, _ = setup_dev(monkeypatch, tmp_path)
    weights.write_bytes(b"this is not a torch zip checkpoint" * 20)
    ia.EXPERIMENTAL_ALLOWED_SHA256 = write_provenance(prov, weights)   # hash and size now genuinely match the garbage
    reload_service()
    assert ia.assess_image(jpeg_bytes(), "i")["error_code"] == "MODEL_EXPERIMENTAL_INCOMPATIBLE"


def test_missing_runtime_is_reported_not_raised(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    ia._scorer_factory = None
    monkeypatch.setitem(sys.modules, "torch", None)       # import torch -> ImportError
    monkeypatch.setitem(sys.modules, "fire_assessor.model", None)
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == "MODEL_EXPERIMENTAL_LOAD_FAILED"


def test_a_failing_model_load_is_contained(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    def boom(_):
        raise RuntimeError("cuda exploded /secret/path")
    ia._scorer_factory = boom
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["error_code"] == "MODEL_EXPERIMENTAL_LOAD_FAILED" and "secret" not in json.dumps(r)


# ------------------------------------------------------------------------------------------- bad model output never becomes a result
@pytest.mark.parametrize("flames,smoke", [(float("nan"), 0.0), (0.0, float("inf")), (-float("inf"), 1.0), (1e9, 0.0), (0.0, -5000.0)])
def test_non_finite_or_absurd_logits_are_rejected(monkeypatch, tmp_path, flames, smoke):
    setup_dev(monkeypatch, tmp_path)
    ia._scorer_factory = lambda p: make_stub_scorer(flames=flames, smoke=smoke)
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == "MODEL_EXPERIMENTAL_INFERENCE_FAILED" and "raw_logits" not in r


def test_a_scorer_exception_is_contained(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    class Bad:
        def score(self, image):
            raise ValueError("boom /home/secret")
    ia._scorer_factory = lambda p: Bad()
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["error_code"] == "MODEL_EXPERIMENTAL_INFERENCE_FAILED" and "secret" not in json.dumps(r)


def good_experimental(**over):
    r = {"assessment_status": "EXPERIMENTAL", "artifact_status": "EXPERIMENTAL_UNAPPROVED", "checkpoint_sha256": ia.EXPERIMENTAL_ALLOWED_SHA256,
         "raw_logits": {"flames_visible": 1.0, "smoke_visible": -1.0}, "model_version": "experimental:lora_s0@sha256:7bd5498f0484"}
    r.update(over)
    return r


@pytest.mark.parametrize("over", [
    {"assessment_status": "COMPLETED"}, {"artifact_status": "APPROVED"}, {"checkpoint_sha256": "0" * 64},
    {"raw_logits": {"flames_visible": 1.0}}, {"raw_logits": {"flames_visible": 1.0, "smoke_visible": "x"}}, {"raw_logits": {"flames_visible": True, "smoke_visible": 1}},
    {"raw_logits": {"flames_visible": float("nan"), "smoke_visible": 0.0}}, {"raw_logits": {"flames_visible": 1, "smoke_visible": 1, "extra": 1}}, {"raw_logits": None}])
def test_sanitize_experimental_rejects_anything_outside_the_experimental_contract(over):
    r = ia.sanitize_experimental(good_experimental(**over))
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == ia.RESULT_INVALID and r["scores"] is None


def test_sanitize_experimental_drops_forged_extra_fields():
    r = ia.sanitize_experimental(good_experimental(derived_label="ACTIVE_FIRE", scores={"flames_visible": 0.99, "smoke_visible": 0.9}, decision="DISPATCH",
                                                   incident_status="verified", review_priority="HIGH", ood_flag=False))
    assert r["assessment_status"] == "EXPERIMENTAL" and r["derived_label"] is None and r["scores"] is None and r["decision"] == "REQUIRES_REVIEW"
    assert "incident_status" not in r and r["review_priority"] == "STANDARD" and r["ood_flag"] is None
    assert_never_operational(r)


def test_the_production_sanitiser_never_admits_an_experimental_result():
    r = ia.sanitize_assessment(good_experimental())
    assert r["assessment_status"] == "UNAVAILABLE" and r["scores"] is None and r["derived_label"] is None
    forged = good_experimental(assessment_status="COMPLETED", artifact_status="EXPERIMENTAL_UNAPPROVED", scores={"flames_visible": .9, "smoke_visible": .9})
    assert ia.sanitize_assessment(forged)["error_code"] == ia.NOT_APPROVED


def test_experimental_status_cannot_be_forged_through_error_codes():
    bad = {"assessment_status": "UNAVAILABLE", "error_code": "lowercase <script>"}
    assert ia.sanitize_experimental(bad)["error_code"] == ia.INFERENCE_FAILED


# ------------------------------------------------------------------------------------------- bounded, non-blocking
def test_timeout_degrades_to_unavailable_and_the_worker_recovers(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "0.2")
    ia._scorer_factory = lambda p: make_stub_scorer(delay=0.8)
    async def run():
        first = await ia.assess_image_async(jpeg_bytes(), "slow")
        await asyncio.sleep(1.2)                       # let the abandoned inference finish and release its slot
        monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "5")
        return first, await ia.assess_image_async(jpeg_bytes(), "after")
    first, after = asyncio.run(run())
    assert first["assessment_status"] == "UNAVAILABLE" and first["error_code"] == ia.TIMEOUT
    assert after["assessment_status"] == "EXPERIMENTAL"


def test_saturation_fails_fast_with_busy(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path)
    monkeypatch.setenv("FIRE_EVIDENCE_MAX_PENDING", "1"); monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "5")
    ia._scorer_factory = lambda p: make_stub_scorer(delay=0.8)
    async def run():
        slow = asyncio.create_task(ia.assess_image_async(jpeg_bytes(), "a"))
        await asyncio.sleep(0.3)
        t0 = time.perf_counter(); busy = await ia.assess_image_async(jpeg_bytes(), "b"); dt = time.perf_counter() - t0
        return busy, dt, await slow
    busy, dt, slow = asyncio.run(run())
    assert busy["error_code"] == ia.BUSY and dt < 0.3 and slow["assessment_status"] == "EXPERIMENTAL"


def test_gating_refusals_do_not_use_a_worker_thread(monkeypatch, tmp_path):
    setup_dev(monkeypatch, tmp_path, env="production")
    r = asyncio.run(ia.assess_image_async(jpeg_bytes(), "i"))
    assert r["error_code"] == ia.EXPERIMENTAL_NOT_PERMITTED and ia._executor is None


# ------------------------------------------------------------------------------------------- the production contract is unchanged
def test_production_loader_still_refuses_the_incomplete_bundle_while_experimental_is_available(monkeypatch, tmp_path):
    monkeypatch.setenv("FIRE_EVIDENCE_REPO", str(ASSESSOR_REPO)); monkeypatch.setenv("FIRE_EVIDENCE_ARTIFACT_DIR", str(FIXTURES / "incomplete"))
    monkeypatch.setenv("FIRE_EVIDENCE_MODEL_VERSION", "fire-assessor-fixture-0"); monkeypatch.setenv("FIRE_EVIDENCE_INFERENCE_ENABLED", "true")
    ia.reset_for_tests()
    r = ia.assess_image(jpeg_bytes(), "i")
    assert r["assessment_status"] == "UNAVAILABLE" and r["error_code"] == ia.INCOMPLETE


def test_error_code_registry_stays_consistent():
    codes = ia.ALL_EXPERIMENTAL_ERROR_CODES
    assert len(set(codes)) == len(codes) and all(c.startswith("MODEL_EXPERIMENTAL_") for c in codes)
    assert not set(codes) & set(ia.ALL_ERROR_CODES)


# ------------------------------------------------------------------------------------------- the REAL checkpoint
REAL = os.getenv("FIRE_EVIDENCE_REAL_CHECKPOINT", "")
needs_real = pytest.mark.skipif(not REAL or not Path(REAL).is_file() or PROVENANCE_FILE is None or not PROVENANCE_FILE.is_file(),
                                reason="set FIRE_EVIDENCE_REAL_CHECKPOINT to the audited weights.pt (not committed; ~345 MB)")


def _real_image() -> bytes:
    import io
    import numpy as np
    from PIL import Image, ImageDraw, ImageFilter
    rng = np.random.default_rng(0)
    im = Image.new("RGB", (640, 480), (20, 10, 10)); d = ImageDraw.Draw(im)
    for _ in range(40):
        x = 320 + int(rng.normal(0, 60)); h = int(rng.integers(60, 260))
        d.ellipse([x - 25, 480 - h, x + 25, 480], fill=(255, int(rng.integers(80, 200)), 10))
    b = io.BytesIO(); im.filter(ImageFilter.GaussianBlur(3)).save(b, "JPEG", quality=90)
    return b.getvalue()


@needs_real
def test_real_checkpoint_runs_the_real_model_and_returns_finite_labelled_logits(monkeypatch):
    pytest.importorskip("torch"); pytest.importorskip("open_clip")
    monkeypatch.setenv("FIRE_EVIDENCE_REPO", str(ASSESSOR_REPO)); monkeypatch.setenv("TERRAWATCH_ENV", "development")
    monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_ENABLED", "true"); monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT", REAL)
    monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_PROVENANCE", str(PROVENANCE_FILE)); monkeypatch.setenv("FIRE_EVIDENCE_TIMEOUT_S", "120")
    ia.reset_for_tests()
    assert ia.EXPERIMENTAL_ALLOWED_SHA256 == "7bd5498f04838fe19240da2b7339d794cc5fc3948074a0d826c33303d5c42dfa"
    r = asyncio.run(ia.assess_image_async(_real_image(), "real-smoke"))
    assert r["assessment_status"] == "EXPERIMENTAL", r
    assert all(math.isfinite(v) for v in r["raw_logits"].values()) and set(r["raw_logits"]) == {"flames_visible", "smoke_visible"}
    assert r["notice"] == "EXPERIMENTAL / NOT FOR OPERATIONAL USE" and r["checkpoint_sha256"] == ia.EXPERIMENTAL_ALLOWED_SHA256
    assert_never_operational(r)
    again = asyncio.run(ia.assess_image_async(_real_image(), "real-smoke"))
    assert again["raw_logits"] == r["raw_logits"]      # deterministic on CPU


@needs_real
def test_real_checkpoint_is_refused_in_a_production_environment(monkeypatch):
    monkeypatch.setenv("FIRE_EVIDENCE_REPO", str(ASSESSOR_REPO)); monkeypatch.setenv("TERRAWATCH_ENV", "production")
    monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_ENABLED", "true"); monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT", REAL)
    monkeypatch.setenv("FIRE_EVIDENCE_EXPERIMENTAL_PROVENANCE", str(PROVENANCE_FILE))
    ia.reset_for_tests()
    assert ia.assess_image(_real_image(), "x")["error_code"] == ia.EXPERIMENTAL_NOT_PERMITTED


@needs_real
def test_real_checkpoint_architecture_and_hash_verify_without_torch_execution():
    sys.path.insert(0, str(ASSESSOR_REPO / "src"))
    from fire_assessor import experimental as ex
    rec = ex.verify_experimental_checkpoint(REAL, PROVENANCE_FILE, ia.EXPERIMENTAL_ALLOWED_SHA256)
    assert rec["checkpoint"]["sha256"] == ia.EXPERIMENTAL_ALLOWED_SHA256
