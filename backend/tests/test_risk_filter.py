"""Focused tests for the optional, pre-classified high-risk GeoJSON filter."""
from datetime import date
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.routers import risk
from app.core import security


TARGET = date(2024, 3, 10)


def feature(cell_id: int, band: str) -> dict[str, object]:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [cell_id, 0]},
        "properties": {"cell_id": cell_id, "band": band},
    }


def database_row(cell_id: int, band: str) -> dict[str, object]:
    return {
        "id": cell_id,
        "state": "TS",
        "place_name": None,
        "rank": cell_id,
        "rank_percentile": 99.0,
        "band": band,
        "geometry": json.dumps({"type": "Point", "coordinates": [cell_id, 0]}),
    }


class RiskBandFilterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        app = FastAPI()
        app.include_router(risk.router)
        cls._secret_patcher = patch.object(security, "RESQ_SECRET_KEY", "test-only-secret-with-more-than-32-bytes")
        cls._secret_patcher.start()
        token = security.make_access_token(1, "admin")
        cls.client = TestClient(app, headers={"Authorization": f"Bearer {token}"})

    @classmethod
    def tearDownClass(cls) -> None:
        cls._secret_patcher.stop()

    def test_daily_geojson_high_filter_keeps_only_existing_high_categories_in_order(self):
        original = {
            "type": "FeatureCollection",
            "features": [
                feature(1, "Low"),
                feature(2, "Very high"),
                feature(3, "High"),
                feature(4, "Moderate"),
            ],
        }
        with patch.object(risk, "daily_geojson", return_value=original):
            response = self.client.get(
                "/api/risk/geojson", params={"target": TARGET.isoformat(), "risk_band": "high"}
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["type"], "FeatureCollection")
        self.assertEqual([f["properties"]["cell_id"] for f in body["features"]], [2, 3])
        self.assertEqual(len(body["features"]), 2)

    def test_daily_geojson_without_filter_preserves_response_and_order(self):
        original = {
            "type": "FeatureCollection",
            "features": [feature(4, "Low"), feature(2, "Very high"), feature(3, "High")],
        }
        with patch.object(risk, "daily_geojson", return_value=original):
            response = self.client.get("/api/risk/geojson", params={"target": TARGET.isoformat()})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), original)

    def test_nonempty_daily_source_with_no_high_features_does_not_fall_through(self):
        replay = {"type": "FeatureCollection", "features": [feature(7, "Moderate")]}
        with (
            patch.object(risk, "daily_geojson", return_value=replay),
            patch.object(risk.engine, "connect") as connect,
        ):
            response = self.client.get(
                "/api/risk/geojson", params={"target": TARGET.isoformat(), "risk_band": "high"}
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"type": "FeatureCollection", "features": []})
        connect.assert_not_called()

    def test_filter_is_validated(self):
        response = self.client.get(
            "/api/risk/geojson", params={"target": TARGET.isoformat(), "risk_band": "critical"}
        )
        self.assertEqual(response.status_code, 422)

    def test_scoped_redesign_access_is_filtered_in_the_actual_risk_route(self):
        token = security.make_access_token(42, "range_officer")
        client = TestClient(
            self.client.app,
            headers={"Authorization": f"Bearer {token}"},
        )
        collection = {
            "type": "FeatureCollection",
            "features": [
                {**feature(1, "High"), "properties": {**feature(1, "High")["properties"], "state": "OD"}},
                {**feature(2, "High"), "properties": {**feature(2, "High")["properties"], "state": "TS"}},
            ],
        }
        with patch.object(risk, "daily_geojson", return_value=collection), patch.object(
            risk, "user_scopes", return_value={"OD"}
        ) as scopes:
            response = client.get("/api/risk/geojson", params={"target": TARGET.isoformat()})

        self.assertEqual(response.status_code, 200)
        self.assertEqual([item["properties"]["state"] for item in response.json()["features"]], ["OD"])
        scopes.assert_called_once_with(42)

    def test_valid_legacy_admin_token_is_accepted_by_read_only_risk_route(self):
        token = security.make_token(44, "admin")
        client = TestClient(
            self.client.app,
            headers={"Authorization": f"Bearer {token}"},
        )
        collection = {"type": "FeatureCollection", "features": [feature(4, "High")]}
        with patch.object(risk, "daily_geojson", return_value=collection) as source:
            response = client.get("/api/risk/geojson", params={"target": TARGET.isoformat()})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), collection)
        source.assert_called_once_with(TARGET)

    def test_valid_token_with_disallowed_risk_role_is_rejected_before_data_access(self):
        token = security.make_access_token(43, "field_crew")
        client = TestClient(
            self.client.app,
            headers={"Authorization": f"Bearer {token}"},
        )
        with patch.object(risk, "daily_geojson") as source:
            response = client.get("/api/risk/geojson", params={"target": TARGET.isoformat()})

        self.assertEqual(response.status_code, 403)
        source.assert_not_called()

    def test_database_fallback_filters_and_preserves_order(self):
        rows = [database_row(1, "Low"), database_row(2, "High"), database_row(3, "Very high")]
        db = MagicMock()
        db.execute.side_effect = [
            SimpleNamespace(scalar=lambda: 17),
            SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: rows)),
        ]
        connection = MagicMock()
        connection.__enter__.return_value = db
        with (
            patch.object(risk, "daily_geojson", return_value={"type": "FeatureCollection", "features": []}),
            patch.object(risk.engine, "connect", return_value=connection),
        ):
            response = self.client.get(
                "/api/risk/geojson", params={"target": TARGET.isoformat(), "risk_band": "high"}
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual([f["properties"]["cell_id"] for f in body["features"]], [2, 3])
        self.assertEqual(len(body["features"]), 2)

    def test_database_fallback_without_filter_keeps_all_rows_in_order(self):
        rows = [database_row(5, "Moderate"), database_row(2, "High")]
        db = MagicMock()
        db.execute.side_effect = [
            SimpleNamespace(scalar=lambda: 17),
            SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: rows)),
        ]
        connection = MagicMock()
        connection.__enter__.return_value = db
        with (
            patch.object(risk, "daily_geojson", return_value={"type": "FeatureCollection", "features": []}),
            patch.object(risk.engine, "connect", return_value=connection),
        ):
            response = self.client.get("/api/risk/geojson", params={"target": TARGET.isoformat()})

        self.assertEqual(response.status_code, 200)
        self.assertEqual([f["properties"]["cell_id"] for f in response.json()["features"]], [5, 2])


if __name__ == "__main__":
    unittest.main()
