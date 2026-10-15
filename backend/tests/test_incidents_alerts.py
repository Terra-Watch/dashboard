"""Tests for Incident lifecycle, history audit trail, and Alert generation & deduplication (Domains B & C)."""
import os
import sys
import unittest
import uuid
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

os.environ["RESQ_SECRET_KEY"] = "test-signing-secret-key-at-least-32-bytes-long"

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402
from app.database.session import init_db  # noqa: E402
from app.core.security import make_token  # noqa: E402
from tests.test_auth import make_user  # noqa: E402


class IncidentsAndAlertsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        cls.client = TestClient(app, base_url="https://testserver")

    def _auth_header(self, role: str, scopes: list[str] | None = None) -> dict[str, str]:
        user_id, _ = make_user(role, scopes=scopes)
        token = make_token(user_id, role)
        return {"Authorization": f"Bearer {token}"}

    def test_incident_lifecycle_and_history(self):
        headers = self._auth_header("officer", scopes=["OD"])
        client_key = f"inc-{uuid.uuid4().hex[:8]}"

        # 1. Create incident
        create_resp = self.client.post(
            "/api/incidents",
            json={
                "client_key": client_key,
                "source": "lookout_tower",
                "size": "moderate",
                "notes": "Smoke detected near Similipal sector 4",
                "state": "OD",
            },
            headers=headers,
        )
        self.assertEqual(create_resp.status_code, 201)
        incident_id = create_resp.json()["id"]
        self.assertEqual(create_resp.json()["status"], "reported")

        # 2. Update status through valid transitions
        for next_status in ("verified", "responding", "contained", "closed"):
            update_resp = self.client.patch(
                f"/api/incidents/{incident_id}/status",
                json={"status": next_status, "notes": f"Transitioned to {next_status}"},
                headers=headers,
            )
            self.assertEqual(update_resp.status_code, 200)
            self.assertEqual(update_resp.json()["status"], next_status)

        # 3. Retrieve history audit trail
        hist_resp = self.client.get(f"/api/incidents/{incident_id}/history", headers=headers)
        self.assertEqual(hist_resp.status_code, 200)
        history = hist_resp.json()["history"]
        actions = [entry["action"] for entry in history]
        self.assertIn("incident_created", actions)
        self.assertIn("incident_status_verified", actions)
        self.assertIn("incident_status_responding", actions)
        self.assertIn("incident_status_contained", actions)
        self.assertIn("incident_status_closed", actions)

    def test_incident_scope_isolation(self):
        # Create incident in TS
        ts_headers = self._auth_header("officer", scopes=["TS"])
        client_key = f"inc-ts-{uuid.uuid4().hex[:8]}"
        created = self.client.post(
            "/api/incidents",
            json={"client_key": client_key, "source": "patrol", "size": "small", "state": "TS"},
            headers=ts_headers,
        )
        self.assertEqual(created.status_code, 201)
        inc_id = created.json()["id"]

        # User scoped only to OD should receive 403 on this incident
        od_headers = self._auth_header("officer", scopes=["OD"])
        denied_get = self.client.get(f"/api/incidents/{inc_id}", headers=od_headers)
        self.assertEqual(denied_get.status_code, 403)

        denied_update = self.client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "verified"},
            headers=od_headers,
        )
        self.assertEqual(denied_update.status_code, 403)

    def test_alert_generation_and_deduplication(self):
        headers = self._auth_header("officer", scopes=["OD"])
        unique_entity = f"sensor-{uuid.uuid4().hex[:8]}"

        # 1. First alert should be newly created
        alert1 = self.client.post(
            "/api/alerts",
            json={
                "kind": "thermal_anomaly",
                "message": f"High thermal signature on {unique_entity}",
                "state": "OD",
                "severity": "critical",
                "entity_type": "sensor",
                "entity_id": unique_entity,
            },
            headers=headers,
        )
        self.assertEqual(alert1.status_code, 201)
        data1 = alert1.json()
        self.assertFalse(data1["deduplicated"])
        alert_id = data1["id"]

        # 2. Second alert within 15 min for same entity & kind should be deduplicated
        alert2 = self.client.post(
            "/api/alerts",
            json={
                "kind": "thermal_anomaly",
                "message": f"High thermal signature on {unique_entity} repeat",
                "state": "OD",
                "severity": "critical",
                "entity_type": "sensor",
                "entity_id": unique_entity,
            },
            headers=headers,
        )
        self.assertEqual(alert2.status_code, 201)
        data2 = alert2.json()
        self.assertTrue(data2["deduplicated"])
        self.assertEqual(data2["id"], alert_id)

    def test_alert_lifecycle_transitions(self):
        headers = self._auth_header("officer", scopes=["OD"])
        alert_resp = self.client.post(
            "/api/alerts",
            json={
                "kind": "wind_shift",
                "message": "Sudden wind shift detected",
                "state": "OD",
                "severity": "warning",
            },
            headers=headers,
        )
        self.assertEqual(alert_resp.status_code, 201)
        alert_id = alert_resp.json()["id"]

        # Acknowledge
        ack_resp = self.client.patch(f"/api/alerts/{alert_id}/acknowledge", headers=headers)
        self.assertEqual(ack_resp.status_code, 200)
        self.assertEqual(ack_resp.json()["status"], "acknowledged")
        self.assertTrue(ack_resp.json()["read"])

        # Resolve
        res_resp = self.client.patch(f"/api/alerts/{alert_id}/resolve", headers=headers)
        self.assertEqual(res_resp.status_code, 200)
        self.assertEqual(res_resp.json()["status"], "resolved")

    def test_invalid_status_transition_rejected(self):
        headers = self._auth_header("officer", scopes=["OD"])
        client_key = f"inc-trans-{uuid.uuid4().hex[:8]}"
        created = self.client.post(
            "/api/incidents",
            json={"client_key": client_key, "source": "patrol", "size": "small", "state": "OD"},
            headers=headers,
        )
        self.assertEqual(created.status_code, 201)
        inc_id = created.json()["id"]

        # 1. Invalid jump: reported -> contained (must verify or close first)
        bad_jump = self.client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "contained"},
            headers=headers,
        )
        self.assertEqual(bad_jump.status_code, 422)

        # 2. Valid transitions to closed
        self.client.patch(f"/api/incidents/{inc_id}/status", json={"status": "verified"}, headers=headers)
        self.client.patch(f"/api/incidents/{inc_id}/status", json={"status": "closed"}, headers=headers)

        # 3. Transition from closed is terminal: closed -> reported rejected
        reopen_bad = self.client.patch(
            f"/api/incidents/{inc_id}/status",
            json={"status": "reported"},
            headers=headers,
        )
        self.assertEqual(reopen_bad.status_code, 422)

    def test_missing_state_rejected_for_scoped_officer(self):
        headers = self._auth_header("officer", scopes=["OD"])
        client_key = f"inc-nostate-{uuid.uuid4().hex[:8]}"
        # Scoped officer submitting without authoritative state -> 403
        resp = self.client.post(
            "/api/incidents",
            json={"client_key": client_key, "source": "patrol", "size": "small"},
            headers=headers,
        )
        self.assertEqual(resp.status_code, 403)

    def test_alert_scope_enforcement_on_acknowledge_and_resolve(self):
        ts_headers = self._auth_header("officer", scopes=["TS"])
        alert_resp = self.client.post(
            "/api/alerts",
            json={
                "kind": "fire_spread",
                "message": "Rapid spread in Telangana reserve",
                "state": "TS",
                "severity": "critical",
            },
            headers=ts_headers,
        )
        self.assertEqual(alert_resp.status_code, 201)
        alert_id = alert_resp.json()["id"]

        # Officer scoped only to OD cannot acknowledge or resolve TS alert
        od_headers = self._auth_header("officer", scopes=["OD"])
        denied_ack = self.client.patch(f"/api/alerts/{alert_id}/acknowledge", headers=od_headers)
        self.assertEqual(denied_ack.status_code, 403)

        denied_res = self.client.patch(f"/api/alerts/{alert_id}/resolve", headers=od_headers)
        self.assertEqual(denied_res.status_code, 403)

        # In-scope officer can acknowledge
        ok_ack = self.client.patch(f"/api/alerts/{alert_id}/acknowledge", headers=ts_headers)
        self.assertEqual(ok_ack.status_code, 200)

    def test_alert_rule_condition_evaluation(self):
        headers = self._auth_header("admin")
        rule_name = f"Large fire rule {uuid.uuid4().hex[:6]}"
        # Create rule requiring min_size = large in OD
        rule_resp = self.client.post(
            "/api/alerts/rules",
            json={
                "name": rule_name,
                "kind": "incident",
                "enabled": True,
                "state": "OD",
                "severity": "critical",
                "conditions": {"min_size": "large"},
            },
            headers=headers,
        )
        self.assertEqual(rule_resp.status_code, 201)

        # 1. Create small incident in OD: rule should NOT match
        small_key = f"inc-small-{uuid.uuid4().hex[:8]}"
        self.client.post(
            "/api/incidents",
            json={"client_key": small_key, "source": "patrol", "size": "small", "state": "OD"},
            headers=headers,
        )
        alerts_small = self.client.get("/api/alerts", headers=headers).json()
        self.assertFalse(any(rule_name in a.get("message", "") for a in alerts_small))

        # 2. Create critical incident in OD: rule SHOULD match
        crit_key = f"inc-crit-{uuid.uuid4().hex[:8]}"
        self.client.post(
            "/api/incidents",
            json={"client_key": crit_key, "source": "patrol", "size": "critical", "state": "OD"},
            headers=headers,
        )
        alerts_crit = self.client.get("/api/alerts", headers=headers).json()
        self.assertTrue(any(rule_name in a.get("message", "") for a in alerts_crit))

    def test_incident_creation_scope_enforcement(self):
        od_headers = self._auth_header("officer", scopes=["OD"])

        # 1. Missing state fails closed with 403
        resp_no_state = self.client.post(
            "/api/incidents",
            json={"client_key": f"inc-{uuid.uuid4().hex[:8]}", "source": "patrol", "size": "small"},
            headers=od_headers,
        )
        self.assertEqual(resp_no_state.status_code, 403)
        self.assertIn("authoritative state", resp_no_state.json()["detail"])

        # 2. Out-of-division state fails closed with 403
        resp_out_scope = self.client.post(
            "/api/incidents",
            json={"client_key": f"inc-{uuid.uuid4().hex[:8]}", "source": "patrol", "size": "small", "state": "TS"},
            headers=od_headers,
        )
        self.assertEqual(resp_out_scope.status_code, 403)
        self.assertIn("outside your division's scope", resp_out_scope.json()["detail"])

        # 3. Officer with no scopes fails closed with 403
        no_scope_headers = self._auth_header("officer", scopes=[])
        resp_no_scope = self.client.post(
            "/api/incidents",
            json={"client_key": f"inc-{uuid.uuid4().hex[:8]}", "source": "patrol", "size": "small", "state": "OD"},
            headers=no_scope_headers,
        )
        self.assertEqual(resp_no_scope.status_code, 403)

        # 4. In-scope state succeeds with 201
        resp_in_scope = self.client.post(
            "/api/incidents",
            json={"client_key": f"inc-{uuid.uuid4().hex[:8]}", "source": "patrol", "size": "small", "state": "OD"},
            headers=od_headers,
        )
        self.assertEqual(resp_in_scope.status_code, 201)


if __name__ == "__main__":
    unittest.main()
