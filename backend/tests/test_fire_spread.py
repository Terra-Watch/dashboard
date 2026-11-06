"""The fire spread route serves the files of the scoring job read-only, only for fires the person may see, and rejects anything that is not a plain run or event name."""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.core import security
from app.routers import fire_spread

UK = (30.3, 78.0)          # tag_state: UK
OD = (20.3, 85.8)          # tag_state: OD


class FireSpreadTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        root = Path(cls.tmp.name)
        run = root / "replay-20250312T1200"
        run.mkdir()
        fires = [{"event": "a1", "lat": UK[0], "lon": UK[1]}, {"event": "b2", "lat": OD[0], "lon": OD[1]}]
        json.dump({"run": run.name, "mode": "replay", "fires": fires, "note": "ranking"}, open(run / "events.json", "w"))
        json.dump({"validated": True}, open(root / "skill.json", "w"))
        for e in ("a1", "b2"):
            json.dump({"type": "FeatureCollection", "features": [], "event": e}, open(run / f"{e}_48h.geojson", "w"))
            json.dump({"type": "FeatureCollection", "features": []}, open(run / f"{e}_pixels.geojson", "w"))
            json.dump({"type": "FeatureCollection", "features": [], "burned": True}, open(run / f"{e}_burned_48h.geojson", "w"))
            json.dump({"type": "FeatureCollection", "features": []}, open(run / f"{e}_places_48h.geojson", "w"))
        json.dump({"own": True}, open(run / "skill.json", "w"))
        cls._env = patch.dict(os.environ, {"FIRE_SPREAD_DIR": str(root)})
        cls._env.start()
        cls._secret = patch.object(security, "RESQ_SECRET_KEY", "test-only-secret-with-more-than-32-bytes")
        cls._secret.start()
        cls._active = patch.object(security, "_confirm_active", side_effect=lambda identity: identity)
        cls._active.start()
        app = FastAPI()
        app.include_router(fire_spread.router)
        cls.app = app

    @classmethod
    def tearDownClass(cls) -> None:
        for p in (cls._active, cls._secret, cls._env):
            p.stop()
        cls.tmp.cleanup()

    def client(self, role="admin"):
        return TestClient(self.app, headers={"Authorization": f"Bearer {security.make_access_token(1, role)}"})

    def test_admin_sees_every_fire_and_the_skill_numbers(self):
        body = self.client().get("/api/fire-spread/runs/latest").json()
        self.assertEqual({f["event"] for f in body["fires"]}, {"a1", "b2"})
        self.assertEqual(body["skill"], {"own": True})           # the run carries its own skill file

    def test_a_person_scoped_to_one_state_sees_only_that_fire(self):
        with patch.object(fire_spread, "ranger_communities", return_value=None), patch.object(fire_spread, "user_scopes", return_value={"UK"}):
            c = self.client("range_officer")
            self.assertEqual([f["event"] for f in c.get("/api/fire-spread/runs/latest").json()["fires"]], ["a1"])
            self.assertEqual(c.get("/api/fire-spread/replay-20250312T1200/a1/48").status_code, 200)
            self.assertEqual(c.get("/api/fire-spread/replay-20250312T1200/b2/48").status_code, 404)      # another state's fire is not shown by guessing its name

    def test_horizon_and_names_are_checked(self):
        c = self.client()
        self.assertEqual(c.get("/api/fire-spread/replay-20250312T1200/a1/72").status_code, 404)
        self.assertEqual(c.get("/api/fire-spread/replay-20250312T1200/a1/24").status_code, 404)      # no such file written
        self.assertEqual(c.get("/api/fire-spread/replay-20250312T1200/a1/pixels").status_code, 200)
        self.assertEqual(c.get("/api/fire-spread/..%2F..%2Fetc/a1/48").status_code, 404)
        self.assertEqual(c.get("/api/fire-spread/replay-20250312T1200/..%2Fa1/48").status_code, 404)

    def test_the_burned_overlay_and_a_run_specific_skill(self):
        c = self.client()
        self.assertEqual(c.get("/api/fire-spread/replay-20250312T1200/a1/burned/48").json()["burned"], True)
        self.assertEqual(c.get("/api/fire-spread/replay-20250312T1200/a1/burned/24").status_code, 404)      # no such file written
        self.assertEqual(c.get("/api/fire-spread/replay-20250312T1200/b2/burned/48").status_code, 200)
        own = Path(self.tmp.name) / "replay-20250312T1200" / "skill.json"; own.rename(own.with_suffix(".off"))
        try: self.assertEqual(c.get("/api/fire-spread/runs/latest").json()["skill"], {"validated": True})      # without one, the folder's skill file is used
        finally: own.with_suffix(".off").rename(own)

    def test_places_layer_is_served_and_checked(self):
        c = self.client()
        self.assertEqual(c.get("/api/fire-spread/replay-20250312T1200/a1/layer/places/48").status_code, 200)
        self.assertEqual(c.get("/api/fire-spread/replay-20250312T1200/a1/layer/roads/48").status_code, 404)       # no such file written
        self.assertEqual(c.get("/api/fire-spread/replay-20250312T1200/a1/layer/secrets/48").status_code, 404)      # only places and roads

    def test_a_role_without_risk_access_is_refused(self):
        self.assertEqual(self.client("citizen").get("/api/fire-spread/runs/latest").status_code, 403)

    def test_the_latest_run_is_the_one_with_the_latest_moment_whatever_its_name(self):
        with tempfile.TemporaryDirectory() as root:
            for name, at in (("replay-2025", "2025-03-12 12:00:00+00:00"), ("live-2026", "2026-11-04 08:17:00+00:00"), ("a-old", "2020-01-01 00:00:00+00:00")):
                (Path(root) / name).mkdir()
                json.dump({"run": name, "mode": "x", "fires": [], "at": at, "note": ""}, open(Path(root) / name / "events.json", "w"))
            with patch.dict(os.environ, {"FIRE_SPREAD_DIR": root}):
                self.assertEqual(self.client().get("/api/fire-spread/runs/latest").json()["run"], "live-2026")

    def test_the_archived_runs_shipped_with_the_code_are_the_default(self):
        with patch.dict(os.environ, {"FIRE_SPREAD_DIR": ""}):
            self.assertTrue(any(fire_spread._root().glob("*/events.json")))                       # a deployment without runtime_data still has a run to show

    def test_no_run_gives_a_plain_404(self):
        with tempfile.TemporaryDirectory() as empty, patch.dict(os.environ, {"FIRE_SPREAD_DIR": empty}):
            self.assertEqual(self.client().get("/api/fire-spread/runs/latest").status_code, 404)


if __name__ == "__main__":
    unittest.main()
