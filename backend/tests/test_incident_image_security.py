"""Focused security regressions for private incident-image handling."""

import hashlib
import sys
from pathlib import Path
from unittest import mock

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.contracts.schemas import IncidentImageReviewRequest  # noqa: E402
from app.routers import operations  # noqa: E402
from fastapi import HTTPException  # noqa: E402


class _Result:
    def __init__(self, row=None, scalar_value=None):
        self.row = row
        self.scalar_value = scalar_value

    def mappings(self):
        return self

    def first(self):
        return self.row

    def scalar(self):
        return self.scalar_value


class _Connection:
    def __init__(self, results):
        self.results = iter(results)
        self.statements = []

    def execute(self, statement, params=None):
        self.statements.append((str(statement), params or {}))
        return next(self.results)


def _context(connection):
    context = mock.MagicMock()
    context.__enter__.return_value = connection
    return context


def _image_row(**overrides):
    row = {
        "id": 9,
        "incident_id": 4,
        "storage_key": "4/evidence.jpg",
        "original_filename": "evidence.jpg",
        "content_type": "image/jpeg",
        "size_bytes": 5,
        "sha256": hashlib.sha256(b"image").hexdigest(),
        "assessment_status": "UNAVAILABLE",
        "model_version": "unconfigured",
        "authenticity_status": None,
        "assessment": {},
        "assessment_error": "MODEL_ARTIFACT_NOT_CONFIGURED",
        "human_review_status": "NOT_REVIEWED",
        "human_review_note": None,
        "human_reviewed_by": None,
        "human_reviewed_at": None,
        "created_at": "created",
        "assessed_at": "assessed",
    }
    row.update(overrides)
    return row


def test_private_image_rejects_database_storage_key_escape(tmp_path):
    outside = tmp_path / "outside.jpg"
    outside.write_bytes(b"private")
    incident_db = _Connection([
        _Result({"id": 4, "state": "OD"}),
        _Result(_image_row(storage_key="../outside.jpg")),
    ])

    with (
        mock.patch.object(operations, "IMAGE_ROOT", tmp_path / "images"),
        mock.patch.object(operations.engine, "connect", return_value=_context(incident_db)),
        mock.patch.object(operations, "require_scope"),
    ):
        with pytest.raises(HTTPException) as caught:
            operations.get_incident_image(4, 9, {"id": 7, "role": "control_room_operator"})

    assert caught.value.status_code == 404
    assert outside.read_bytes() == b"private"


def test_private_image_rejects_modified_file(tmp_path):
    image_path = tmp_path / "images" / "4"
    image_path.mkdir(parents=True)
    (image_path / "evidence.jpg").write_bytes(b"tampered")
    incident_db = _Connection([
        _Result({"id": 4, "state": "OD"}),
        _Result(_image_row()),
    ])

    with (
        mock.patch.object(operations, "IMAGE_ROOT", tmp_path / "images"),
        mock.patch.object(operations.engine, "connect", return_value=_context(incident_db)),
        mock.patch.object(operations, "require_scope"),
    ):
        with pytest.raises(HTTPException) as caught:
            operations.get_incident_image(4, 9, {"id": 7, "role": "control_room_operator"})

    assert caught.value.status_code == 404


def test_reset_review_clears_reviewer_metadata_and_is_audited():
    existing = _image_row(
        human_review_status="VERIFIED_AUTHENTIC",
        human_review_note="prior decision",
        human_reviewed_by=12,
        human_reviewed_at="prior-time",
    )
    updated = dict(existing, human_review_status="NOT_REVIEWED", human_review_note=None,
                   human_reviewed_by=None, human_reviewed_at=None)
    db = _Connection([
        _Result({"id": 4, "state": "OD"}),
        _Result(scalar_value="VERIFIED_AUTHENTIC"),
        _Result(updated),
    ])

    with (
        mock.patch.object(operations.engine, "begin", return_value=_context(db)),
        mock.patch.object(operations, "require_scope"),
        mock.patch.object(operations.audit_log, "write_audit_log") as audit,
    ):
        result = operations.review_incident_image(
            4,
            9,
            IncidentImageReviewRequest(status="NOT_REVIEWED", note=None),
            {"id": 7, "role": "control_room_operator"},
        )

    assert result["image"]["human_review_status"] == "NOT_REVIEWED"
    assert result["image"]["human_reviewed_by"] is None
    assert result["image"]["human_reviewed_at"] is None
    update_sql, params = db.statements[2]
    assert "CASE WHEN :status='NOT_REVIEWED' THEN NULL" in update_sql
    assert params["status"] == "NOT_REVIEWED"
    audit.assert_called_once()

