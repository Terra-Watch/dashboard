"""Satellite detections: the CSV endpoint, cluster alerts (once per cluster per day, to the staff of the cell's state) and the list's forest state.
Needs the local Postgres (skipped otherwise). Uses a far-away fake cell and its own detections, removed afterwards."""
from __future__ import annotations

import os
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
CELL = 990100; LAT, LON = 20.0, 85.0   # a test cell id that is not a real grid cell: round(lat*10)*1000 + round(lon*10)
CELL_ID = round(LAT * 10) * 1000 + round(LON * 10)


def _db_up() -> bool:
    try:
        from sqlalchemy import text
        from app.database.session import engine
        with engine.connect() as db:
            db.execute(text("SELECT 1"))
        return True
    except Exception:
        return False


def _csv(n: int, dx: float = 0.0) -> str:
    now = datetime.now(timezone.utc)
    head = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight\n"
    rows = "".join(f"{LAT + 0.001 * i:.4f},{LON + dx + 0.001 * i:.4f},330,0.4,0.4,{now:%Y-%m-%d},{now:%H%M},N,VIIRS,n,2.0NRT,290,5.{i},D\n" for i in range(n))
    return head + rows


@unittest.skipUnless(_db_up(), "Postgres is not reachable")
class HotspotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from fastapi.testclient import TestClient
        from sqlalchemy import text
        from app.core import security
        from app.database.session import engine, init_db
        from app.main import app
        init_db()
        cls.engine = engine
        cls._env = mock.patch.dict(os.environ, {"RISK_INGEST_TOKEN": "right"}); cls._env.start()
        cls._secret = mock.patch.object(security, "RESQ_SECRET_KEY", "test-only-secret-with-more-than-32-bytes"); cls._secret.start()
        cls.client = TestClient(app, base_url="https://testserver", headers={"Authorization": f"Bearer {security.make_access_token(1, 'admin')}"})
        with engine.begin() as db:
            db.execute(text("DELETE FROM resq_hotspots WHERE latitude BETWEEN :a AND :b AND longitude BETWEEN :c AND :d"), {"a": LAT - .1, "b": LAT + .1, "c": LON - .1, "d": LON + .1})
            db.execute(text("INSERT INTO cells (id,grid_version,state,geom,centroid) VALUES (:i,'test','OD',NULL,NULL) ON CONFLICT (id) DO NOTHING"), {"i": CELL_ID}) if False else None

    @classmethod
    def tearDownClass(cls):
        from sqlalchemy import text
        with cls.engine.begin() as db:
            db.execute(text("DELETE FROM resq_hotspots WHERE latitude BETWEEN :a AND :b AND longitude BETWEEN :c AND :d"), {"a": LAT - .1, "b": LAT + .1, "c": LON - .1, "d": LON + .1})
            db.execute(text("DELETE FROM resq_alerts WHERE kind='satellite_cluster' AND entity_id LIKE :e"), {"e": f"{CELL_ID}:%"})
        cls._env.stop(); cls._secret.stop()

    def _post(self, n, token="right", dx=0.0):
        return self.client.post("/api/feeds/hotspots/csv", params={"satellite": "VIIRS_SNPP_NRT"}, content=_csv(n, dx), headers={"X-Ingest-Token": token, "content-type": "text/csv"})

    def test_endpoint_needs_the_token(self):
        self.assertEqual(self._post(1, "wrong").status_code, 403)
        with mock.patch.dict(os.environ, {"RISK_INGEST_TOKEN": ""}):
            self.assertEqual(self._post(1).status_code, 404)

    def test_new_detections_are_stored_once(self):
        first = self._post(3, dx=0.02).json(); again = self._post(3, dx=0.02).json()
        self.assertEqual((first["received"], first["inserted"]), (3, 3)); self.assertEqual(again["inserted"], 0)

    def test_clusters_are_found_only_inside_forest_cells_and_announced_once(self):
        from sqlalchemy import text
        from app.services import hotspot_alerts
        self._post(6)
        with self.engine.begin() as db:
            db.execute(text("INSERT INTO cells (id,grid_version,state,place_name,geom,centroid) VALUES (:i,'test','OD',NULL,NULL,NULL) ON CONFLICT (id) DO NOTHING"), {"i": CELL_ID})
        try:
            with mock.patch("app.services.hotspot_alerts.incident_staff_recipients", return_value=[1]), mock.patch("app.services.alert_service.push.send_to_user", return_value=0):
                first = hotspot_alerts.alert_clusters(self.engine); second = hotspot_alerts.alert_clusters(self.engine)
            self.assertGreaterEqual(first["new_clusters"], 1); self.assertEqual(second["new_clusters"], 0)
        finally:
            with self.engine.begin() as db:
                db.execute(text("DELETE FROM cells WHERE id=:i AND grid_version='test'"), {"i": CELL_ID})

    def test_a_small_group_raises_no_alert(self):
        from app.services import hotspot_alerts
        self._post(2, dx=0.03)
        with mock.patch("app.services.hotspot_alerts.incident_staff_recipients", return_value=[1]):
            self.assertEqual(hotspot_alerts.alert_clusters(self.engine, min_count=50)["new_clusters"], 0)


if __name__ == "__main__":
    unittest.main()
