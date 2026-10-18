"""Unauthenticated redesign sample writes must never reach persistent storage."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.routers import redesign  # noqa: E402
from app.core import security  # noqa: E402


TEST_KEY = "request-test-signing-key-that-is-long-enough-for-hs256"


class RedesignWriteGuardTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app = FastAPI()
        app.include_router(redesign.router)
        cls.client = TestClient(app)
        from app.core import security
        cls._active = patch.object(security, "_confirm_active", side_effect=lambda identity: identity)   # account checks are tested in test_admin
        cls._active.start()

    @classmethod
    def tearDownClass(cls):
        cls._active.stop()

    def test_client_supplied_role_cannot_persist_triage_action(self):
        with patch.object(redesign.redesign_store, "record_triage_action") as record:
            response = self.client.post(
                "/api/redesign/detections/sample-id/actions",
                json={"action": "verify", "role": "admin", "device_id": "browser"},
            )
        self.assertIn(response.status_code, (401, 403, 503))
        record.assert_not_called()

    def test_field_report_cannot_persist_without_authenticated_actor(self):
        with patch.object(redesign.redesign_store, "upsert_field_report") as upsert:
            response = self.client.post(
                "/api/redesign/field/reports",
                json={
                    "idempotency_key": "test-key",
                    "task_id": "sample-task",
                    "device_id": "browser",
                    "captured_at": "2026-10-15T00:00:00Z",
                },
            )
        self.assertIn(response.status_code, (401, 403, 503))
        upsert.assert_not_called()

    def test_persisted_history_and_reports_are_not_exposed_without_authorization(self):
        with (
            patch.object(redesign.redesign_store, "list_triage_history") as history,
            patch.object(redesign.redesign_store, "list_field_reports") as reports,
        ):
            history_response = self.client.get("/api/redesign/detections/sample-id/history")
            reports_response = self.client.get("/api/redesign/field/reports")
        self.assertIn(history_response.status_code, (401, 403, 503))
        self.assertIn(reports_response.status_code, (401, 403, 503))
        history.assert_not_called()
        reports.assert_not_called()

    def test_authenticated_triage_rejects_missing_or_mismatched_csrf_before_mutation(self):
        client = TestClient(self.client.app, base_url="https://testserver")
        with patch.object(security, "RESQ_SECRET_KEY", TEST_KEY):
            token = security.make_access_token(7, "control_room_operator")
            with patch.object(redesign.redesign_store, "record_triage_action") as record:
                missing = client.post(
                    "/api/redesign/detections/sample-id/actions",
                    json={"action": "verify", "role": "control_room_operator", "device_id": "browser"},
                    headers={"Authorization": f"Bearer {token}"},
                )
                client.cookies.set(security.CSRF_COOKIE, "cookie-csrf-value")
                mismatched = client.post(
                    "/api/redesign/detections/sample-id/actions",
                    json={"action": "verify", "role": "control_room_operator", "device_id": "browser"},
                    headers={"Authorization": f"Bearer {token}", security.CSRF_HEADER: "different-header-value"},
                )

        self.assertEqual(missing.status_code, 403)
        self.assertEqual(mismatched.status_code, 403)
        record.assert_not_called()

    def test_valid_csrf_reaches_authorized_triage_handler_with_mocked_scope_and_storage(self):
        client = TestClient(self.client.app, base_url="https://testserver")
        csrf_value = "matching-cookie-and-header"
        client.cookies.set(security.CSRF_COOKIE, csrf_value)

        with patch.object(security, "RESQ_SECRET_KEY", TEST_KEY):
            token = security.make_access_token(7, "control_room_operator")
            with (
                patch.object(redesign, "require_scope"),
                patch.object(redesign.redesign_store, "record_triage_action", return_value={"action": "verify"}) as record,
                patch.object(redesign.audit_log, "write_audit_log") as audit,
            ):
                response = client.post(
                    "/api/redesign/detections/sample-id/actions",
                    json={"action": "verify", "role": "control_room_operator", "device_id": "browser"},
                    headers={"Authorization": f"Bearer {token}", security.CSRF_HEADER: csrf_value},
                )

        self.assertEqual(response.status_code, 200)
        record.assert_called_once()
        audit.assert_called_once()

    def test_client_role_cannot_override_authenticated_role_even_with_valid_csrf(self):
        client = TestClient(self.client.app, base_url="https://testserver")
        csrf_value = "matching-cookie-and-header"
        client.cookies.set(security.CSRF_COOKIE, csrf_value)
        with patch.object(security, "RESQ_SECRET_KEY", TEST_KEY):
            token = security.make_access_token(8, "range_officer")
            with patch.object(redesign.redesign_store, "record_triage_action") as record:
                response = client.post(
                    "/api/redesign/detections/sample-id/actions",
                    json={"action": "verify", "role": "admin", "device_id": "browser"},
                    headers={"Authorization": f"Bearer {token}", security.CSRF_HEADER: csrf_value},
                )

        self.assertEqual(response.status_code, 403)
        record.assert_not_called()


if __name__ == "__main__":
    unittest.main()
