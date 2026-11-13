"""The area forecast route serves the job's files read-only, scoped to the person, never model scores, and rejects anything that is not a plain date."""
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
from app.routers import area_forecast

LV = [{"id": "none", "min_chance": 0.0}, {"id": "moderate", "min_chance": 0.1}, {"id": "high", "min_chance": 0.3}]


def day(date, mode="replay"):
    areas = [{"id": 1, "state": "OD", "lat": 20.2, "lon": 85.2, "bbox": [85.0, 20.0, 85.5, 20.5], "level": "high", "chance": 0.5}, {"id": 2, "state": "UK", "lat": 30.1, "lon": 78.1, "bbox": [78.0, 30.0, 78.5, 30.5], "level": "none", "chance": 0.01}]
    return {"date": date, "mode": mode, "levels": LV, "actions": [], "areas": areas, "summary": {"none": 1, "moderate": 0, "high": 1}, "areas_scored": 2, "outcome": {"areas_with_fire": 1}}


class AreaForecastTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(); root = Path(cls.tmp.name)
        for d in ("2025-03-14", "2025-03-15"):
            json.dump(day(d), open(root / f"{d}.json", "w"))
        (root / "index.json").write_text("{}")
        cls._env = patch.dict(os.environ, {"FIRE_FORECAST_DIR": str(root)}); cls._env.start()
        cls._secret = patch.object(security, "RESQ_SECRET_KEY", "test-only-secret-with-more-than-32-bytes"); cls._secret.start()
        cls._active = patch.object(security, "_confirm_active", side_effect=lambda identity: identity); cls._active.start()
        app = FastAPI(); app.include_router(area_forecast.router); cls.app = app

    @classmethod
    def tearDownClass(cls):
        for p in (cls._active, cls._secret, cls._env):
            p.stop()
        cls.tmp.cleanup()

    def client(self, role="admin"):
        return TestClient(self.app, headers={"Authorization": f"Bearer {security.make_access_token(1, role)}"})

    def test_dates_and_latest(self):
        c = self.client()
        self.assertEqual(c.get("/api/area-forecast/dates").json(), {"dates": ["2025-03-14", "2025-03-15"], "latest": "2025-03-15", "mode": "replay"})
        self.assertEqual(c.get("/api/area-forecast/latest").json()["date"], "2025-03-15")

    def test_admin_sees_all_areas_and_the_outcome_is_not_served(self):
        body = self.client().get("/api/area-forecast/2025-03-14").json()
        self.assertEqual((body["scope"], len(body["areas"])), ("all", 2)); self.assertNotIn("outcome", body)

    def test_the_archive_shows_what_was_detected_and_the_live_routes_never_do(self):
        with tempfile.TemporaryDirectory() as tmp:
            d = day("2025-03-15"); d["areas"][0]["fire_detected"] = True; d["areas"][1]["fire_detected"] = True
            d["areas"][0]["id"], d["areas"][1]["id"] = 40170, 60156   # block ids of the two fire squares below
            d["fire_cells"] = [[20.25, 85.25], [30.15, 78.15]]; (Path(tmp) / "index.json").write_text(json.dumps({"typical": {"active_days": 9}, "scenes": [{"id": "2025-03-15-OD", "date": "2025-03-15", "state": "OD"}]}))
            (Path(tmp) / "2025-03-15.json").write_text(json.dumps(d))
            with patch.object(area_forecast, "_archive_root", return_value=Path(tmp)):
                c = self.client()
                self.assertEqual(c.get("/api/area-forecast/archive/dates").json(), {"dates": ["2025-03-15"], "latest": "2025-03-15", "mode": "replay", "scenes": [{"id": "2025-03-15-OD", "date": "2025-03-15", "state": "OD"}], "typical": {"active_days": 9}})
                body = c.get("/api/area-forecast/archive/2025-03-15").json()
                self.assertEqual(body["outcome"], {"areas_with_fire": 2, "in_high_or_extreme": 1, "areas_rated_high_or_extreme": 1, "of_those_with_fire": 1})
                self.assertTrue(all(a["fire_detected"] for a in body["areas"])); self.assertEqual(len(body["fire_cells"]), 2)
                with patch.object(area_forecast, "ranger_communities", return_value=None), patch.object(area_forecast, "user_scopes", return_value={"UK"}):
                    scoped = self.client("control_room_operator").get("/api/area-forecast/archive/2025-03-15").json()
                self.assertEqual(scoped["outcome"], {"areas_with_fire": 1, "in_high_or_extreme": 0, "areas_rated_high_or_extreme": 0, "of_those_with_fire": 0}); self.assertEqual(scoped["fire_cells"], [[30.15, 78.15]])   # only the areas the person may see
                self.assertEqual(c.get("/api/area-forecast/archive/2025-03-16").status_code, 404)
        live = self.client().get("/api/area-forecast/2025-03-14").json()
        self.assertNotIn("outcome", live); self.assertNotIn("fire_cells", live); self.assertTrue(all("fire_detected" not in a for a in live["areas"]))

    def test_a_person_scoped_to_a_state_sees_only_its_areas_and_counts_follow(self):
        with patch.object(area_forecast, "ranger_communities", return_value=None), patch.object(area_forecast, "user_scopes", return_value={"OD"}):
            body = self.client("control_room_operator").get("/api/area-forecast/2025-03-14").json()
        self.assertEqual(([a["id"] for a in body["areas"]], body["scope"], body["summary"]), ([1], "state", {"none": 0, "moderate": 0, "high": 1}))

    def test_a_ranger_sees_the_areas_inside_the_community(self):
        with patch.object(area_forecast, "ranger_communities", return_value=[7]), patch.object(area_forecast, "touches_communities", side_effect=lambda ids, bbox: bbox[1] < 25):
            body = self.client("range_officer").get("/api/area-forecast/2025-03-14").json()
        self.assertEqual(([a["id"] for a in body["areas"]], body["scope"]), ([1], "community"))

    def test_dates_are_checked_and_roles_are_gated(self):
        c = self.client()
        for bad in ("2025-03-16", "..%2F..%2Fetc", "latest2", "2025-3-14"):
            self.assertEqual(c.get(f"/api/area-forecast/{bad}").status_code, 404, bad)
        self.assertEqual(self.client("citizen").get("/api/area-forecast/latest").status_code, 403)

    def test_field_crew_read_the_forecast_scoped_to_their_states(self):
        c = self.client("field_crew")
        self.assertEqual(c.get("/api/area-forecast/archive/dates").status_code in (200, 404), True)       # allowed: 404 only when no archive is shipped
        r = c.get("/api/area-forecast/2025-03-14")
        self.assertEqual(r.status_code, 200); self.assertIn(r.json()["scope"], ("state", "community"))

    def test_a_ranger_is_offered_only_the_demo_scenes_of_their_own_state(self):
        with patch.object(area_forecast, "ranger_communities", return_value=[]), patch.object(area_forecast, "user_scopes", return_value={"OD"}):
            scenes = self.client("field_crew").get("/api/area-forecast/archive/dates").json()["scenes"]
        self.assertEqual({sc["state"] for sc in scenes}, {"OD"})
        everyone = self.client("admin").get("/api/area-forecast/archive/dates").json()["scenes"]
        self.assertGreater(len(everyone), len(scenes))

    def test_no_forecast_gives_a_plain_404(self):
        with tempfile.TemporaryDirectory() as empty, patch.dict(os.environ, {"FIRE_FORECAST_DIR": empty}):
            self.assertEqual(self.client().get("/api/area-forecast/latest").status_code, 404)

    def test_the_job_posts_a_forecast_with_the_shared_secret_and_it_is_then_served(self):
        body = {**day("2025-04-01", mode="live"), "areas": day("2025-04-01")["areas"]}
        with tempfile.TemporaryDirectory() as root, patch.dict(os.environ, {"FIRE_FORECAST_DIR": root}), patch.object(area_forecast.risk_settings, "ingest_token", return_value="s3cret"):
            c = TestClient(self.app)
            self.assertEqual(c.post("/api/area-forecast/runs", json=body).status_code, 403)                                   # no token
            self.assertEqual(c.post("/api/area-forecast/runs", json=body, headers={"X-Ingest-Token": "wrong"}).status_code, 403)
            ok = c.post("/api/area-forecast/runs", json=body, headers={"X-Ingest-Token": "s3cret"}); self.assertEqual((ok.status_code, ok.json()["stored"]), (200, "2025-04-01"))
            self.assertTrue((Path(root) / "2025-04-01.json").is_file())
            self.assertEqual(self.client().get("/api/area-forecast/latest").json()["date"], "2025-04-01")
            for bad in ({**body, "date": "../x"}, {**body, "areas": []}, {**body, "areas": [{**body["areas"][0], "score": 0.9}]}, {"date": "2025-04-02"}):
                self.assertEqual(c.post("/api/area-forecast/runs", json=bad, headers={"X-Ingest-Token": "s3cret"}).status_code, 422)

    def test_posting_is_off_when_no_shared_secret_is_set(self):
        with patch.object(area_forecast.risk_settings, "ingest_token", return_value=""):
            self.assertEqual(TestClient(self.app).post("/api/area-forecast/runs", json=day("2025-04-01"), headers={"X-Ingest-Token": "x"}).status_code, 404)

    def test_the_replay_days_shipped_with_the_code_are_the_default(self):
        with patch.dict(os.environ, {"FIRE_FORECAST_DIR": ""}):
            self.assertTrue(len(area_forecast._dates()) >= 1)


if __name__ == "__main__":
    unittest.main()


class BurningNowTests(unittest.TestCase):
    def test_counts_by_group_and_ignores_outside_forest(self):
        from app.routers.area_forecast import attach_burning
        areas = [{"id": 40170}, {"id": 40171}]
        attach_burning(areas, [(40170, "likely", 3), (40170, "unconfirmed", 2), (40170, "outside_forest", 9), (99, "likely", 1)])
        self.assertEqual(areas[0]["burning_now"], {"likely": 3, "unconfirmed": 2}); self.assertNotIn("burning_now", areas[1])
