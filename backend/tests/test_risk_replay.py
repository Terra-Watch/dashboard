"""Regression tests for the Bar v3 archived-replay path in /api/risk/geojson.

The RESQ10 audit (docs/ranking/00_audit.md) identified that the endpoint
served an empty FeatureCollection when the replay bundle was absent.  The
bundle has since been generated and is present in backend/models/barv3/.
These tests verify:

  1. daily_geojson returns a non-empty FeatureCollection for the hardcoded
     demo date (2024-03-10) when a valid bundle exists — using a minimal
     in-memory synthetic bundle to avoid dependency on the production files.

  2. GET /api/risk/geojson?target=2024-03-10 returns a valid GeoJSON
     FeatureCollection with at least one feature and the expected structure
     when the bundle is available — Postgres NOT required (the bundle-backed
     code path never touches the DB).

  3. daily_geojson returns an empty FeatureCollection when no bundle is
     present, confirming the graceful-degradation path still works.

Design: a synthetic fixture bundle is created in a temporary directory.
RESQ_MODEL_BUNDLE_DIR is set to point at it so the production code resolves
the correct path without touching the real backend/models/barv3/ files.
The lru_cache on _load and _centers is cleared before each test that changes
the bundle, preventing stale cache entries from confusing test isolation.

Run with: backend/.venv/bin/python -m pytest backend/tests/test_risk_replay.py -v
(from the repository root, as with the other test files in this directory).
"""
from __future__ import annotations

import os
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest import mock

import numpy as np
import pandas as pd

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

DEMO_DATE = date(2024, 3, 10)
DEMO_DAY_NUMBER = (DEMO_DATE - date(1970, 1, 1)).days  # 19792

# Cells must be present in both the npz (cell column) and cell_centers.csv.
FIXTURE_CELLS = [0, 1, 2, 3, 4]
FIXTURE_STATE = "OD"  # one of STATES in barv3.py


def _write_synthetic_bundle(directory: str) -> None:
    """Write a minimal but structurally valid replay bundle to `directory`.

    The npz contains five rows for DEMO_DATE (day=DEMO_DAY_NUMBER) with
    varying scores; the CSV contains matching cell centres.
    This is enough for daily_geojson to return non-empty features.
    """
    cells = np.array(FIXTURE_CELLS, dtype=np.int64)
    day_numbers = np.full(len(FIXTURE_CELLS), DEMO_DAY_NUMBER, dtype=np.int64)
    states = np.array([FIXTURE_STATE] * len(FIXTURE_CELLS))
    p_bagged = np.array([0.9, 0.7, 0.5, 0.3, 0.1], dtype=np.float32)

    np.savez(
        Path(directory) / "bar3_replay_2024.npz",
        cell=cells,
        day=day_numbers,
        state=states,
        p_bagged=p_bagged,
    )

    pd.DataFrame({
        "cell": FIXTURE_CELLS,
        "cx": [1e6 + i * 1000 for i in FIXTURE_CELLS],
        "cy": [2e6 + i * 1000 for i in FIXTURE_CELLS],
        "state": FIXTURE_STATE,
        "lon": [72.0 + i * 0.01 for i in FIXTURE_CELLS],
        "lat": [19.0 + i * 0.01 for i in FIXTURE_CELLS],
    }).to_csv(Path(directory) / "cell_centers.csv", index=False)


def _clear_barv3_cache() -> None:
    """Clear the lru_cache entries on _load and _centers so bundle-path
    changes take effect immediately.  Safe to call even if the functions have
    never been called yet."""
    import app.barv3 as barv3
    barv3._load.cache_clear()
    barv3._centers.cache_clear()


# ---------------------------------------------------------------------------
# Unit tests for daily_geojson (no HTTP, no Postgres)
# ---------------------------------------------------------------------------

class DailyGeojsonBundleTests(unittest.TestCase):
    """Tests for barv3.daily_geojson using a synthetic fixture bundle."""

    def setUp(self):
        self._tmpdir = tempfile.mkdtemp(prefix="resq_test_bundle_")
        _write_synthetic_bundle(self._tmpdir)
        # Point the production code at our synthetic bundle
        self._env_patcher = mock.patch.dict(
            os.environ, {"RESQ_MODEL_BUNDLE_DIR": self._tmpdir}
        )
        self._env_patcher.start()
        _clear_barv3_cache()

    def tearDown(self):
        self._env_patcher.stop()
        _clear_barv3_cache()
        # Clean up temp files
        import shutil
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def test_returns_feature_collection_type(self):
        from app.barv3 import daily_geojson
        result = daily_geojson(DEMO_DATE)
        self.assertEqual(result["type"], "FeatureCollection",
                         "response must have type=FeatureCollection")

    def test_returns_nonempty_features_for_demo_date(self):
        """Core regression: the endpoint must NOT return an empty list for the
        hardcoded demo date when a valid bundle is available."""
        from app.barv3 import daily_geojson
        result = daily_geojson(DEMO_DATE)
        self.assertGreater(
            len(result["features"]), 0,
            f"Expected ≥1 feature for {DEMO_DATE}; got 0. "
            "This is the defect identified in the RESQ10 audit."
        )

    def test_returns_five_features_matching_fixture(self):
        from app.barv3 import daily_geojson
        result = daily_geojson(DEMO_DATE)
        self.assertEqual(
            len(result["features"]), len(FIXTURE_CELLS),
            f"Expected {len(FIXTURE_CELLS)} features matching the fixture"
        )

    def test_each_feature_has_point_geometry(self):
        from app.barv3 import daily_geojson
        result = daily_geojson(DEMO_DATE)
        for i, feature in enumerate(result["features"]):
            with self.subTest(i=i):
                self.assertEqual(feature["type"], "Feature")
                geom = feature["geometry"]
                self.assertEqual(geom["type"], "Point",
                                 "each cell should be a Point geometry")
                coords = geom["coordinates"]
                self.assertEqual(len(coords), 2,
                                 "Point coordinates must have [lon, lat]")
                self.assertIsInstance(coords[0], float)
                self.assertIsInstance(coords[1], float)

    def test_each_feature_properties_contain_required_fields(self):
        from app.barv3 import daily_geojson
        result = daily_geojson(DEMO_DATE)
        for i, feature in enumerate(result["features"]):
            with self.subTest(i=i):
                props = feature["properties"]
                self.assertIn("rank_percentile", props,
                              "properties must include rank_percentile")
                self.assertIn("band", props,
                              "properties must include band")
                self.assertIn(props["band"],
                              {"Very high", "High", "Moderate", "Low"},
                              "band must be one of the four documented values")

    def test_returns_empty_for_date_not_in_fixture(self):
        from app.barv3 import daily_geojson
        other_date = date(2024, 1, 1)
        result = daily_geojson(other_date)
        self.assertEqual(result["type"], "FeatureCollection")
        self.assertEqual(result["features"], [],
                         "a date absent from the bundle should return empty features")

    def test_returns_empty_when_no_bundle(self):
        """Graceful degradation: missing bundle must return empty FeatureCollection."""
        import app.barv3 as barv3
        with mock.patch.object(barv3, "_bundle_dir", return_value=None):
            _clear_barv3_cache()
            from app.barv3 import daily_geojson
            result = daily_geojson(DEMO_DATE)
        self.assertEqual(result["type"], "FeatureCollection")
        self.assertEqual(result["features"], [])

    def test_rank_percentile_values_are_in_valid_range(self):
        from app.barv3 import daily_geojson
        result = daily_geojson(DEMO_DATE)
        for feature in result["features"]:
            rp = feature["properties"]["rank_percentile"]
            self.assertGreaterEqual(rp, 0.0)
            self.assertLessEqual(rp, 100.0)


# ---------------------------------------------------------------------------
# Integration tests: FastAPI endpoint (no Postgres, no browser)
# ---------------------------------------------------------------------------

class RiskGeojsonEndpointTests(unittest.TestCase):
    """Tests for GET /api/risk/geojson via FastAPI TestClient.

    Postgres is NOT required: the endpoint falls through to the Postgres path
    only when daily_geojson() returns empty features.  Our fixture bundle
    supplies real features, so the DB branch is never reached.
    """

    @classmethod
    def setUpClass(cls):
        # Import TestClient here; the app imports SQLAlchemy at module load
        # time.  The TestClient is constructed without 'with' so the lifespan
        # (which calls init_db()) is skipped entirely.
        from fastapi.testclient import TestClient
        from app.core import security
        from app.main import app
        cls._secret_patcher = mock.patch.object(
            security, "RESQ_SECRET_KEY", "test-only-secret-with-more-than-32-bytes"
        )
        cls._secret_patcher.start()
        token = security.make_access_token(1, "admin")
        cls.client = TestClient(
            app,
            base_url="https://testserver",
            headers={"Authorization": f"Bearer {token}"},
        )

    @classmethod
    def tearDownClass(cls):
        cls._secret_patcher.stop()

    def setUp(self):
        self._tmpdir = tempfile.mkdtemp(prefix="resq_test_bundle_")
        _write_synthetic_bundle(self._tmpdir)
        self._env_patcher = mock.patch.dict(
            os.environ, {"RESQ_MODEL_BUNDLE_DIR": self._tmpdir}
        )
        self._env_patcher.start()
        _clear_barv3_cache()

    def tearDown(self):
        self._env_patcher.stop()
        _clear_barv3_cache()
        import shutil
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def test_http_200_for_demo_date(self):
        resp = self.client.get("/api/risk/geojson", params={"target": "2024-03-10"})
        self.assertEqual(resp.status_code, 200,
                         f"Expected 200; got {resp.status_code}: {resp.text[:200]}")

    def test_response_is_feature_collection(self):
        resp = self.client.get("/api/risk/geojson", params={"target": "2024-03-10"})
        body = resp.json()
        self.assertEqual(body["type"], "FeatureCollection")
        self.assertIn("features", body)

    def test_response_has_nonempty_features(self):
        """Core regression: non-empty bundle → non-empty features."""
        resp = self.client.get("/api/risk/geojson", params={"target": "2024-03-10"})
        features = resp.json()["features"]
        self.assertGreater(len(features), 0,
                           "GET /api/risk/geojson must return ≥1 feature "
                           "for the demo date when a valid bundle is present")

    def test_features_have_point_geometry(self):
        resp = self.client.get("/api/risk/geojson", params={"target": "2024-03-10"})
        for feature in resp.json()["features"]:
            self.assertEqual(feature["geometry"]["type"], "Point")

    def test_features_have_required_properties(self):
        resp = self.client.get("/api/risk/geojson", params={"target": "2024-03-10"})
        for feature in resp.json()["features"]:
            props = feature["properties"]
            self.assertIn("rank_percentile", props)
            self.assertIn("band", props)

    def test_empty_response_for_invalid_date(self):
        """A date with no data in the bundle returns empty features, not an error.
        We test this at the daily_geojson() level (not through the HTTP endpoint)
        because the endpoint's Postgres fallback would be reached for empty-feature
        dates and Postgres is not available in this test environment."""
        from app.barv3 import daily_geojson
        other_date = date(2024, 1, 1)  # not in the synthetic fixture
        result = daily_geojson(other_date)
        self.assertEqual(result["type"], "FeatureCollection")
        self.assertEqual(result["features"], [],
                         "a date absent from the bundle should return empty features")

    def test_production_bundle_serves_data_for_demo_date(self):
        """Verify the production bundle (not fixture) serves data for the
        hardcoded demo date.  Uses the real backend/models/barv3/ bundle.
        Skips if the bundle is absent (no data on this machine)."""
        prod_bundle = BACKEND / "models" / "barv3"
        if not prod_bundle.exists():
            self.skipTest("Production bundle absent on this machine")
        with mock.patch.dict(os.environ,
                             {"RESQ_MODEL_BUNDLE_DIR": str(prod_bundle)}):
            _clear_barv3_cache()
            resp = self.client.get("/api/risk/geojson",
                                   params={"target": "2024-03-10"})
        _clear_barv3_cache()
        self.assertEqual(resp.status_code, 200)
        features = resp.json()["features"]
        self.assertGreater(len(features), 0,
                           "Production bundle must serve data for 2024-03-10")


if __name__ == "__main__":
    unittest.main()
