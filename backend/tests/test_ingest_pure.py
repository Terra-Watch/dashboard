"""Dependency-free regression tests for RESQ8 ingestion pure functions."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.ingest import (  # noqa: E402
    FetchError,
    _fetch_with_retry,
    _parse_detected_at,
    cluster_detections_in_memory,
    get_health,
    map_confidence,
    parse_firms_csv,
    prepare_firms_batch,
)


class PureIngestionTests(unittest.TestCase):
    def test_import_and_health_do_not_require_database_dependencies(self):
        health = get_health()
        self.assertFalse(health["live"])
        self.assertTrue(health["stale"])

    def test_malformed_rows_are_skipped_without_losing_valid_rows(self):
        body = "latitude,longitude,acq_date,acq_time,confidence,frp\n"
        body += "19.1,83.9,2024-03-10,0600,h,12.5\n"
        body += "not-a-latitude,83.9,2024-03-10,0610,n,8.0\n"
        rows = parse_firms_csv(body, "VIIRS_SNPP_NRT")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["confidence"], "high")
        self.assertEqual(rows[0]["frp"], 12.5)

    def test_invalid_timestamp_is_rejected_instead_of_fabricating_current_time(self):
        with self.assertRaises(ValueError):
            _parse_detected_at("not-a-date", "bad")

    def test_rows_with_invalid_timestamps_are_skipped(self):
        rows = parse_firms_csv(
            "latitude,longitude,acq_date,acq_time,confidence\n"
            "19.1,83.9,not-a-date,bad,h\n", "VIIRS_SNPP_NRT"
        )
        self.assertEqual(rows, [])

    def test_batch_deduplication_and_cluster_order_are_deterministic(self):
        header = "latitude,longitude,acq_date,acq_time,confidence,frp\n"
        first = "19.3265,83.9372,2024-03-10,0600,n,12\n"
        duplicate = "19.3265,83.9372,2024-03-10,0600,n,12\n"
        second = "19.3270,83.9380,2024-03-10,0612,h,18\n"
        forward = prepare_firms_batch(header + first + duplicate + second, "VIIRS_SNPP_NRT")
        reverse = prepare_firms_batch(header + second + duplicate + first, "VIIRS_SNPP_NRT")
        self.assertEqual(forward["parsed_count"], 3)
        self.assertEqual(forward["input_count"], 3)
        self.assertEqual(len(forward["rows"]), 2)
        self.assertEqual(forward["clusters"], reverse["clusters"])
        self.assertEqual(
            [r["dedup_key"] for r in forward["rows"]],
            [r["dedup_key"] for r in reverse["rows"]],
        )

    def test_clustering_temporal_boundary_is_strict(self):
        rows = parse_firms_csv(
            "latitude,longitude,acq_date,acq_time,confidence\n"
            "19.1,83.9,2024-03-10,0600,n\n"
            "19.1,83.9,2024-03-10,1800,n\n", "VIIRS_SNPP_NRT"
        )
        self.assertEqual(cluster_detections_in_memory(rows), [[0], [1]])

    def test_confidence_mapping_is_bounded(self):
        self.assertEqual(map_confidence("l"), "low")
        self.assertEqual(map_confidence("nominal"), "nominal")
        self.assertEqual(map_confidence("unexpected"), "nominal")

    def test_clustering_remains_database_independent(self):
        rows = parse_firms_csv(
            "latitude,longitude,acq_date,acq_time,confidence\n"
            "19.3265,83.9372,2024-03-10,0600,n\n"
            "19.3270,83.9380,2024-03-10,0612,n\n",
            "VIIRS_SNPP_NRT",
        )
        groups = cluster_detections_in_memory(rows)
        self.assertEqual(groups, [[0, 1]])

    def test_retry_preserves_last_fetch_error_without_database(self):
        attempts = []

        def fail(_url: str) -> tuple[int, str]:
            attempts.append(1)
            raise FetchError("offline", status=None)

        with self.assertRaisesRegex(FetchError, "offline"):
            _fetch_with_retry(
                "OD", "VIIRS_SNPP_NRT", "2024-03-10",
                map_key="test", _http=fail, _sleep=lambda _seconds: None,
            )
        self.assertEqual(len(attempts), 5)

    def test_retry_exhaustion_does_not_return_a_server_error_as_success(self):
        attempts = []

        def unavailable(_url: str) -> tuple[int, str]:
            attempts.append(1)
            return 503, "temporarily unavailable"

        with self.assertRaisesRegex(FetchError, "HTTP 503"):
            _fetch_with_retry(
                "OD", "VIIRS_SNPP_NRT", "2024-03-10",
                map_key="test", _http=unavailable, _sleep=lambda _seconds: None,
            )
        self.assertEqual(len(attempts), 5)

    def test_nonretryable_http_error_fails_without_retry(self):
        attempts = []

        def unauthorized(_url: str) -> tuple[int, str]:
            attempts.append(1)
            return 401, "invalid key"

        with self.assertRaisesRegex(FetchError, "HTTP 401") as caught:
            _fetch_with_retry(
                "OD", "VIIRS_SNPP_NRT", "2024-03-10",
                map_key="test", _http=unauthorized, _sleep=lambda _seconds: None,
            )
        self.assertFalse(caught.exception.retryable)
        self.assertEqual(len(attempts), 1)


if __name__ == "__main__":
    unittest.main()
