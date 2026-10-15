#!/usr/bin/env python3
"""Offline tests for the guarded regional-PBF extraction pipeline."""

import importlib.util
import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path


SCRIPT = Path(__file__).with_name("extract_osm_layers.py")
SPEC = importlib.util.spec_from_file_location("extract_osm_layers", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def feature(object_id, geometry, **properties):
    properties.update({"osm_type": "way", "osm_id": object_id})
    return {"type": "Feature", "geometry": geometry, "properties": properties}


LINE = {"type": "LineString", "coordinates": [[78.0, 19.0], [78.1, 19.1]]}
POLYGON = {
    "type": "Polygon",
    "coordinates": [[[78.0, 19.0], [78.1, 19.0], [78.1, 19.1], [78.0, 19.0]]],
}


class PbfPipelineTests(unittest.TestCase):
    def test_missing_regional_pbf_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({"source": "Official Geofabrik OpenStreetMap regional extracts", "entries": [
                {"region": name.replace("-latest.osm.pbf", "").replace("-", " ").title(),
                 "status": "validated"}
                for name in {spec["region"] for spec in MODULE.INCIDENTS.values()}
            ]}))
            with self.assertRaisesRegex(MODULE.PipelineError, "missing regional PBF"):
                MODULE.check_inputs(root, manifest_path=manifest, process_reader=lambda: "")

    def test_partial_input_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data/osm/geofabrik"
            data.mkdir(parents=True)
            partial = data / "southern-zone-latest.osm.pbf.part"
            partial.write_bytes(b"partial")
            for filename in {
                "eastern-zone-latest.osm.pbf",
                "central-zone-latest.osm.pbf",
                "western-zone-latest.osm.pbf",
            }:
                with (data / filename).open("wb") as handle:
                    handle.truncate(MODULE.EXPECTED_SIZES[filename])
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({"source": "Official Geofabrik OpenStreetMap regional extracts", "entries": [
                {"region": name.replace("-latest.osm.pbf", "").replace("-", " ").title(),
                 "status": "validated",
                 "expected_size_bytes": MODULE.EXPECTED_SIZES[name],
                 "actual_size_bytes": MODULE.EXPECTED_SIZES[name]}
                for name in {
                    spec["region"] for spec in MODULE.INCIDENTS.values()
                }
            ]}))
            with self.assertRaisesRegex(MODULE.PipelineError, "partial input"):
                MODULE.check_inputs(root, manifest_path=manifest, process_reader=lambda: "")

    def test_active_southern_download_blocks_before_file_access(self):
        with self.assertRaisesRegex(MODULE.PipelineError, "Southern download is active"):
            MODULE.check_inputs(Path("/does/not/exist"), process_reader=lambda: "aria2c southern-zone-latest.osm.pbf")

    def test_approved_tags_are_filtered(self):
        payload = {"type": "FeatureCollection", "features": [
            feature(1, POLYGON, natural="wood"),
            feature(2, POLYGON, natural="wetland"),
        ]}
        validated, count = MODULE.validate_geojson(payload, "forest")
        self.assertEqual(count, 1)
        self.assertEqual(validated["features"][0]["properties"]["osm_id"], 1)
        self.assertEqual(validated["features"][0]["properties"]["osm_feature_id"], "way/1")

    def test_area_boundary_filters_accept_tagged_ways_and_relations(self):
        self.assertIn("nwr/boundary=protected_area", MODULE.APPROVED_FILTERS["protected"])
        self.assertIn("nwr/boundary=administrative", MODULE.APPROVED_FILTERS["admin"])

    def test_export_preserves_osm_identity_attributes(self):
        command = MODULE.build_export_command("osmium", Path("in.pbf"), Path("out.geojson"))
        self.assertIn("type,id", command)

    def test_roads_and_rivers_remain_lines(self):
        for layer, properties in (
            ("roads", {"highway": "primary"}),
            ("water", {"waterway": "river"}),
        ):
            validated, count = MODULE.validate_geojson(
                {"type": "FeatureCollection", "features": [feature(1, LINE, **properties)]},
                layer,
            )
            self.assertEqual(count, 1)
            self.assertEqual(validated["features"][0]["geometry"]["type"], "LineString")

    def test_open_polygon_is_rejected(self):
        open_polygon = {"type": "Polygon", "coordinates": [[[78.0, 19.0], [78.1, 19.0], [78.1, 19.1]]]}
        with self.assertRaises(MODULE.PipelineError):
            MODULE.validate_geojson(
                {"type": "FeatureCollection", "features": [feature(1, open_polygon, natural="wood")]},
                "forest",
            )

    def test_relation_is_not_approximated(self):
        # The dedicated pipeline accepts only Osmium-exported geometry; a
        # relation without geometry cannot pass publication.
        with self.assertRaises(MODULE.PipelineError):
            MODULE.validate_geojson(
                {"type": "FeatureCollection", "features": [{
                    "type": "Feature", "geometry": None,
                    "properties": {"osm_type": "relation", "osm_id": 9,
                                   "boundary": "protected_area"},
                }]},
                "protected",
            )

    def test_approved_feature_without_identity_is_rejected(self):
        with self.assertRaisesRegex(MODULE.PipelineError, "missing OSM identity"):
            MODULE.validate_geojson(
                {"type": "FeatureCollection", "features": [{
                    "type": "Feature", "geometry": LINE,
                    "properties": {"highway": "primary"},
                }]},
                "roads",
            )

    def test_approved_feature_must_intersect_requested_bbox(self):
        with self.assertRaisesRegex(MODULE.PipelineError, "outside requested bbox"):
            MODULE.validate_geojson(
                {"type": "FeatureCollection", "features": [feature(
                    1, {"type": "Point", "coordinates": [80.0, 20.0]}, place="village"
                )]},
                "settlements", (78.5, 19.0, 78.7, 19.3),
            )

    def test_manifest_checksum_record_is_verified_before_hashing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data = root / "data/osm/geofabrik"
            data.mkdir(parents=True)
            entries = []
            for filename in {spec["region"] for spec in MODULE.INCIDENTS.values()}:
                with (data / filename).open("wb") as handle:
                    handle.truncate(MODULE.EXPECTED_SIZES[filename])
                entries.append({
                    "region": filename.replace("-latest.osm.pbf", "").replace("-", " ").title(),
                    "status": "validated",
                    "file_path": f"data/osm/geofabrik/{filename}",
                    "source_url": MODULE.EXPECTED_URLS[filename],
                    "published_source_timestamp": "2026-01-01T00:00:00+00:00",
                    "expected_size_bytes": MODULE.EXPECTED_SIZES[filename],
                    "actual_size_bytes": MODULE.EXPECTED_SIZES[filename],
                    "published_md5": MODULE.EXPECTED_MD5[filename],
                    "calculated_md5": "wrong",
                    "calculated_sha256": MODULE.EXPECTED_SHA256[filename],
                })
            manifest = root / "manifest.json"
            manifest.write_text(json.dumps({
                "source": "Official Geofabrik OpenStreetMap regional extracts",
                "entries": entries,
            }))
            with self.assertRaisesRegex(MODULE.PipelineError, "manifest calculated MD5"):
                MODULE.check_inputs(root, manifest_path=manifest, process_reader=lambda: "")

    def test_every_regional_sha256_is_a_pinned_digest_not_a_placeholder(self):
        self.assertEqual(set(MODULE.EXPECTED_SHA256), set(MODULE.EXPECTED_SIZES))
        for filename, digest in MODULE.EXPECTED_SHA256.items():
            with self.subTest(filename=filename):
                self.assertRegex(digest, r"^[0-9a-f]{64}$")

    def test_duplicate_identities_are_rejected(self):
        payload = {"type": "FeatureCollection", "features": [
            feature(1, LINE, highway="primary"),
            feature(1, LINE, highway="primary"),
        ]}
        with self.assertRaisesRegex(MODULE.PipelineError, "duplicate"):
            MODULE.validate_geojson(payload, "roads")

    def test_invalid_geometry_is_rejected(self):
        bad = {"type": "Point", "coordinates": [float("nan"), 19.0]}
        with self.assertRaises(MODULE.PipelineError):
            MODULE.validate_geojson(
                {"type": "FeatureCollection", "features": [feature(1, bad, place="village")]},
                "settlements",
            )

    def test_atomic_publication_preserves_existing_output_on_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "layer.geojson"
            destination.write_text("old-valid-output")
            with self.assertRaises(TypeError):
                MODULE.publish_geojson({"features": {1, 2}}, destination)
            self.assertEqual(destination.read_text(), "old-valid-output")

    def test_release_failure_preserves_previous_current(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "extracted"
            previous = output / "releases/previous"
            previous.mkdir(parents=True)
            (previous / "manifest.json").write_text("old")
            output.mkdir(exist_ok=True)
            (output / "current").symlink_to(Path("releases") / "previous")
            staging = root / "staging/run"
            staging.mkdir(parents=True)
            with self.assertRaises(TypeError):
                MODULE.publish_release(staging, output, {"entries": {1, 2}})
            self.assertEqual((output / "current" / "manifest.json").read_text(), "old")

    def test_production_guard_rejects_without_environment_flag(self):
        with tempfile.TemporaryDirectory() as directory:
            with mock.patch.dict(MODULE.os.environ, {}, clear=False):
                MODULE.os.environ.pop("RESQ7_ALLOW_PRODUCTION_OSM", None)
                with self.assertRaisesRegex(MODULE.PipelineError, "production execution is guarded"):
                    MODULE.production_pipeline(Path(directory))

    def test_reruns_are_stable(self):
        payload = {"type": "FeatureCollection", "features": [
            feature(2, LINE, highway="secondary"),
            feature(1, LINE, highway="primary"),
        ]}
        first, _ = MODULE.validate_geojson(payload, "roads")
        second, _ = MODULE.validate_geojson(dict(payload, features=list(reversed(payload["features"]))), "roads")
        self.assertEqual(json.dumps(first, sort_keys=True), json.dumps(second, sort_keys=True))

    def test_missing_dependency_has_actionable_error(self):
        with self.assertRaisesRegex(MODULE.PipelineError, "required executable"):
            MODULE.run_checked(["definitely-not-installed-resq7"], label="test")


if __name__ == "__main__":
    unittest.main()
