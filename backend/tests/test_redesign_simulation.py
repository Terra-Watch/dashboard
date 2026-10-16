"""Tests for the interactive Cell2Fire simulation endpoints in the redesign router."""
import sys
import unittest
from pathlib import Path
from unittest import mock

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from fastapi.testclient import TestClient
from app.main import app
from app.core.security import make_access_token

TEST_KEY = "test-only-signing-secret-with-over-32-bytes"


class RedesignSimulationTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)
        with mock.patch("app.core.security.RESQ_SECRET_KEY", TEST_KEY):
            self.officer_token = make_access_token(10, "range_officer")
            self.field_token = make_access_token(11, "field_crew")

    def _headers(self, token: str) -> dict:
        return {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "x-resq-csrf": "test-csrf-token",
            "Cookie": "resq_csrf=test-csrf-token",
        }

    def test_simulation_endpoints_require_auth(self):
        resp_domain = self.client.get("/api/redesign/simulation/domain")
        self.assertEqual(resp_domain.status_code, 401)
        resp_run = self.client.post("/api/redesign/simulation/run", json={"latitude": 21.867, "longitude": 86.500})
        self.assertEqual(resp_run.status_code, 401)

    def test_simulation_denies_unauthorized_role(self):
        with mock.patch("app.core.security.RESQ_SECRET_KEY", TEST_KEY):
            headers = self._headers(self.field_token)
            resp = self.client.get("/api/redesign/simulation/domain", headers=headers)
            self.assertEqual(resp.status_code, 403)
            resp_run = self.client.post("/api/redesign/simulation/run", json={"latitude": 21.867, "longitude": 86.500}, headers=headers)
            self.assertEqual(resp_run.status_code, 403)

    def test_simulation_domain_metadata(self):
        with mock.patch("app.core.security.RESQ_SECRET_KEY", TEST_KEY):
            resp = self.client.get("/api/redesign/simulation/domain", headers=self._headers(self.officer_token))
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("bounds", data)
            self.assertIn("center", data)
            self.assertIn("grid", data)
            self.assertIn("assumptions", data)
            self.assertEqual(data["grid"]["rows"], 40)
            self.assertEqual(data["grid"]["columns"], 40)

    def test_simulation_rejects_point_outside_domain(self):
        with mock.patch("app.core.security.RESQ_SECRET_KEY", TEST_KEY):
            resp = self.client.post(
                "/api/redesign/simulation/run",
                json={"latitude": 10.0, "longitude": 70.0, "duration_hours": 6},
                headers=self._headers(self.officer_token),
            )
            self.assertEqual(resp.status_code, 422)
            self.assertIn("outside", resp.json()["detail"].lower())

    def test_simulation_rejects_invalid_duration(self):
        with mock.patch("app.core.security.RESQ_SECRET_KEY", TEST_KEY):
            resp = self.client.post(
                "/api/redesign/simulation/run",
                json={"latitude": 21.867894, "longitude": 86.500688, "duration_hours": 0},
                headers=self._headers(self.officer_token),
            )
            self.assertEqual(resp.status_code, 422)

    def test_interactive_simulation_stays_disabled_without_invoking_runner(self):
        with mock.patch("app.core.security.RESQ_SECRET_KEY", TEST_KEY):
            with mock.patch("app.services.simulation_service.execute_isolated_simulation") as runner:
                resp = self.client.post(
                    "/api/redesign/simulation/run",
                    json={"latitude": 21.867894, "longitude": 86.500688, "duration_hours": 2},
                    headers=self._headers(self.officer_token),
                )
            self.assertEqual(resp.status_code, 503)
            self.assertIn("saved example", resp.json()["detail"])
            runner.assert_not_called()

    def test_interactive_simulation_requires_csrf_before_disabled_response(self):
        with mock.patch("app.core.security.RESQ_SECRET_KEY", TEST_KEY):
            with mock.patch("app.services.simulation_service.execute_isolated_simulation") as runner:
                resp = self.client.post(
                    "/api/redesign/simulation/run",
                    json={"latitude": 21.867894, "longitude": 86.500688, "duration_hours": 2},
                    headers={"Authorization": f"Bearer {self.officer_token}"},
                )
            self.assertEqual(resp.status_code, 403)
            runner.assert_not_called()


if __name__ == "__main__":
    unittest.main()
