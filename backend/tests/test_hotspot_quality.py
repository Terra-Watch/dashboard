"""Quality groups of detections: the posted rows are checked one by one (a bad row never stops the others), the endpoint needs the shared secret, and the stored key matches the hotspot key."""
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.routers_ext import feeds
from app.services import hotspot_quality as Q

ROW = {"satellite": "VIIRS_SNPP_NRT", "acq_date": "2026-11-05", "acq_time": "0705", "latitude": 20.1, "longitude": 80.2, "group": "likely", "p_scar": 0.5, "reasons": ["seen_again", "junk"]}


class CleanTests(unittest.TestCase):
    def test_a_good_row_gets_the_hotspot_time_and_only_known_reasons(self):
        rows, bad = Q.clean([ROW]); self.assertEqual(bad, 0)
        self.assertEqual(rows[0]["acq_datetime"], datetime(2026, 11, 5, 7, 5, tzinfo=timezone.utc)); self.assertEqual(rows[0]["reasons"], ["seen_again"]); self.assertEqual(rows[0]["grp"], "likely")

    def test_bad_rows_are_counted_and_do_not_stop_the_good_ones(self):
        items = [ROW, {**ROW, "group": "maybe"}, {**ROW, "satellite": "MODIS"}, {**ROW, "latitude": 95}, {**ROW, "p_scar": 1.5}, {**ROW, "acq_time": "x"}, {"satellite": "VIIRS_SNPP_NRT"}, {**ROW, "p_scar": None}]
        rows, bad = Q.clean(items); self.assertEqual((len(rows), bad), (2, 6)); self.assertIsNone(rows[1]["p_scar"])


class EndpointTests(unittest.TestCase):
    def client(self):
        app = FastAPI(); app.include_router(feeds.router); return TestClient(app)

    def test_it_needs_the_shared_secret_and_stores_the_clean_rows(self):
        with patch.object(feeds.risk_settings, "ingest_token", return_value="s3cret"), patch.object(feeds.hotspot_quality, "store", return_value=1) as store:
            c = self.client(); body = {"items": [ROW, {**ROW, "group": "nope"}]}
            self.assertEqual(c.post("/api/feeds/hotspots/quality", json=body).status_code, 403)
            self.assertEqual(c.post("/api/feeds/hotspots/quality", json=body, headers={"X-Ingest-Token": "bad"}).status_code, 403)
            ok = c.post("/api/feeds/hotspots/quality", json=body, headers={"X-Ingest-Token": "s3cret"})
            self.assertEqual((ok.status_code, ok.json()), (200, {"stored": 1, "refused": 1})); self.assertEqual(len(store.call_args.args[0]), 1)

    def test_it_is_off_without_a_secret(self):
        with patch.object(feeds.risk_settings, "ingest_token", return_value=""):
            self.assertEqual(self.client().post("/api/feeds/hotspots/quality", json={"items": []}, headers={"X-Ingest-Token": "x"}).status_code, 404)

    def test_the_hotspot_lists_carry_the_group(self):
        for col in ("quality_group", "quality_p", "quality_reasons"):
            self.assertIn(f"AS {col}", feeds._COLS)


if __name__ == "__main__":
    unittest.main()
