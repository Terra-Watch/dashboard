"""Live-run path: import a scoring-job run, then read it back through /api/risk/geojson and /api/risk/status.
Needs the local Postgres (skipped when it is not reachable). The test run uses a unique model version and removes itself afterwards.
Run: backend/.venv/bin/python -m pytest backend/tests/test_risk_live.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest import mock

import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

VERSION = "test-live-run"
FORECAST = date.today() + timedelta(days=400)  # far from any real run


def _db_up() -> bool:
    try:
        from sqlalchemy import text
        from app.database.session import engine
        with engine.connect() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def _write_run(directory: str) -> None:
    bands = [{"name": "Very high", "top_share": 0.34}, {"name": "High", "top_share": 0.67}, {"name": "Low", "top_share": 1.0}]
    info = {"model_id": "fixture", "model_version": VERSION, "bundle_sha256": "0" * 64, "issue_day": str(FORECAST - timedelta(days=1)), "forecast_date": str(FORECAST),
            "mode": "live", "status": "complete", "bands": bands, "degraded": ["ndvi_climatology"],
            "coverage": {"cells_scored": 3, "cells_in_grid": 3, "share": 1.0, "missing_states": []}, "data_cutoffs": {"weather": "x", "fire": "x", "gfs": True}}
    (Path(directory) / "run.json").write_text(json.dumps(info))
    pd.DataFrame({"cell_id": [990001, 990002, 990003], "state": ["OD", "OD", "OD"], "lat": [20.0, 20.1, 20.2], "lon": [85.0, 85.1, 85.2],
                  "rank": [1, 2, 3], "rank_percentile": [100.0, 50.0, 0.0], "band": ["Very high", "High", "Low"]}).to_csv(Path(directory) / "scores.csv", index=False)


@unittest.skipUnless(_db_up(), "Postgres is not reachable")
class LiveRunTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from app.core import security
        from app.database.session import init_db
        from app.main import app
        init_db()
        cls._secret = mock.patch.object(security, "RESQ_SECRET_KEY", "test-only-secret-with-more-than-32-bytes"); cls._secret.start()
        cls._env = mock.patch.dict(os.environ, {"RISK_FORECAST_ENABLED": "true"}); cls._env.start()
        cls.client = TestClient(app, base_url="https://testserver", headers={"Authorization": f"Bearer {security.make_access_token(1, 'admin')}"})
        cls.dir = tempfile.mkdtemp(prefix="resq_live_run_"); _write_run(cls.dir)
        from inference.import_live_run import import_run
        cls.imported = import_run(Path(cls.dir))

    @classmethod
    def tearDownClass(cls):
        from sqlalchemy import text
        from app.database.session import engine
        with engine.begin() as db:
            db.execute(text("DELETE FROM forecast_runs WHERE model_version LIKE :v"), {"v": VERSION + "%"})
            db.execute(text("DELETE FROM cells WHERE id IN (990001,990002,990003)"))
        cls._env.stop(); cls._secret.stop()

    def _payload(self, **over):
        info = json.loads((Path(self.dir) / "run.json").read_text()); info["model_version"] = VERSION + "-api"; info.update(over)
        return {"run": info, "rows": pd.read_csv(Path(self.dir) / "scores.csv").to_dict("records")}

    def test_ingest_endpoint_is_off_without_a_token(self):
        with mock.patch.dict(os.environ, {"RISK_INGEST_TOKEN": ""}):
            self.assertEqual(self.client.post("/api/risk/runs", json=self._payload()).status_code, 404)

    def test_ingest_endpoint_checks_the_token(self):
        with mock.patch.dict(os.environ, {"RISK_INGEST_TOKEN": "right"}):
            self.assertEqual(self.client.post("/api/risk/runs", json=self._payload(), headers={"X-Ingest-Token": "wrong"}).status_code, 403)
            self.assertEqual(self.client.post("/api/risk/runs", json=self._payload()).status_code, 403)

    def test_ingest_endpoint_stores_a_run_and_refuses_raw_scores(self):
        with mock.patch.dict(os.environ, {"RISK_INGEST_TOKEN": "right"}):
            ok = self.client.post("/api/risk/runs", json=self._payload(), headers={"X-Ingest-Token": "right"})
            self.assertEqual((ok.status_code, ok.json()), (200, {"imported": 3}))
            bad = self._payload(); [r.update(score=0.5) for r in bad["rows"]]
            self.assertEqual(self.client.post("/api/risk/runs", json=bad, headers={"X-Ingest-Token": "right"}).status_code, 422)

    def test_all_cells_imported(self):
        self.assertEqual(self.imported, 3)

    def test_geojson_serves_the_run_with_its_metadata(self):
        body = self.client.get("/api/risk/geojson", params={"target": FORECAST.isoformat()}).json()
        self.assertEqual(len(body["features"]), 3)
        self.assertEqual(body["run"]["mode"], "live")
        self.assertEqual(body["run"]["degraded"], ["ndvi_climatology"])
        self.assertEqual({f["properties"]["band"] for f in body["features"]}, {"Very high", "High", "Low"})
        self.assertNotIn("score", body["features"][0]["properties"])  # raw scores never leave the server

    def test_high_only_filter_keeps_the_top_bands(self):
        body = self.client.get("/api/risk/geojson", params={"target": FORECAST.isoformat(), "risk_band": "high"}).json()
        self.assertEqual({f["properties"]["band"] for f in body["features"]}, {"Very high", "High"})

    def test_status_reports_the_newest_live_run(self):
        runs = self.client.get("/api/risk/status").json()["runs"]
        self.assertEqual(runs["live"]["forecast_date"], FORECAST.isoformat())
        self.assertIn("stale", runs["live"])

    def test_reimport_replaces_scores_instead_of_duplicating(self):
        from inference.import_live_run import import_run
        import_run(Path(self.dir))
        body = self.client.get("/api/risk/geojson", params={"target": FORECAST.isoformat()}).json()
        self.assertEqual(len(body["features"]), 3)


if __name__ == "__main__":
    unittest.main()
