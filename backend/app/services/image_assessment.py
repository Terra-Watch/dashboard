"""Fail-closed adapter for the separately maintained Fire Evidence Assessor.

Contract (see docs/fire_evidence_artifact_contract.md and docs/fire_evidence_integration.md):

* Inference runs ONLY when ALL of the following hold, checked in this order, each failure being an explicit UNAVAILABLE result
  with its own stable error code:
    1. FIRE_EVIDENCE_REPO and FIRE_EVIDENCE_ARTIFACT_DIR are configured          MODEL_ARTIFACT_NOT_CONFIGURED
    2. FIRE_EVIDENCE_INFERENCE_ENABLED is explicitly true (default: off)         MODEL_INFERENCE_DISABLED
    3. a stdlib-only pre-flight of the artifact bundle passes (schema, version pin, SHA-256 of every file, checkpoint hash,
       output mapping, completeness, human approval bound to the content digest)  MODEL_ARTIFACT_* codes below
    4. the assessor package imports and its own loader accepts the bundle
       (re-verifies hashes, tensor/architecture compatibility, approval)          MODEL_RUNTIME_UNAVAILABLE / _INCOMPATIBLE / ...
    5. the model builds                                                           MODEL_LOAD_FAILED
* Nothing is ever fabricated: a non-COMPLETED result carries no scores and no label, and a COMPLETED result must come from an
  APPROVED artifact and satisfy the output contract, otherwise it is replaced by UNAVAILABLE (MODEL_RESULT_INVALID / _NOT_APPROVED).
* Model output is advisory data. This module has no access to incident status, assignments or dispatch, and the only decision it can
  express is REQUIRES_REVIEW. Human review is recorded elsewhere (resq_incident_images.human_review_*).
* Request path: `assess_image_async` never runs inference or hashes weights on the event loop; it uses one bounded worker, a hard
  timeout and a pending cap, and degrades to UNAVAILABLE (MODEL_TIMEOUT / MODEL_BUSY) instead of blocking or queuing without bound.
"""
from __future__ import annotations

import asyncio
import hashlib
import importlib
import json
import logging
import os
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

EXPECTED_MODEL_VERSION = "fire-assessor-v1.0.0"
SUPPORTED_SCHEMA = "fire-assessor-artifact/1"
OUTPUT_NAMES = ["flames_visible", "smoke_visible"]
LABEL_MAPPING = {"0": "flames_visible", "1": "smoke_visible"}
DERIVED_LABELS = {"ACTIVE_FIRE", "SMOKE_ONLY", "NO_VISIBLE_FIRE", "UNCERTAIN"}
AUTH_STATUSES = {"NO_CONCERNS_FOUND", "POSSIBLE_SYNTHETIC", "POSSIBLE_EDITED", "REUSED", "INCONSISTENT", "INCONCLUSIVE"}

NOT_CONFIGURED = "MODEL_ARTIFACT_NOT_CONFIGURED"
INFERENCE_DISABLED = "MODEL_INFERENCE_DISABLED"
NOT_FOUND = "MODEL_ARTIFACT_NOT_FOUND"
MALFORMED = "MODEL_ARTIFACT_MALFORMED"
UNSUPPORTED_VERSION = "MODEL_ARTIFACT_UNSUPPORTED_VERSION"
VERSION_MISMATCH = "MODEL_ARTIFACT_VERSION_MISMATCH"
INTEGRITY_FAILED = "MODEL_ARTIFACT_INTEGRITY_FAILED"
INVALID_OUTPUT_MAPPING = "MODEL_ARTIFACT_INVALID_OUTPUT_MAPPING"
INCOMPLETE = "MODEL_ARTIFACT_INCOMPLETE"
NOT_APPROVED = "MODEL_ARTIFACT_NOT_APPROVED"
INCOMPATIBLE = "MODEL_ARTIFACT_INCOMPATIBLE"
RUNTIME_UNAVAILABLE = "MODEL_RUNTIME_UNAVAILABLE"
LOAD_FAILED = "MODEL_LOAD_FAILED"
TIMEOUT = "MODEL_TIMEOUT"
BUSY = "MODEL_BUSY"
INFERENCE_FAILED = "MODEL_INFERENCE_FAILED"
RESULT_INVALID = "MODEL_RESULT_INVALID"
ALL_ERROR_CODES = (NOT_CONFIGURED, INFERENCE_DISABLED, NOT_FOUND, MALFORMED, UNSUPPORTED_VERSION, VERSION_MISMATCH, INTEGRITY_FAILED,
                   INVALID_OUTPUT_MAPPING, INCOMPLETE, NOT_APPROVED, INCOMPATIBLE, RUNTIME_UNAVAILABLE, LOAD_FAILED, TIMEOUT, BUSY,
                   INFERENCE_FAILED, RESULT_INVALID)

LIMITATIONS = [
    "No verified Fire Evidence Assessor artifact is available for this assessment.",
    "Image assessment is advisory and does not verify a fire, location, time, or incident status.",
]
_HEX64 = re.compile(r"^[0-9a-f]{64}$")
_COMPONENT_OK = {"calibration": {"PROVIDED"}, "ood": {"PROVIDED", "DISABLED_BY_POLICY"}, "authenticity": {"PROVIDED", "EXCLUDED_BY_POLICY"}}
_NAME_TO_CODE = {  # assessor exception class name -> code (matched along the exception's MRO)
    "ArtifactNotApprovedError": NOT_APPROVED, "ArtifactIncompleteError": INCOMPLETE, "ArtifactIncompatibleError": INCOMPATIBLE,
    "ArtifactFormatError": MALFORMED, "ArtifactIntegrityError": INTEGRITY_FAILED,
}

_lock = threading.Lock()
_service: Any | None = None
_load_error: str | None = None
_executor: ThreadPoolExecutor | None = None
_pending: threading.BoundedSemaphore | None = None
_scorer_factory: Optional[Callable[[str], Any]] = None  # tests only; production uses the assessor's TorchScorer


# ----------------------------------------------------------------------------------------------------------------------------
# configuration (read on every call so a flag flip or test patch takes effect without reimporting)
# ----------------------------------------------------------------------------------------------------------------------------
def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def inference_enabled() -> bool:
    return _env("FIRE_EVIDENCE_INFERENCE_ENABLED").lower() in ("1", "true", "yes", "on")


def _float_env(name: str, default: float, lo: float, hi: float) -> float:
    try:
        return min(hi, max(lo, float(_env(name, str(default)))))
    except ValueError:
        return default


def configuration_error() -> Optional[str]:
    """Cheap, I/O-free checks. A non-None result means UNAVAILABLE without touching the filesystem or a worker thread."""
    if not _env("FIRE_EVIDENCE_REPO") or not _env("FIRE_EVIDENCE_ARTIFACT_DIR"):
        return NOT_CONFIGURED
    if not inference_enabled():
        return INFERENCE_DISABLED
    return None


# ----------------------------------------------------------------------------------------------------------------------------
# structured results
# ----------------------------------------------------------------------------------------------------------------------------
def unavailable(code: str, model_version: str = "unconfigured") -> dict[str, Any]:
    """The only result a refused or failed assessment may take: explicit state, no scores, no label, human review required."""
    return {
        "assessment_status": "UNAVAILABLE", "model_version": model_version, "error_code": code, "scores": None, "derived_label": None,
        "decision": "REQUIRES_REVIEW", "review_priority": "STANDARD", "quality_flags": [], "ood_flag": False,
        "authenticity": {"status": "INCONCLUSIVE", "signals": []}, "limitations": list(LIMITATIONS), "artifact_status": None,
    }


def sanitize_assessment(result: Any, model_version: str = "unconfigured") -> dict[str, Any]:
    """Admit a model result only if it satisfies the output contract and comes from an APPROVED artifact; else UNAVAILABLE."""
    if not isinstance(result, dict):
        return unavailable(RESULT_INVALID, model_version)
    version = str(result.get("model_version") or model_version)
    if result.get("assessment_status") != "COMPLETED":
        code = result.get("error_code")
        return unavailable(code if isinstance(code, str) and code else INFERENCE_FAILED, version)
    if result.get("artifact_status") != "APPROVED":
        return unavailable(NOT_APPROVED, version)
    scores, auth = result.get("scores"), result.get("authenticity")
    try:
        ok = (
            isinstance(scores, dict) and set(scores) == set(OUTPUT_NAMES)
            and all(isinstance(scores[k], (int, float)) and not isinstance(scores[k], bool) and 0.0 <= float(scores[k]) <= 1.0 for k in OUTPUT_NAMES)
            and result.get("derived_label") in DERIVED_LABELS and result.get("decision") == "REQUIRES_REVIEW"
            and result.get("review_priority") in ("HIGH", "STANDARD") and isinstance(auth, dict) and auth.get("status") in AUTH_STATUSES
            and isinstance(result.get("quality_flags"), list) and isinstance(result.get("ood_flag"), bool)
        )
    except (TypeError, ValueError):
        ok = False
    if not ok:
        return unavailable(RESULT_INVALID, version)
    return {  # whitelist: nothing the model returns outside the contract is stored or shown
        "assessment_status": "COMPLETED", "model_version": version, "error_code": None,
        "scores": {k: float(scores[k]) for k in OUTPUT_NAMES}, "derived_label": result["derived_label"], "decision": "REQUIRES_REVIEW",
        "review_priority": result["review_priority"], "quality_flags": [str(f) for f in result["quality_flags"]], "ood_flag": result["ood_flag"],
        "authenticity": {"status": auth["status"], "signals": [str(s) for s in (auth.get("signals") or [])]},
        "limitations": [str(x) for x in (result.get("limitations") or [])], "artifact_status": "APPROVED",
    }


def persistence_fields(assessment: dict[str, Any]) -> dict[str, Any]:
    """Columns for resq_incident_images. Authenticity is persisted only for a COMPLETED assessment, never for an unavailable one."""
    completed = assessment.get("assessment_status") == "COMPLETED"
    return {
        "status": "COMPLETED" if completed else "UNAVAILABLE", "version": assessment.get("model_version"),
        "auth": (assessment.get("authenticity") or {}).get("status") if completed else None,
        "assessment": json.dumps(assessment), "error": assessment.get("error_code"),
    }


# ----------------------------------------------------------------------------------------------------------------------------
# artifact pre-flight (standard library only: runs even when the assessor package or torch cannot be imported)
# ----------------------------------------------------------------------------------------------------------------------------
def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def binding_digest(meta: dict) -> str:
    """Same digest the assessor defines: canonical JSON of artifact.json without `approval` and `artifact_status`."""
    body = {k: v for k, v in meta.items() if k not in ("approval", "artifact_status")}
    return hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()).hexdigest()


def _num(v: Any) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _completeness_error(meta: dict) -> bool:
    """True if a required component or calibration field is missing (mirrors the assessor contract; the assessor re-checks)."""
    comp = {"calibration": meta["calibration"].get("status"), "ood": meta["ood"].get("status"), "authenticity": meta["authenticity"].get("status")}
    if any(comp[k] not in ok for k, ok in _COMPONENT_OK.items()):
        return True
    th, temps = meta.get("thresholds"), meta.get("temperatures")
    if not (isinstance(th, dict) and _num(th.get("flames")) and _num(th.get("smoke"))):
        return True
    if not (isinstance(temps, dict) and all(_num(temps.get(k)) and temps[k] > 0 for k in ("flames", "smoke"))) or not _num(meta.get("uncertainty_margin")):
        return True
    cal = meta["calibration"]
    pol, src = cal.get("policy") or {}, cal.get("source") or {}
    if not (_num(pol.get("alpha")) and _num(pol.get("delta"))) or src.get("partition") != "cal" or not src.get("export_sha256"):
        return True
    if src.get("identity_status") not in ("PATH_PRESERVED", "CONTENT_VERIFIED"):
        return True
    if comp["ood"] == "PROVIDED" and not _num(meta["ood"].get("cutoff")):
        return True
    if comp["ood"] == "DISABLED_BY_POLICY" and not meta["ood"].get("reason"):
        return True
    if comp["authenticity"] == "EXCLUDED_BY_POLICY" and not meta["authenticity"].get("reason"):
        return True
    return not meta["provenance"].get("source") or not meta["provenance"].get("initialization") or not meta["provenance"].get("training_manifest")


def preflight_artifact(artifact_dir: str, expected_version: str = EXPECTED_MODEL_VERSION) -> Optional[str]:
    """Return None if the bundle passes every check that needs no model runtime, else the specific error code."""
    d = Path(artifact_dir)
    if not d.is_dir() or not (d / "artifact.json").is_file():
        return NOT_FOUND
    try:
        meta = json.loads((d / "artifact.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return MALFORMED
    if not isinstance(meta, dict):
        return MALFORMED
    if meta.get("schema_version") != SUPPORTED_SCHEMA:
        return UNSUPPORTED_VERSION if isinstance(meta.get("schema_version"), str) else MALFORMED
    need = {"model_version": str, "files": dict, "checkpoint": dict, "architecture": dict, "outputs": dict, "calibration": dict, "ood": dict,
            "authenticity": dict, "provenance": dict, "limitations": list, "approval": dict}
    if any(not isinstance(meta.get(k), t) for k, t in need.items()):
        return MALFORMED
    if meta["model_version"] != expected_version:
        return VERSION_MISMATCH
    files = meta["files"]
    if "weights.pt" not in files or "arrays.npz" not in files:
        return INTEGRITY_FAILED
    for name, digest in files.items():
        if "/" in str(name) or "\\" in str(name) or str(name).startswith(".") or not isinstance(digest, str) or not _HEX64.match(digest):
            return MALFORMED
        p = d / name
        try:
            if not p.is_file() or _sha256_file(p) != digest:
                return INTEGRITY_FAILED
        except OSError:
            return INTEGRITY_FAILED
    if meta["checkpoint"].get("sha256") != files["weights.pt"]:
        return INTEGRITY_FAILED
    if {p.name for p in d.iterdir()} - set(files) - {"artifact.json"}:
        return INTEGRITY_FAILED  # undeclared file in a bundle that is about to run code paths over it
    out = meta["outputs"]
    if out.get("names") != OUTPUT_NAMES or out.get("label_mapping") != LABEL_MAPPING:
        return INVALID_OUTPUT_MAPPING
    try:
        if _completeness_error(meta):
            return INCOMPLETE
    except (AttributeError, TypeError):
        return MALFORMED
    rec = (meta["approval"] or {}).get("record")
    if not isinstance(rec, dict) or any(not (isinstance(rec.get(k), str) and rec[k].strip()) for k in ("approver", "approved_at", "scope")) \
            or not (isinstance(rec.get("evidence"), list) and rec["evidence"]) or rec.get("artifact_binding_sha256") != binding_digest(meta):
        return NOT_APPROVED
    return None


# ----------------------------------------------------------------------------------------------------------------------------
# loading
# ----------------------------------------------------------------------------------------------------------------------------
def _code_for_exception(exc: BaseException) -> str:
    for cls in type(exc).__mro__:
        if cls.__name__ in _NAME_TO_CODE:
            return _NAME_TO_CODE[cls.__name__]
    return LOAD_FAILED


def _build_service() -> tuple[Any | None, str | None]:
    repo, artifact_dir = Path(_env("FIRE_EVIDENCE_REPO")), _env("FIRE_EVIDENCE_ARTIFACT_DIR")
    version = _env("FIRE_EVIDENCE_MODEL_VERSION", EXPECTED_MODEL_VERSION)
    code = preflight_artifact(artifact_dir, version)
    if code:
        return None, code
    src = repo / "src"
    if not (src / "fire_assessor").is_dir():
        return None, RUNTIME_UNAVAILABLE
    try:
        if str(src) not in sys.path:
            sys.path.insert(0, str(src))
        artifact_mod = importlib.import_module("fire_assessor.artifact")
        pipeline_mod = importlib.import_module("fire_assessor.pipeline")
        config_mod = importlib.import_module("fire_assessor.config")
    except Exception:
        return None, RUNTIME_UNAVAILABLE
    try:
        artifact = artifact_mod.ModelArtifact.load(artifact_dir, expected_version=version)  # operational mode: raises unless APPROVED
    except Exception as exc:
        return None, _code_for_exception(exc)
    if getattr(artifact, "status", None) != "APPROVED" or not getattr(artifact, "weights_path", None):
        return None, NOT_APPROVED
    try:
        factory = _scorer_factory or importlib.import_module("fire_assessor.model").TorchScorer.from_artifact
        scorer = factory(artifact.weights_path)
    except ImportError:
        return None, RUNTIME_UNAVAILABLE
    except Exception:
        return None, LOAD_FAILED
    try:
        return pipeline_mod.Assessor(scorer, artifact, config_mod.AppConfig()), None  # never allow_unapproved on this path
    except Exception as exc:
        return None, _code_for_exception(exc)


def _load_service() -> Any | None:
    global _service, _load_error
    if _service is not None or _load_error is not None:
        return _service
    with _lock:
        if _service is not None or _load_error is not None:
            return _service
        _service, _load_error = _build_service()
        if _load_error:
            logger.warning("fire evidence assessor unavailable: %s", _load_error)  # code only; never image content
        return _service


def load_state() -> dict[str, Any]:
    """Operator-facing, I/O-free view for health checks."""
    return {"configuration_error": configuration_error(), "loaded": _service is not None, "load_error": _load_error}


def reset_for_tests() -> None:
    global _service, _load_error, _executor, _pending, _scorer_factory
    with _lock:
        _service, _load_error, _scorer_factory = None, None, None
        if _executor is not None:
            _executor.shutdown(wait=False, cancel_futures=True)
        _executor, _pending = None, None


# ----------------------------------------------------------------------------------------------------------------------------
# public API
# ----------------------------------------------------------------------------------------------------------------------------
def assess_image(data: bytes, image_id: str) -> dict[str, Any]:
    """Synchronous assessment (blocking). Route handlers must use `assess_image_async`. Never raises."""
    code = configuration_error()
    if code:
        return unavailable(code)
    try:
        assessor = _load_service()
        if assessor is None:
            return unavailable(_load_error or LOAD_FAILED)
        return sanitize_assessment(assessor.assess_bytes(data, image_id).model_dump(), getattr(assessor.artifact, "model_version", "unconfigured"))
    except Exception:
        logger.exception("fire evidence assessment failed for %s", image_id)
        return unavailable(INFERENCE_FAILED)


def _get_pool() -> tuple[ThreadPoolExecutor, threading.BoundedSemaphore]:
    global _executor, _pending
    with _lock:
        if _executor is None:
            _executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="fire-evidence")
            _pending = threading.BoundedSemaphore(int(_float_env("FIRE_EVIDENCE_MAX_PENDING", 2, 1, 16)))
        return _executor, _pending  # type: ignore[return-value]


async def assess_image_async(data: bytes, image_id: str) -> dict[str, Any]:
    """Non-blocking assessment for async routes. Never raises; always returns a contract-shaped dict.

    Refusals that need no I/O return immediately (no thread hop). Otherwise the work (artifact hashing on first use, image decoding and
    model inference) runs on ONE dedicated worker with a pending cap and a hard timeout, so a slow model cannot stall the event loop,
    other requests, or the upload itself: it degrades to MODEL_BUSY / MODEL_TIMEOUT and the report proceeds to human review.
    """
    code = configuration_error()
    if code:
        return unavailable(code)
    try:
        pool, pending = _get_pool()
        if not pending.acquire(blocking=False):
            return unavailable(BUSY)
    except Exception:
        logger.exception("fire evidence worker pool unavailable")
        return unavailable(INFERENCE_FAILED)

    def work() -> dict[str, Any]:
        try:
            return assess_image(data, image_id)
        finally:
            pending.release()

    try:
        future = asyncio.get_running_loop().run_in_executor(pool, work)
    except Exception:
        pending.release()
        return unavailable(INFERENCE_FAILED)
    try:
        return await asyncio.wait_for(asyncio.shield(future), timeout=_float_env("FIRE_EVIDENCE_TIMEOUT_S", 20.0, 0.05, 120.0))
    except asyncio.TimeoutError:
        return unavailable(TIMEOUT)
    except Exception:
        return unavailable(INFERENCE_FAILED)
