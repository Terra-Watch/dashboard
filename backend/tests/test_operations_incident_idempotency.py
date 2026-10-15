"""Regression tests for reporter-scoped, race-safe incident idempotency."""
import sys
import unittest
from pathlib import Path
from unittest import mock

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from fastapi import HTTPException  # noqa: E402
from app.contracts.schemas import IncidentRequest  # noqa: E402
from app.routers import operations  # noqa: E402


class _Result:
    def __init__(self, row):
        self.row = row

    def mappings(self):
        return self

    def first(self):
        return self.row


class _Database:
    def __init__(self, results):
        self.results = iter(results)
        self.statements = []

    def execute(self, statement, params):
        self.statements.append((str(statement), params))
        return _Result(next(self.results))


class IncidentIdempotencyTests(unittest.TestCase):
    payload = IncidentRequest(client_key="client-123", source="citizen", size="small", notes="Smoke")

    def call_with_results(self, results, reporter_id=7):
        db = _Database(results)
        context = mock.MagicMock()
        context.__enter__.return_value = db
        with (
            mock.patch.object(operations.engine, "begin", return_value=context),
            mock.patch.object(operations, "require_scope"),
        ):
            response = operations.create_incident(self.payload, {"id": reporter_id, "role": "officer"})
        return response, db

    def test_new_incident_returns_created_record_without_internal_reporter_id(self):
        response, db = self.call_with_results([{
            "id": 11, "reporter_id": 7, "source": "citizen", "size": "small",
            "notes": "Smoke", "status": "reported", "created_at": "t0",
        }])
        self.assertEqual(response["id"], 11)
        self.assertNotIn("reporter_id", response)
        self.assertIn("ON CONFLICT (client_key)", db.statements[0][0])

    def test_retry_after_conflict_returns_original_for_same_reporter(self):
        response, db = self.call_with_results([
            None,
            {"id": 11, "reporter_id": 7, "source": "citizen", "size": "small",
             "notes": "Smoke", "status": "reported", "created_at": "t0"},
        ])
        self.assertEqual(response["id"], 11)
        self.assertEqual(len(db.statements), 2)

    def test_client_key_collision_does_not_disclose_another_reporters_incident(self):
        db = _Database([
            None,
            {"id": 11, "reporter_id": 99, "source": "citizen", "size": "small",
             "notes": "Private report", "status": "reported", "created_at": "t0"},
        ])
        context = mock.MagicMock()
        context.__enter__.return_value = db
        with (
            mock.patch.object(operations.engine, "begin", return_value=context),
            mock.patch.object(operations, "require_scope"),
        ):
            with self.assertRaises(HTTPException) as caught:
                operations.create_incident(self.payload, {"id": 7, "role": "officer"})
        self.assertEqual(caught.exception.status_code, 409)
        self.assertNotIn("Private report", caught.exception.detail)

    def test_blank_idempotency_key_is_rejected_before_database_access(self):
        payload = self.payload.model_copy(update={"client_key": "   "})
        with mock.patch.object(operations.engine, "begin") as begin:
            with self.assertRaises(HTTPException) as caught:
                operations.create_incident(payload, {"id": 7, "role": "officer"})
        self.assertEqual(caught.exception.status_code, 422)
        begin.assert_not_called()

    def test_key_over_database_limit_is_rejected_before_database_access(self):
        payload = self.payload.model_copy(update={"client_key": "k" * 121})
        with mock.patch.object(operations.engine, "begin") as begin:
            with self.assertRaises(HTTPException) as caught:
                operations.create_incident(payload, {"id": 7, "role": "officer"})
        self.assertEqual(caught.exception.status_code, 422)
        begin.assert_not_called()


if __name__ == "__main__":
    unittest.main()
