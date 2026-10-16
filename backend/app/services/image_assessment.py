"""Fail-closed adapter for the separately maintained Fire Evidence Assessor."""
from __future__ import annotations

import importlib
import os
import sys
from pathlib import Path
from threading import Lock
from typing import Any

_lock = Lock()
_service: Any | None = None
_load_error: str | None = None
EXPECTED_MODEL_VERSION = "fire-assessor-v1.0.0"


def _load_service() -> Any | None:
    global _service, _load_error
    if _service is not None or _load_error is not None:
        return _service
    with _lock:
        if _service is not None or _load_error is not None:
            return _service
        repo = os.getenv("FIRE_EVIDENCE_REPO", "").strip()
        artifact_dir = os.getenv("FIRE_EVIDENCE_ARTIFACT_DIR", "").strip()
        expected_version = os.getenv("FIRE_EVIDENCE_MODEL_VERSION", EXPECTED_MODEL_VERSION).strip()
        if not repo or not artifact_dir:
            _load_error = "MODEL_ARTIFACT_NOT_CONFIGURED"
            return None
        try:
            src = str(Path(repo) / "src")
            if src not in sys.path:
                sys.path.insert(0, src)
            artifact_mod = importlib.import_module("fire_assessor.artifact")
            model_mod = importlib.import_module("fire_assessor.model")
            pipeline_mod = importlib.import_module("fire_assessor.pipeline")
            config_mod = importlib.import_module("fire_assessor.config")
            artifact = artifact_mod.ModelArtifact.load(artifact_dir, expected_version=expected_version)
            if not artifact.weights_path:
                raise RuntimeError("MODEL_WEIGHTS_MISSING")
            scorer = model_mod.TorchScorer.from_artifact(artifact.weights_path)
            _service = pipeline_mod.Assessor(scorer, artifact, config_mod.AppConfig())
            return _service
        except Exception as exc:
            _load_error = type(exc).__name__
            return None


def assess_image(data: bytes, image_id: str) -> dict[str, Any]:
    assessor = _load_service()
    if assessor is None:
        return {
            "assessment_status": "UNAVAILABLE",
            "model_version": "unconfigured",
            "error_code": _load_error or "MODEL_UNAVAILABLE",
            "limitations": [
                "No verified Fire Evidence Assessor artifact is configured for this environment.",
                "Image assessment is advisory and does not verify a fire, location, time, or incident status.",
            ],
        }
    result = assessor.assess_bytes(data, image_id)
    return result.model_dump() if hasattr(result, "model_dump") else dict(result)


def reset_for_tests() -> None:
    global _service, _load_error
    with _lock:
        _service = None
        _load_error = None
