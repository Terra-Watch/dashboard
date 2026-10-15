#!/usr/bin/env python3
"""Offline regression tests for the safe OSM-to-GeoJSON conversion guards."""

import importlib.util
import json
import tempfile
import unittest
from unittest import mock
from pathlib import Path


SCRIPT = Path(__file__).with_name("convert_and_tile.py")
SPEC = importlib.util.spec_from_file_location("convert_and_tile", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


def way(tags, points):
    return {
        "type": "way",
        "id": 7,
        "tags": tags,
        "geometry": [{"lon": lon, "lat": lat} for lon, lat in points],
    }


class ConversionSafetyTests(unittest.TestCase):
    def test_major_road_remains_a_line(self):
        feature = MODULE.overpass_element_to_feature(
            way({"highway": "primary"}, [(78.0, 19.0), (78.1, 19.1)])
        )
        self.assertEqual(feature["geometry"]["type"], "LineString")
        self.assertEqual(len(feature["geometry"]["coordinates"]), 2)

    def test_closed_approved_area_becomes_polygon(self):
        feature = MODULE.overpass_element_to_feature(
            way(
                {"natural": "wood"},
                [(78.0, 19.0), (78.1, 19.0), (78.1, 19.1), (78.0, 19.0)],
            )
        )
        self.assertEqual(feature["geometry"]["type"], "Polygon")

    def test_open_area_is_not_silently_closed(self):
        feature = MODULE.overpass_element_to_feature(
            way({"landuse": "forest"}, [(78.0, 19.0), (78.1, 19.0)])
        )
        self.assertIsNone(feature)

    def test_relation_approximation_is_rejected(self):
        relation = {"type": "relation", "id": 99, "tags": {"boundary": "administrative"}}
        with self.assertRaises(MODULE.UnsupportedGeometryError):
            MODULE.overpass_element_to_feature(relation)

    def test_pmtiles_metadata_must_be_valid_json_with_expected_layer(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "test.pmtiles"
            archive.write_bytes(b"archive")
            completed = MODULE.subprocess.CompletedProcess(
                [], 0, json.dumps({"vector_layers": [{"id": "osm_roads"}]}), ""
            )
            with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
                metadata = MODULE.inspect_pmtiles(archive)
            self.assertEqual(metadata["vector_layers"], {"osm_roads"})

    def test_pmtiles_metadata_failure_is_reported(self):
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / "test.pmtiles"
            archive.write_bytes(b"archive")
            completed = MODULE.subprocess.CompletedProcess([], 0, "not-json", "")
            with mock.patch.object(MODULE.subprocess, "run", return_value=completed):
                metadata = MODULE.inspect_pmtiles(archive)
            self.assertIn("error", metadata)

    def test_pmtiles_build_validates_expected_layer_before_publication(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "roads.geojson"
            source.write_text("{}")
            staged = root / "staged"

            def fake_run(command, **kwargs):
                if command[0] == MODULE.TIPPECANOE:
                    output = Path(command[command.index("--output") + 1])
                    output.parent.mkdir(parents=True, exist_ok=True)
                    output.write_bytes(b"synthetic archive")
                    return MODULE.subprocess.CompletedProcess(command, 0, "", "")
                return MODULE.subprocess.CompletedProcess(
                    command, 0, json.dumps({"vector_layers": []}), ""
                )

            with mock.patch.object(MODULE.subprocess, "run", side_effect=fake_run):
                success, message = MODULE.build_pmtiles(
                    "roads", source, MODULE.LAYER_CONFIG["roads"], output_dir=staged
                )
            self.assertFalse(success)
            self.assertIn("missing expected vector layer", message)

    def test_tippecanoe_command_generates_numeric_stable_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "roads.geojson"
            source.write_text("{}")
            staged = root / "staged"
            commands = []

            def fake_run(command, **kwargs):
                commands.append(command)
                if command[0] == MODULE.TIPPECANOE:
                    output = Path(command[command.index("--output") + 1])
                    output.parent.mkdir(parents=True, exist_ok=True)
                    output.write_bytes(b"synthetic archive")
                return MODULE.subprocess.CompletedProcess(
                    command, 0, json.dumps({"vector_layers": [{"id": "osm_roads"}]}), ""
                )

            with mock.patch.object(MODULE.subprocess, "run", side_effect=fake_run):
                success, _ = MODULE.build_pmtiles(
                    "roads", source, MODULE.LAYER_CONFIG["roads"], output_dir=staged
                )
            self.assertTrue(success)
            self.assertIn("--generate-ids", commands[0])
            self.assertIn("--preserve-input-order", commands[0])

    def test_incomplete_release_does_not_replace_current(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            tiles = root / "tiles"
            previous = tiles / "releases/previous"
            previous.mkdir(parents=True)
            (previous / "manifest.json").write_text("previous")
            tiles.mkdir(exist_ok=True)
            (tiles / "current").symlink_to(Path("releases") / "previous")
            staged = root / "staged"
            staged.mkdir()
            (staged / "manifest.json").write_text("new")
            with self.assertRaisesRegex(ValueError, "incomplete"):
                MODULE.publish_tile_release(
                    staged, tiles, list(MODULE.LAYER_CONFIG), release_name="new"
                )
            self.assertEqual((tiles / "current/manifest.json").read_text(), "previous")

    def test_merge_reads_relation_aware_extraction_geojson_inputs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            extracted = root / "current"
            output = root / "merged"
            payload = {
                "type": "FeatureCollection",
                "features": [{
                    "type": "Feature",
                    "geometry": {"type": "LineString", "coordinates": [[78.0, 19.0], [78.1, 19.1]]},
                    "properties": {"osm_type": "way", "osm_id": 7, "highway": "primary"},
                }],
            }
            for incident_id in MODULE.INCIDENT_IDS:
                target = extracted / incident_id
                target.mkdir(parents=True)
                (target / "roads.geojson").write_text(json.dumps(payload))
            path, count, status = MODULE.convert_layer_to_geojson(
                "roads", data_layers=root / "legacy", extracted_root=extracted, output_dir=output
            )
            self.assertEqual(status, "converted")
            self.assertEqual(count, 1)
            self.assertEqual(json.loads(path.read_text())["features"][0]["properties"]["osm_id"], 7)


if __name__ == "__main__":
    unittest.main()
