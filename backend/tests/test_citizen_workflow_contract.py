"""Pure contract checks for the server-owned Citizen/workflow boundaries."""
import sys
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.contracts.schemas import CitizenReportRequest, VerificationRequest  # noqa: E402
from app.routers.citizen import _parse_observed  # noqa: E402
from app.routers.workflow import _parse_timestamp  # noqa: E402


def test_citizen_report_validates_coordinate_and_state_shape():
    report = CitizenReportRequest(
        client_key='citizen-key', latitude=20.3, longitude=85.8, state='OD',
        description='Smoke', observed_at='2026-10-16T08:00:00+00:00',
    )
    assert report.latitude == 20.3
    with pytest.raises(ValidationError):
        CitizenReportRequest(client_key='x', latitude=120, longitude=85, state='OD', observed_at='bad')


def test_citizen_and_ranger_timestamps_require_timezone():
    for parser in (_parse_observed, _parse_timestamp):
        with pytest.raises(HTTPException) as exc:
            parser('2026-10-16T08:00:00')
        assert exc.value.status_code == 422


def test_verification_outcome_is_validated_by_workflow_endpoint_contract():
    payload = VerificationRequest(outcome='confirmed', notes='Observed flame', observed_at='2026-10-16T08:00:00Z')
    assert payload.outcome == 'confirmed'
