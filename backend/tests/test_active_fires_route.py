"""The active-fires board: scoped to the person, closed fires and fires seen once left out by default, counts follow, bad ids are a plain 404."""
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core import security  # noqa: E402
from app.routers import active_fires  # noqa: E402


def fire(i, lat, status="growing", multi=True, closed=False, near=1.0, tasked=False):
    return {"id": f"{i:010x}", "lat": lat, "lon": 80.0, "status": status, "multi": multi, "closed": closed, "tasked": tasked, "kind": "likely", "area_km2": 1.0, "n_passes": 2, "age_h": 3,
            "nearest": {"name": "V", "kind": "village", "km": near, "bearing": "N", "on_side": True}, "passes": [{"n": 1}] * 6, "attention": 10}


FIRES = [fire(1, 21.0), fire(2, 28.0, status="steady", near=5, tasked=True), fire(3, 21.1, multi=False, status="new"), fire(4, 21.2, closed=True), fire(5, 21.3, status="out")]


class FiresRouteTests(unittest.TestCase):
    def setUp(self):
        self.p = [patch.object(security, "RESQ_SECRET_KEY", "test-only-secret-with-more-than-32-bytes"), patch.object(security, "_confirm_active", side_effect=lambda i: i), patch.object(active_fires, "_all_fires", return_value=FIRES)]
        [x.start() for x in self.p]; app = FastAPI(); app.include_router(active_fires.router); self.app = app

    def tearDown(self):
        [x.stop() for x in self.p]

    def client(self, role="admin"):
        return TestClient(self.app, headers={"Authorization": f"Bearer {security.make_access_token(1, role)}"})

    def test_board_hides_closed_single_pass_and_out_fires_and_counts(self):
        b = self.client().get("/api/fires").json()
        self.assertEqual([f["id"] for f in b["items"]], [f"{1:010x}", f"{2:010x}"])
        self.assertEqual(b["counts"], {"active": 2, "growing": 1, "near_village": 1, "no_task": 1, "single": 1})
        self.assertEqual(len(b["items"][0]["passes"]), 4)
        self.assertEqual(len(self.client().get("/api/fires?include_single=true").json()["items"]), 3)

    def test_scope_follows_the_person(self):
        with patch.object(active_fires, "_visible", side_effect=lambda fires, user: [f for f in fires if f["lat"] < 25]):
            self.assertEqual([f["id"] for f in self.client("control_room_operator").get("/api/fires").json()["items"]], [f"{1:010x}"])

    def test_roles_and_ids_are_checked(self):
        self.assertEqual(self.client("citizen").get("/api/fires").status_code, 403)
        self.assertEqual(self.client().get("/api/fires/not-an-id").status_code, 404); self.assertEqual(self.client().get("/api/fires/..%2Fx").status_code, 404)


if __name__ == "__main__":
    unittest.main()
