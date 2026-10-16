"""Control Room roles may use the existing, validated incident lifecycle."""
import sys
from pathlib import Path
from fastapi import HTTPException

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.routers import operations  # noqa: E402

def test_control_room_role_can_transition_with_existing_state_machine():
    assert operations._require_incident_operator({"id": 12, "role": "control_room_operator"})["role"] == "control_room_operator"
    assert operations._require_incident_operator({"id": 12, "role": "incident_commander"})["role"] == "incident_commander"
    assert operations._require_incident_operator({"id": 12, "role": "admin"})["role"] == "admin"


def test_field_crew_cannot_transition_incident():
    try:
        operations._require_incident_operator({"id": 12, "role": "field_crew"})
    except HTTPException as exc:
        assert exc.status_code == 403
    else:
        raise AssertionError("field_crew must not transition incidents")
