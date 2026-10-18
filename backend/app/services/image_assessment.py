"""Fail-closed adapter for the separately maintained Fire Evidence Assessor.

Contract (see docs/fire_evidence_artifact_contract.md and docs/fire_evidence_integration.md):

* Inference runs ONLY when ALL of the following hold, checked in this order, each failure being an explicit UNAVAILABLE result
  with its own stable error code:
    1. FIRE_EVIDENCE_REPO and FIRE_EVIDENCE_ARTIFACT_DIR are configured          MODEL_ARTIFACT_NOT_CONFIGURED
    2. FIRE_EVIDENCE_INFERENCE_ENABLED is explicitly true (default: off)         MODEL_INFERENCE_DISABLED
    3. a stdlib-only pre-flight of the artifact bundle passes (schema, version pin, SHA-256 of every file, checkpoint hash,
       output mapping, completeness, human approval bound to the content digest)  MODEL_ARTIFACT_* codes below
       and, only if FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY is set, the Ed25519 signature verifies    MODEL_ARTIFACT_SIGNATURE_INVALID
    4. the assessor package imports and its own loader accepts the bundle
       (re-verifies hashes, tensor/architecture compatibility, approval)          MODEL_RUNTIME_UNAVAILABLE / _INCOMPATIBLE / ...
    5. the model builds                                                           MODEL_LOAD_FAILED
* Nothing is ever fabricated: a non-COMPLETED result carries no scores and no label, and a COMPLETED result must come from an
  APPROVED artifact and satisfy the output contract, otherwise it is replaced by UNAVAILABLE (MODEL_RESULT_INVALID / _NOT_APPROVED).
* Every result has ONE staff-facing shape (see docs/fire_evidence_integration.md): review_required is always true, UNAVAILABLE reads as
  "not assessed" (null OOD, NOT_ASSESSED authenticity and indications), and `indications` are derived per concern from the authenticity
  status and signals. `present_assessment` re-applies the whitelist to stored rows on read.
* Model output is advisory data. This module has no access to incident status, assignments or dispatch, and the only decision it can
  express is REQUIRES_REVIEW. Human review is recorded elsewhere (resq_incident_images.human_review_*).
* A SEPARATE, development-only experimental path exists for running the audited research checkpoint locally (see
  docs/fire_evidence_experimental_inference.md). It is off unless FIRE_EVIDENCE_EXPERIMENTAL_ENABLED is true AND TERRAWATCH_ENV is an
  explicit development value AND the production flag is off; it accepts only the one checkpoint hash pinned below; and it can only ever
  return assessment_status "EXPERIMENTAL" (raw, uncalibrated logits, labelled NOT FOR OPERATIONAL USE) or UNAVAILABLE. It never returns
  COMPLETED or APPROVED, and the production checks below are neither bypassed nor relaxed by it.
* Request path: `assess_image_async` never runs inference or hashes weights on the event loop; it uses one bounded worker, a hard
  timeout and a pending cap, and degrades to UNAVAILABLE (MODEL_TIMEOUT / MODEL_BUSY) instead of blocking or queuing without bound.
"""
from __future__ import annotations

import asyncio
import hashlib
import importlib
import json
import logging
import multiprocessing
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
NOT_ASSESSED = "NOT_ASSESSED"  # authenticity was excluded by the artifact policy, absent, or the assessment did not run
INDICATION_VALUES = ("NOT_ASSESSED", "NONE_FOUND", "POSSIBLE")
# The website adapter builds the assessor WITHOUT a reuse index (Assessor(..., reuse_index=None)), so the pipeline cannot detect reuse:
# "no concerns" must therefore never be reported as "no reuse found". Flip only together with passing a real index to the Assessor.
REUSE_CHECK_ACTIVE = False
# Signals that the assessor adds when it sets a concern. Weak/informational signals (EDITING_SOFTWARE_TAG, C2PA_*, EXIF_CAPTURE_OLD) never
# change the status and are therefore not indications.
_SYNTHETIC_SIGNALS = ("IPTC_DIGITAL_SOURCE_ALGORITHMIC", "GENERATOR_TAG_IN_METADATA", "LEARNED_SYNTHETIC_SCORE")
_EDITED_SIGNALS = ("LEARNED_EDITED_SCORE", "EXIF_CAPTURE_AFTER_UPLOAD", "EXIF_GPS_FAR_FROM_REPORTED_LOCATION")
_REUSED_SIGNALS = ("REUSED_MATCHES",)
INCONSISTENT_NOTE = ("Capture metadata is inconsistent with the report (for example EXIF time or GPS). This is shown as a possible edit; "
                     "it can also have an innocent explanation such as a wrong camera clock.")
NOT_ASSESSED_NOTE = "Authenticity was not assessed for this image (excluded by the model artifact policy or not available)."
MAX_SIGNALS = 20

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
SIGNATURE_INVALID = "MODEL_ARTIFACT_SIGNATURE_INVALID"
ALL_ERROR_CODES = (SIGNATURE_INVALID, NOT_CONFIGURED, INFERENCE_DISABLED, NOT_FOUND, MALFORMED, UNSUPPORTED_VERSION, VERSION_MISMATCH, INTEGRITY_FAILED,
                   INVALID_OUTPUT_MAPPING, INCOMPLETE, NOT_APPROVED, INCOMPATIBLE, RUNTIME_UNAVAILABLE, LOAD_FAILED, TIMEOUT, BUSY,
                   INFERENCE_FAILED, RESULT_INVALID)

# --- development-only experimental path -------------------------------------------------------------------------------------
# The one checkpoint the experimental path will load. Pinned in code, never read from the file or environment under test.
_PINNED_EXPERIMENTAL_SHA256 = "7bd5498f04838fe19240da2b7339d794cc5fc3948074a0d826c33303d5c42dfa"
EXPERIMENTAL_ALLOWED_SHA256 = _PINNED_EXPERIMENTAL_SHA256  # tests may rebind this module attribute; reset_for_tests() restores the pin
EXPERIMENTAL_STATUS = "EXPERIMENTAL"
EXPERIMENTAL_ARTIFACT_STATUS = "EXPERIMENTAL_UNAPPROVED"
EXPERIMENTAL_NOTICE = "EXPERIMENTAL / NOT FOR OPERATIONAL USE"
DEVELOPMENT_ENVIRONMENTS = ("development", "dev", "local", "test")
EXPERIMENTAL_NOT_PERMITTED = "MODEL_EXPERIMENTAL_NOT_PERMITTED"      # not an explicit development environment (production by default)
EXPERIMENTAL_CONFLICT = "MODEL_EXPERIMENTAL_CONFLICT"                # production inference flag is also on: refuse to mix modes
EXPERIMENTAL_NOT_CONFIGURED = "MODEL_EXPERIMENTAL_NOT_CONFIGURED"
EXPERIMENTAL_CODES = ("MODEL_EXPERIMENTAL_NOT_FOUND", "MODEL_EXPERIMENTAL_PROVENANCE_INVALID", "MODEL_EXPERIMENTAL_INTEGRITY_FAILED",
                      "MODEL_EXPERIMENTAL_INCOMPATIBLE", "MODEL_EXPERIMENTAL_LOAD_FAILED", "MODEL_EXPERIMENTAL_INFERENCE_FAILED")
ALL_EXPERIMENTAL_ERROR_CODES = (EXPERIMENTAL_NOT_PERMITTED, EXPERIMENTAL_CONFLICT, EXPERIMENTAL_NOT_CONFIGURED, *EXPERIMENTAL_CODES)
_CODE_SHAPE = re.compile(r"^[A-Z0-9_]{1,64}$")
MAX_ABS_LOGIT = 1.0e3

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
_exp_service: Any | None = None
_exp_error: str | None = None
_experimental_spec: Any | None = None  # tests only (code, never environment): architecture spec for toy checkpoints; None = the real ViT-B/16 spec
_process_worker: Any | None = None
_process_conn: Any | None = None
_process_lock = threading.Lock()


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


def experimental_requested() -> bool:
    return _env("FIRE_EVIDENCE_EXPERIMENTAL_ENABLED").lower() in ("1", "true", "yes", "on")


def development_environment() -> bool:
    """Anything other than an explicit development value (including unset) is treated as production."""
    return _env("TERRAWATCH_ENV").lower() in DEVELOPMENT_ENVIRONMENTS


def _experimental_configuration_error() -> Optional[str]:
    if not development_environment():
        return EXPERIMENTAL_NOT_PERMITTED
    if inference_enabled():
        return EXPERIMENTAL_CONFLICT
    if not (_env("FIRE_EVIDENCE_REPO") and _env("FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT") and _env("FIRE_EVIDENCE_EXPERIMENTAL_PROVENANCE")):
        return EXPERIMENTAL_NOT_CONFIGURED
    return None


def configuration_error() -> Optional[str]:
    """Cheap, I/O-free checks. A non-None result means UNAVAILABLE without touching the filesystem or a worker thread."""
    if experimental_requested():
        return _experimental_configuration_error()
    if not _env("FIRE_EVIDENCE_REPO") or not _env("FIRE_EVIDENCE_ARTIFACT_DIR"):
        return NOT_CONFIGURED
    if not inference_enabled():
        return INFERENCE_DISABLED
    return None


# ----------------------------------------------------------------------------------------------------------------------------
# structured results
# ----------------------------------------------------------------------------------------------------------------------------
def _not_assessed_indications() -> dict[str, str]:
    return {"synthetic": NOT_ASSESSED, "edited": NOT_ASSESSED, "reused": NOT_ASSESSED}


def unavailable(code: str, model_version: str = "unconfigured") -> dict[str, Any]:
    """The only result a refused or failed assessment may take: explicit state, no scores, no label, human review required.

    Nothing here may read as a negative finding: ood_flag is null (not false), authenticity is NOT_ASSESSED (not INCONCLUSIVE/NO_CONCERNS)
    and every indication is NOT_ASSESSED.
    """
    safe_code = code if isinstance(code, str) and _CODE_SHAPE.fullmatch(code) else RESULT_INVALID
    return {
        "assessment_status": "UNAVAILABLE", "artifact_status": None, "model_version": model_version, "error_code": safe_code,
        "scores": None, "derived_label": None, "decision": "REQUIRES_REVIEW", "review_required": True, "review_priority": "STANDARD",
        "quality_flags": [], "ood_flag": None, "authenticity": {"status": NOT_ASSESSED, "signals": []},
        "indications": _not_assessed_indications(), "limitations": list(LIMITATIONS),
    }


def _clean_signal(value: Any) -> str:
    text = str(value)[:120]
    return text.split(":", 1)[0] if text.startswith(_REUSED_SIGNALS) else text  # never carry other images' ids into the response


def indications_for(status: str, signals: list[str]) -> tuple[dict[str, str], list[str]]:
    """Per-concern indications derived from the single authenticity status plus the signals that led to it.

    The assessor reduces several concerns to ONE status by priority (REUSED > POSSIBLE_SYNTHETIC > POSSIBLE_EDITED > INCONSISTENT), but its
    signals still list every concern that fired, so both are read. Rules:
      * a concern that fired -> POSSIBLE (INCONSISTENT is shown as edited POSSIBLE plus a limitation note)
      * NO_CONCERNS_FOUND -> NONE_FOUND only for what was actually assessed: synthetic and edited (the learned head ran);
        reuse is NONE_FOUND only when REUSE_CHECK_ACTIVE, otherwise NOT_ASSESSED
      * a concern that did not fire next to another one that did is NOT_ASSESSED (a conclusive negative is not established)
      * INCONCLUSIVE / NOT_ASSESSED -> everything NOT_ASSESSED
    Returns (indications, extra limitation notes).
    """
    out, notes = _not_assessed_indications(), []
    if status == "NO_CONCERNS_FOUND":
        out["synthetic"] = out["edited"] = "NONE_FOUND"
        out["reused"] = "NONE_FOUND" if REUSE_CHECK_ACTIVE else NOT_ASSESSED
    if status == "POSSIBLE_SYNTHETIC" or any(x.startswith(_SYNTHETIC_SIGNALS) for x in signals):
        out["synthetic"] = "POSSIBLE"
    if status in ("POSSIBLE_EDITED", "INCONSISTENT") or any(x.startswith(_EDITED_SIGNALS) for x in signals):
        out["edited"] = "POSSIBLE"
    if status == "REUSED" or any(x.startswith(_REUSED_SIGNALS) for x in signals):
        out["reused"] = "POSSIBLE"
    if status == "INCONSISTENT" or any(x.startswith(("EXIF_CAPTURE_AFTER_UPLOAD", "EXIF_GPS_FAR_FROM_REPORTED_LOCATION")) for x in signals):
        notes.append(INCONSISTENT_NOTE)
    if status == NOT_ASSESSED:
        notes.append(NOT_ASSESSED_NOTE)
    return out, notes


def sanitize_assessment(result: Any, model_version: str = "unconfigured", authenticity_assessed: bool = True) -> dict[str, Any]:
    """Admit a model result only if it satisfies the output contract and comes from an APPROVED artifact; else UNAVAILABLE.

    `authenticity_assessed=False` (the artifact excludes authenticity by policy) forces authenticity NOT_ASSESSED whatever the model returned.
    The function is idempotent, so legacy stored rows can be re-presented through it.
    """
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
            and result.get("review_priority") in ("HIGH", "STANDARD") and isinstance(auth, dict) and auth.get("status") in AUTH_STATUSES | {NOT_ASSESSED}
            and isinstance(result.get("quality_flags"), list) and isinstance(result.get("ood_flag"), bool)
        )
    except (TypeError, ValueError):
        ok = False
    if not ok:
        return unavailable(RESULT_INVALID, version)
    status = auth["status"] if authenticity_assessed else NOT_ASSESSED
    signals = [_clean_signal(x) for x in (auth.get("signals") or [])][:MAX_SIGNALS] if authenticity_assessed else []
    indications, notes = indications_for(status, signals)
    limitations = [str(x) for x in (result.get("limitations") or []) if str(x) not in (INCONSISTENT_NOTE, NOT_ASSESSED_NOTE)]
    return {  # whitelist: nothing the model returns outside the contract is stored or shown
        "assessment_status": "COMPLETED", "artifact_status": "APPROVED", "model_version": version, "error_code": None,
        "scores": {k: float(scores[k]) for k in OUTPUT_NAMES}, "derived_label": result["derived_label"], "decision": "REQUIRES_REVIEW",
        "review_required": True, "review_priority": result["review_priority"], "quality_flags": [str(f)[:40] for f in result["quality_flags"]][:20],
        "ood_flag": result["ood_flag"], "authenticity": {"status": status, "signals": signals}, "indications": indications,
        "limitations": limitations + notes,
    }


def sanitize_experimental(result: Any, model_version: str = "unconfigured") -> dict[str, Any]:
    """Admit an experimental result only as EXPERIMENTAL (finite raw logits) or UNAVAILABLE. Never COMPLETED, never APPROVED."""
    if not isinstance(result, dict):
        return unavailable(RESULT_INVALID, model_version)
    version = str(result.get("model_version") or model_version)
    status = result.get("assessment_status")
    if status == "UNAVAILABLE":
        code = result.get("error_code")
        return unavailable(code if isinstance(code, str) and _CODE_SHAPE.match(code) else INFERENCE_FAILED, version)
    logits = result.get("raw_logits")
    try:
        ok = (
            status == EXPERIMENTAL_STATUS and result.get("artifact_status") == EXPERIMENTAL_ARTIFACT_STATUS
            and result.get("checkpoint_sha256") == EXPERIMENTAL_ALLOWED_SHA256
            and isinstance(logits, dict) and set(logits) == set(OUTPUT_NAMES)
            and all(isinstance(logits[k], (int, float)) and not isinstance(logits[k], bool) and abs(float(logits[k])) <= MAX_ABS_LOGIT
                    and float(logits[k]) == float(logits[k]) for k in OUTPUT_NAMES)
        )
    except (TypeError, ValueError):
        ok = False
    if not ok:
        return unavailable(RESULT_INVALID, version)
    return {  # whitelist; no probabilities, no label, no OOD/authenticity verdict exist for an unapproved checkpoint
        "assessment_status": EXPERIMENTAL_STATUS, "experimental": True, "notice": EXPERIMENTAL_NOTICE, "model_version": version,
        "checkpoint_sha256": EXPERIMENTAL_ALLOWED_SHA256, "error_code": None, "artifact_status": EXPERIMENTAL_ARTIFACT_STATUS,
        "raw_logits": {k: float(logits[k]) for k in OUTPUT_NAMES}, "scores_calibrated": False, "scores": None, "derived_label": None,
        "decision": "REQUIRES_REVIEW", "review_required": True, "review_priority": "STANDARD", "quality_flags": [], "ood_flag": None,
        "authenticity": {"status": NOT_ASSESSED, "signals": []}, "indications": _not_assessed_indications(),
        "limitations": [EXPERIMENTAL_NOTICE + ": unapproved research checkpoint.",
                        "Raw logits are uncalibrated and are not probabilities; no threshold, OOD or authenticity check was applied.",
                        "Does not confirm a fire, location or time, and never changes incident status or dispatches anyone."],
    }


def persistence_fields(assessment: dict[str, Any]) -> dict[str, Any]:
    """Columns for resq_incident_images. Authenticity is persisted only for a COMPLETED assessment, never for an unavailable one."""
    completed = assessment.get("assessment_status") == "COMPLETED"
    experimental = assessment.get("assessment_status") == EXPERIMENTAL_STATUS
    return {
        "status": "COMPLETED" if completed else EXPERIMENTAL_STATUS if experimental else "UNAVAILABLE", "version": assessment.get("model_version"),
        "auth": (assessment.get("authenticity") or {}).get("status") if completed else None,
        "assessment": json.dumps(assessment), "error": assessment.get("error_code"),
    }


def present_assessment(stored: Any, status: Optional[str] = None, error: Optional[str] = None) -> dict[str, Any]:
    """Staff-facing view of a stored assessment (the typed contract). Re-applies the whitelist, so rows written by earlier versions
    (no indications / review_required, authenticity INCONCLUSIVE on an unavailable result) are shown in the current shape and unknown
    stored keys are dropped. Never raises; anything unreadable is UNAVAILABLE, never a negative finding."""
    if not isinstance(stored, dict) or not stored:
        return unavailable(error if isinstance(error, str) and error else RESULT_INVALID)
    try:
        if stored.get("assessment_status") == EXPERIMENTAL_STATUS:
            return sanitize_experimental(stored)
        if stored.get("assessment_status") == "COMPLETED":
            return sanitize_assessment(stored)
        return unavailable(stored.get("error_code") or error or INFERENCE_FAILED, str(stored.get("model_version") or "unconfigured"))
    except Exception:
        return unavailable(RESULT_INVALID)


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
    return _signature_error(meta)  # last: only reached by an otherwise complete, approved bundle


def signing_payload(meta: dict) -> bytes:
    """The bytes the approver signs: canonical JSON (sorted keys, no spaces, ASCII) of artifact.json with `approval.signature` removed.
    Everything else is covered: file hashes, calibration, approval record, `artifact_status` and `approval.binding_sha256`."""
    body = json.loads(json.dumps(meta))
    body.get("approval", {}).pop("signature", None)
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def _signature_error(meta: dict) -> Optional[str]:
    """OPTIONAL Ed25519 verification. Enforced only when FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY (base64 raw 32-byte key) is set; when it is unset
    the signature is NOT checked (the content-digest approval binding above still is). With the key set, a missing/invalid signature, a key id
    that differs from FIRE_EVIDENCE_TRUSTED_KEY_ID (when that is set), or a missing `cryptography` package all fail closed."""
    key_b64 = _env("FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY")
    if not key_b64:
        return None
    sig = (meta.get("approval") or {}).get("signature")
    if not isinstance(sig, dict) or sig.get("algorithm") != "Ed25519" or not isinstance(sig.get("value"), str):
        return SIGNATURE_INVALID
    expected_id = _env("FIRE_EVIDENCE_TRUSTED_KEY_ID")
    if expected_id and sig.get("key_id") != expected_id:
        return SIGNATURE_INVALID
    try:
        import base64
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        Ed25519PublicKey.from_public_bytes(base64.b64decode(key_b64, validate=True)).verify(base64.b64decode(sig["value"], validate=True), signing_payload(meta))
    except Exception:  # bad key, bad base64, wrong signature, or the verifier library is missing: all refuse
        return SIGNATURE_INVALID
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
        scorer = factory(getattr(artifact, "weights_bytes", None) or artifact.weights_path)
    except ImportError:
        return None, RUNTIME_UNAVAILABLE
    except Exception:
        return None, LOAD_FAILED
    try:
        return pipeline_mod.Assessor(scorer, artifact, config_mod.AppConfig()), None  # never allow_unapproved on this path
    except Exception as exc:
        return None, _code_for_exception(exc)


def _build_experimental_service() -> tuple[Any | None, str | None]:
    src = Path(_env("FIRE_EVIDENCE_REPO")) / "src"
    if not (src / "fire_assessor").is_dir():
        return None, RUNTIME_UNAVAILABLE
    try:
        if str(src) not in sys.path:
            sys.path.insert(0, str(src))
        exp = importlib.import_module("fire_assessor.experimental")
    except Exception:
        return None, RUNTIME_UNAVAILABLE
    try:
        return exp.load_experimental(_env("FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT"), _env("FIRE_EVIDENCE_EXPERIMENTAL_PROVENANCE"),
                                     expected_sha256=EXPERIMENTAL_ALLOWED_SHA256, spec=_experimental_spec, scorer_factory=_scorer_factory), None
    except Exception as exc:
        code = getattr(exc, "code", None)
        return None, code if code in EXPERIMENTAL_CODES else "MODEL_EXPERIMENTAL_LOAD_FAILED"


def _load_experimental_service() -> Any | None:
    global _exp_service, _exp_error
    if _exp_service is not None or _exp_error is not None:
        return _exp_service
    with _lock:
        if _exp_service is not None or _exp_error is not None:
            return _exp_service
        _exp_service, _exp_error = _build_experimental_service()
        if _exp_error:
            logger.warning("experimental fire evidence path unavailable: %s", _exp_error)
        return _exp_service


def _assess_experimental(data: bytes, image_id: str) -> dict[str, Any]:
    service = _load_experimental_service()
    if service is None:
        return unavailable(_exp_error or "MODEL_EXPERIMENTAL_LOAD_FAILED")
    return sanitize_experimental(service.assess_bytes(data, image_id), getattr(service, "model_version", "unconfigured"))


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
    return {"configuration_error": configuration_error(), "loaded": _service is not None, "load_error": _load_error,
            "experimental_loaded": _exp_service is not None, "experimental_load_error": _exp_error}


def reset_for_tests() -> None:
    global _service, _load_error, _executor, _pending, _scorer_factory, _exp_service, _exp_error, _experimental_spec, EXPERIMENTAL_ALLOWED_SHA256
    with _lock:
        _service, _load_error, _scorer_factory, _experimental_spec = None, None, None, None
        EXPERIMENTAL_ALLOWED_SHA256 = _PINNED_EXPERIMENTAL_SHA256
        _exp_service, _exp_error = None, None
        if _executor is not None:
            _executor.shutdown(wait=False, cancel_futures=True)
        _stop_process_worker()
        _executor, _pending = None, None


# ----------------------------------------------------------------------------------------------------------------------------
# public API
# ----------------------------------------------------------------------------------------------------------------------------
def _authenticity_provided(assessor: Any) -> bool:
    """False when the loaded artifact excludes (or does not provide) authenticity: the result must then say NOT_ASSESSED, not INCONCLUSIVE."""
    auth = getattr(getattr(assessor, "artifact", None), "authenticity", None)
    return auth.get("status") == "PROVIDED" if isinstance(auth, dict) else True


def assess_image(data: bytes, image_id: str) -> dict[str, Any]:
    """Synchronous assessment (blocking). Route handlers must use `assess_image_async`. Never raises."""
    code = configuration_error()
    if code:
        return unavailable(code)
    try:
        if experimental_requested():  # separate path: its configuration_error() above already enforced dev-only gating
            return _assess_experimental(data, image_id)
        assessor = _load_service()
        if assessor is None:
            return unavailable(_load_error or LOAD_FAILED)
        return sanitize_assessment(assessor.assess_bytes(data, image_id).model_dump(), getattr(assessor.artifact, "model_version", "unconfigured"),
                                   authenticity_assessed=_authenticity_provided(assessor))
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


def _process_worker_main(conn) -> None:
    """Persistent isolated inference worker; the parent can terminate it on timeout."""
    while True:
        try:
            message = conn.recv()
        except (EOFError, OSError):
            return
        if message is None:
            return
        try:
            data, image_id = message
            conn.send(assess_image(data, image_id))
        except Exception:
            try:
                conn.send(unavailable(INFERENCE_FAILED))
            except (EOFError, OSError):
                return


def _stop_process_worker() -> None:
    global _process_worker, _process_conn
    with _process_lock:
        worker, conn = _process_worker, _process_conn
        _process_worker, _process_conn = None, None
    if conn is not None:
        try:
            conn.close()
        except OSError:
            pass
    if worker is not None:
        if worker.is_alive():
            worker.terminate()
        worker.join(timeout=1.0)
        if worker.is_alive():
            worker.kill()
            worker.join(timeout=1.0)


def _process_request(data: bytes, image_id: str) -> dict[str, Any]:
    global _process_worker, _process_conn
    # The scorer factory is an intentionally private test seam.  Keeping its
    # execution in the existing executor lets unit tests inject a tiny scorer;
    # production never sets it, so every real model call crosses the killable
    # subprocess boundary below.
    if _scorer_factory is not None:
        return assess_image(data, image_id)
    with _process_lock:
        if _process_worker is None or not _process_worker.is_alive():
            if _process_conn is not None:
                try:
                    _process_conn.close()
                except OSError:
                    pass
            # Never fork the application process: image/model dependencies can own
            # native threads and SQLite/PROJ handles, and forking them has caused
            # interpreter crashes on macOS.  A fresh interpreter also gives the
            # timeout boundary a clean resource lifetime.
            context = multiprocessing.get_context("spawn")
            parent, child = context.Pipe()
            worker = context.Process(target=_process_worker_main, args=(child,), name="fire-evidence-process", daemon=True)
            worker.start()
            child.close()
            _process_worker, _process_conn = worker, parent
        conn = _process_conn
        try:
            conn.send((data, image_id))
        except (EOFError, OSError) as exc:
            _stop_process_worker()
            raise RuntimeError("inference worker unavailable") from exc
    try:
        return conn.recv()
    except (EOFError, OSError) as exc:
        _stop_process_worker()
        raise RuntimeError("inference worker exited") from exc


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
            return _process_request(data, image_id)
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
        _stop_process_worker()
        return unavailable(TIMEOUT)
    except Exception:
        _stop_process_worker()
        return unavailable(INFERENCE_FAILED)
