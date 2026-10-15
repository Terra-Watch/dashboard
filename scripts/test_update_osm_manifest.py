import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import update_osm_manifest as updater


def _manifest(status="partial"):
    target = {
        "region": "Southern Zone",
        "source_url": updater.SOURCE_URL,
        "published_source_timestamp": "2026-10-13T23:05:24+00:00",
        "expected_size_bytes": updater.EXPECTED_SIZE,
        "published_md5": updater.EXPECTED_MD5,
        "file_path": updater.PARTIAL_PATH if status == "partial" else updater.FINAL_PATH,
        "retrieval_timestamp": "2026-10-14T18:18:56Z",
        "actual_size_bytes": 20_811_776 if status == "partial" else updater.EXPECTED_SIZE,
        "calculated_md5": "partial-md5" if status == "partial" else updater.EXPECTED_MD5,
        "calculated_sha256": "partial-sha" if status == "partial" else "a" * 64,
        "status": status,
        "pbf_validation": "not_run_incomplete" if status == "partial" else "passed",
        "warnings": ["download incomplete"] if status == "partial" else [],
    }
    return {
        "source": "Official Geofabrik OpenStreetMap regional extracts",
        "license": "ODbL 1.0",
        "attribution": "© OpenStreetMap contributors",
        "entries": [target, {"region": "Western Zone", "status": "validated", "sentinel": "preserve"}],
    }


def _evidence(**overrides):
    evidence = {
        "region": "Southern Zone",
        "source_url": updater.SOURCE_URL,
        "status": "validated",
        "file_path": updater.FINAL_PATH,
        "expected_size_bytes": updater.EXPECTED_SIZE,
        "actual_size_bytes": updater.EXPECTED_SIZE,
        "published_md5": updater.EXPECTED_MD5,
        "calculated_md5": updater.EXPECTED_MD5,
        "calculated_sha256": "b" * 64,
        "pbf_validation": "passed",
        "independent_validation": {flag: True for flag in updater.REQUIRED_VALIDATION_FLAGS},
    }
    evidence.update(overrides)
    return evidence


class UpdateManifestTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.manifest_path = self.root / "manifest.json"
        self.evidence_path = self.root / "evidence.json"

    def tearDown(self):
        self.temp.cleanup()

    def write(self, manifest=None, evidence=None):
        self.manifest_path.write_text(json.dumps(manifest or _manifest()), encoding="utf-8")
        self.evidence_path.write_text(json.dumps(evidence or _evidence()), encoding="utf-8")

    def run_update(self, manifest=None, evidence=None):
        self.write(manifest, evidence)
        return updater.update_manifest(self.manifest_path, self.evidence_path)

    def test_successful_partial_to_validated_transition(self):
        result = self.run_update()
        target = result["entries"][0]
        self.assertEqual(target["status"], "validated")
        self.assertEqual(target["file_path"], updater.FINAL_PATH)
        self.assertEqual(target["calculated_sha256"], "b" * 64)

    def test_malformed_manifest_json_rejected(self):
        self.manifest_path.write_text("{", encoding="utf-8")
        self.evidence_path.write_text(json.dumps(_evidence()), encoding="utf-8")
        with self.assertRaises(updater.ManifestUpdateError):
            updater.update_manifest(self.manifest_path, self.evidence_path)

    def test_missing_manifest_fields_rejected(self):
        manifest = _manifest()
        del manifest["entries"][0]["source_url"]
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(manifest)

    def test_wrong_source_url_rejected(self):
        evidence = _evidence(source_url="https://example.invalid/file.pbf")
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(evidence=evidence)

    def test_malformed_md5_rejected(self):
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(evidence=_evidence(calculated_md5="not-md5"))

    def test_malformed_sha256_rejected(self):
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(evidence=_evidence(calculated_sha256="not-sha"))

    def test_placeholder_sha256_rejected(self):
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(evidence=_evidence(calculated_sha256=updater.SHA256_PLACEHOLDER))

    def test_partial_evidence_status_rejected(self):
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(evidence=_evidence(status="partial"))

    def test_false_independent_validation_flag_rejected(self):
        flags = {flag: True for flag in updater.REQUIRED_VALIDATION_FLAGS}
        flags["pbf_readability"] = False
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(evidence=_evidence(independent_validation=flags))

    def test_size_mismatch_rejected(self):
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(evidence=_evidence(actual_size_bytes=updater.EXPECTED_SIZE - 1))

    def test_md5_mismatch_rejected(self):
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(evidence=_evidence(calculated_md5="1" * 32))

    def test_pbf_validation_failure_rejected(self):
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(evidence=_evidence(pbf_validation="failed"))

    def test_unexpected_partial_path_rejected(self):
        manifest = _manifest()
        manifest["entries"][0]["file_path"] = "data/osm/geofabrik/other.pbf.part"
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(manifest)

    def test_ambiguous_target_rejected(self):
        manifest = _manifest()
        manifest["entries"].append(copy.deepcopy(manifest["entries"][0]))
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(manifest)

    def test_unrelated_entries_are_preserved(self):
        manifest = _manifest()
        before = copy.deepcopy(manifest["entries"][1])
        result = self.run_update(manifest)
        self.assertEqual(result["entries"][1], before)

    def test_publication_failure_preserves_original_and_cleans_temp(self):
        manifest = _manifest()
        self.write(manifest)
        with mock.patch.object(updater.os, "replace", side_effect=OSError("simulated publication failure")):
            with self.assertRaises(OSError):
                updater.update_manifest(self.manifest_path, self.evidence_path)
        self.assertEqual(json.loads(self.manifest_path.read_text(encoding="utf-8")), manifest)
        self.assertEqual(list(self.root.glob(".manifest.json.*.tmp")), [])

    def test_repeated_identical_update_is_idempotent(self):
        self.run_update()
        first = self.manifest_path.read_text(encoding="utf-8")
        self.run_update(manifest=json.loads(first))
        self.assertEqual(self.manifest_path.read_text(encoding="utf-8"), first)

    def test_validated_entry_conflict_is_rejected(self):
        manifest = _manifest(status="validated")
        with self.assertRaises(updater.ManifestUpdateError):
            self.run_update(manifest, _evidence(calculated_sha256="c" * 64))


if __name__ == "__main__":
    unittest.main()
