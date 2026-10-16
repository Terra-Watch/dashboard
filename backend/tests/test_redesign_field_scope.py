"""Isolated tests for state-scope enforcement on redesign field workflows."""
import sys
import unittest
from pathlib import Path
from unittest import mock

from fastapi import HTTPException

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.routers import redesign


class RedesignFieldScopeTests(unittest.TestCase):
    def setUp(self):
        self.detections = [
            {"id": "od-1", "incident_id": "i-1", "label": "Odisha", "lat": 20.0, "lon": 85.0, "state": "OD"},
            {"id": "cg-1", "incident_id": "i-2", "label": "Chhattisgarh", "lat": 21.0, "lon": 82.0, "state": "CG"},
            {"id": "no-state", "incident_id": "i-3", "label": "Unknown state", "lat": 22.0, "lon": 83.0, "state": None},
        ]

    def test_field_task_list_is_default_deny_and_excludes_missing_state(self):
        with (
            mock.patch.object(redesign.redesign_data, "list_detections", return_value=self.detections),
            mock.patch.object(redesign.redesign_store, "latest_status_by_detection", return_value={}),
            mock.patch.object(redesign, "user_scopes", return_value={"OD"}),
        ):
            result = redesign.field_tasks({"id": 41, "role": "field_crew"})
        self.assertEqual([item["task_id"] for item in result["items"]], ["od-1"])
        self.assertNotIn("state", result["items"][0])

    def test_field_task_list_with_no_scopes_returns_no_tasks(self):
        with (
            mock.patch.object(redesign.redesign_data, "list_detections", return_value=self.detections),
            mock.patch.object(redesign.redesign_store, "latest_status_by_detection", return_value={}),
            mock.patch.object(redesign, "user_scopes", return_value=set()),
        ):
            result = redesign.field_tasks({"id": 41, "role": "field_crew"})
        self.assertEqual(result["items"], [])

    def test_report_checks_authoritative_task_state_before_persistence(self):
        body = redesign.FieldReportRequest(
            idempotency_key="local-key",
            task_id="cg-1",
            incident_id="i-2",
            note="Observed smoke",
            device_id="test-device",
            captured_at="2026-10-16T00:00:00Z",
        )
        user = {"id": 41, "role": "field_crew"}
        with (
            mock.patch.object(redesign, "INGEST_LIVE", False),
            mock.patch.object(redesign.redesign_data, "list_detections", return_value=self.detections),
            mock.patch.object(redesign, "require_scope", side_effect=HTTPException(status_code=403, detail="out of scope")) as check_scope,
            mock.patch.object(redesign.redesign_store, "upsert_field_report") as persist,
        ):
            with self.assertRaises(HTTPException) as raised:
                redesign.submit_field_report(body, user)
        self.assertEqual(raised.exception.status_code, 403)
        check_scope.assert_called_once_with(user, "CG", entity_type="detection", entity_id="cg-1")
        persist.assert_not_called()

    def test_report_with_missing_authoritative_state_is_denied_before_persistence(self):
        body = redesign.FieldReportRequest(
            idempotency_key="local-key",
            task_id="no-state",
            note="Observed smoke",
            device_id="test-device",
            captured_at="2026-10-16T00:00:00Z",
        )
        user = {"id": 41, "role": "field_crew"}
        with (
            mock.patch.object(redesign, "INGEST_LIVE", False),
            mock.patch.object(redesign.redesign_data, "list_detections", return_value=self.detections),
            mock.patch.object(redesign, "require_scope", side_effect=HTTPException(status_code=403, detail="missing state")) as check_scope,
            mock.patch.object(redesign.redesign_store, "upsert_field_report") as persist,
        ):
            with self.assertRaises(HTTPException) as raised:
                redesign.submit_field_report(body, user)
        self.assertEqual(raised.exception.status_code, 403)
        check_scope.assert_called_once_with(user, None, entity_type="detection", entity_id="no-state")
        persist.assert_not_called()

    def test_admin_field_task_list_uses_existing_scope_bypass(self):
        with (
            mock.patch.object(redesign.redesign_data, "list_detections", return_value=self.detections),
            mock.patch.object(redesign.redesign_store, "latest_status_by_detection", return_value={}),
            mock.patch.object(redesign, "user_scopes") as scopes,
        ):
            result = redesign.field_tasks({"id": 1, "role": "admin"})
        self.assertEqual({item["task_id"] for item in result["items"]}, {"od-1", "cg-1", "no-state"})
        scopes.assert_not_called()


if __name__ == "__main__":
    unittest.main()
