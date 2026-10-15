"""Dependency-free regression tests for the redesign demo persistence store."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services import redesign_store  # noqa: E402


class FieldReportIdempotencyTests(unittest.TestCase):
    def test_retry_keeps_one_device_attributed_report(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            test_db = Path(temp_dir) / "redesign-demo.sqlite3"
            with patch.object(redesign_store, "DB_PATH", test_db):
                first, first_created = redesign_store.upsert_field_report(
                    "offline-queue-item-1",
                    "task-7",
                    "Smoke observed near ridge",
                    "photo-1.jpg",
                    "field-device-3",
                    "2026-10-15T08:30:00Z",
                )
                retry, retry_created = redesign_store.upsert_field_report(
                    "offline-queue-item-1",
                    "task-7",
                    "Smoke observed near ridge",
                    "photo-1.jpg",
                    "field-device-3",
                    "2026-10-15T08:30:00Z",
                )
                reports = redesign_store.list_field_reports()

        self.assertTrue(first_created)
        self.assertFalse(retry_created)
        self.assertEqual(first["idempotency_key"], "offline-queue-item-1")
        self.assertEqual(retry["idempotency_key"], first["idempotency_key"])
        self.assertEqual(reports, [first])
        self.assertEqual(reports[0]["device_id"], "field-device-3")
        self.assertEqual(reports[0]["captured_at"], "2026-10-15T08:30:00Z")


if __name__ == "__main__":
    unittest.main()
