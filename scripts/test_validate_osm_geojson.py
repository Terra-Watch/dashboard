import copy
import json
import math
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_osm_geojson as validator


def _geometry(layer, outside=False, crossing=False, bbox=None):
    west, south, east, north = bbox or (78.5318, 19.1352, 78.6745, 19.2700)
    if outside:
        west, south, east, north = (70.0, 10.0, 70.1, 10.1)
    if crossing:
        west, south, east, north = (west - 0.1, south, east + 0.1, north)
    if layer == "settlements":
        return {"type": "Point", "coordinates": [(west + east) / 2, (south + north) / 2]}
    if layer in {"roads", "water"}:
        return {"type": "LineString", "coordinates": [[west, south], [east, north]]}
    return {
        "type": "Polygon",
        "coordinates": [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
    }


def _properties(layer, number=1, osm_type="way"):
    props = {"osm_id": number, "osm_type": osm_type, "osm_feature_id": f"{osm_type}/{number}"}
    if layer == "forest":
        props["natural"] = "wood"
    elif layer == "protected":
        props["boundary"] = "protected_area"
    elif layer == "roads":
        props["highway"] = "primary"
    elif layer == "settlements":
        props["place"] = "village"
    elif layer == "water":
        props["natural"] = "water"
    elif layer == "admin":
        props["boundary"] = "administrative"
        props["admin_level"] = 4
    return props


def _feature(layer, number=1, osm_type="way", geometry=None):
    return {
        "type": "Feature",
        "properties": _properties(layer, number, osm_type),
        "geometry": geometry if geometry is not None else _geometry(layer),
    }


def _release(root):
    for incident_id, spec in validator.INCIDENTS.items():
        incident_dir = root / incident_id
        incident_dir.mkdir(parents=True, exist_ok=True)
        for layer in validator.APPROVED_LAYERS:
            (incident_dir / f"{layer}.geojson").write_text(
                json.dumps({"type": "FeatureCollection", "features": [_feature(layer, geometry=_geometry(layer, bbox=spec["bbox"]))]}),
                encoding="utf-8",
            )


class GeoJSONValidatorTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / "release"
        _release(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def path(self, incident="E2024-131853", layer="forest"):
        return self.root / incident / f"{layer}.geojson"

    def payload(self, incident="E2024-131853", layer="forest"):
        return json.loads(self.path(incident, layer).read_text(encoding="utf-8"))

    def write_payload(self, payload, incident="E2024-131853", layer="forest"):
        self.path(incident, layer).write_text(json.dumps(payload), encoding="utf-8")

    def test_valid_six_layer_release(self):
        report = validator.validate_release(self.root)
        self.assertEqual(report["files_checked"], 24)
        self.assertEqual(report["hard_failure_count"], 0)
        self.assertIn(report["status"], {"pass", "warning"})

    def test_missing_layer_file(self):
        self.path(layer="water").unlink()
        report = validator.validate_release(self.root)
        self.assertEqual(report["status"], "hard_failure")
        self.assertEqual(report["hard_failure_count"], 1)

    def test_malformed_json(self):
        self.path().write_text("{", encoding="utf-8")
        report = validator.validate_release(self.root)
        self.assertEqual(report["status"], "hard_failure")
        self.assertEqual(report["layers"][0]["layers"][0]["issues"][0]["code"], "malformed_json")

    def test_invalid_feature_collection(self):
        self.write_payload({"type": "Feature", "features": []})
        report = validator.validate_release(self.root)
        self.assertEqual(report["status"], "hard_failure")

    def test_missing_osm_id(self):
        payload = self.payload()
        del payload["features"][0]["properties"]["osm_id"]
        self.write_payload(payload)
        self.assertEqual(validator.validate_release(self.root)["status"], "hard_failure")

    def test_missing_osm_type(self):
        payload = self.payload()
        del payload["features"][0]["properties"]["osm_type"]
        self.write_payload(payload)
        self.assertEqual(validator.validate_release(self.root)["status"], "hard_failure")

    def test_invalid_osm_feature_id(self):
        payload = self.payload()
        payload["features"][0]["properties"]["osm_feature_id"] = "way/other"
        self.write_payload(payload)
        self.assertEqual(validator.validate_release(self.root)["status"], "hard_failure")

    def test_duplicate_identity(self):
        payload = self.payload()
        payload["features"].append(copy.deepcopy(payload["features"][0]))
        self.write_payload(payload)
        report = validator.validate_release(self.root)
        self.assertEqual(report["status"], "hard_failure")
        self.assertEqual(report["layers"][0]["layers"][0]["duplicate_identity_count"], 1)

    def test_same_numeric_id_different_osm_types_is_valid(self):
        payload = self.payload(layer="settlements")
        payload["features"].append(_feature("settlements", 1, "node", _geometry("settlements")))
        self.write_payload(payload, layer="settlements")
        report = validator.validate_release(self.root)
        stats = report["layers"][0]["layers"][3]
        self.assertEqual(stats["duplicate_identity_count"], 0)
        self.assertEqual(stats["valid_feature_count"], 2)

    def test_unapproved_identifying_tag(self):
        payload = self.payload()
        payload["features"][0]["properties"]["natural"] = "scrub"
        self.write_payload(payload)
        self.assertEqual(validator.validate_release(self.root)["status"], "hard_failure")

    def test_wrong_geometry_type(self):
        payload = self.payload(layer="roads")
        payload["features"][0]["geometry"] = _geometry("forest")
        self.write_payload(payload, layer="roads")
        self.assertEqual(validator.validate_release(self.root)["status"], "hard_failure")

    def test_empty_geometry(self):
        payload = self.payload()
        payload["features"][0]["geometry"] = {"type": "Polygon", "coordinates": []}
        self.write_payload(payload)
        self.assertEqual(validator.validate_release(self.root)["status"], "hard_failure")

    def test_invalid_polygon_ring(self):
        payload = self.payload()
        payload["features"][0]["geometry"]["coordinates"][0][-1] = [78.6, 19.2]
        self.write_payload(payload)
        self.assertEqual(validator.validate_release(self.root)["status"], "hard_failure")

    def test_nonfinite_coordinate(self):
        payload = self.payload()
        payload["features"][0]["geometry"]["coordinates"][0][0][0] = math.nan
        self.write_payload(payload)
        self.assertEqual(validator.validate_release(self.root)["status"], "hard_failure")

    def test_malformed_coordinate_array(self):
        payload = self.payload(layer="roads")
        payload["features"][0]["geometry"]["coordinates"] = [[78.6], [78.65, 19.2]]
        self.write_payload(payload, layer="roads")
        self.assertEqual(validator.validate_release(self.root)["status"], "hard_failure")

    def test_out_of_range_coordinate(self):
        payload = self.payload(layer="settlements")
        payload["features"][0]["geometry"] = {"type": "Point", "coordinates": [181, 19.2]}
        self.write_payload(payload, layer="settlements")
        self.assertEqual(validator.validate_release(self.root)["status"], "hard_failure")

    def test_feature_outside_intended_area(self):
        payload = self.payload()
        payload["features"][0]["geometry"] = _geometry("forest", outside=True)
        self.write_payload(payload)
        report = validator.validate_release(self.root)
        self.assertEqual(report["status"], "hard_failure")
        self.assertEqual(report["layers"][0]["layers"][0]["out_of_bounds_count"], 1)

    def test_empty_layer_warning(self):
        self.write_payload({"type": "FeatureCollection", "features": []}, layer="water")
        report = validator.validate_release(self.root)
        self.assertEqual(report["hard_failure_count"], 0)
        self.assertEqual(report["status"], "warning")

    def test_sparse_layer_warning(self):
        payload = self.payload(layer="settlements")
        self.write_payload(payload, layer="settlements")
        report = validator.validate_release(self.root)
        self.assertTrue(any(issue["code"] == "sparse_layer" for issue in report["layers"][0]["layers"][3]["warnings"]))

    def test_valid_geometry_crossing_bbox_edge_warns_not_fails(self):
        payload = self.payload()
        payload["features"][0]["geometry"] = _geometry("forest", crossing=True)
        self.write_payload(payload)
        report = validator.validate_release(self.root)
        stats = report["layers"][0]["layers"][0]
        self.assertEqual(stats["valid_feature_count"], 1)
        self.assertTrue(any(issue["code"] == "boundary_crossing" for issue in stats["warnings"]))

    def test_report_serialization(self):
        report = validator.validate_release(self.root)
        report_path = Path(self.temp.name) / "report.json"
        validator.write_report(report, report_path)
        loaded = json.loads(report_path.read_text(encoding="utf-8"))
        self.assertEqual(loaded["files_checked"], 24)

    def test_process_exit_statuses(self):
        report_path = Path(self.temp.name) / "report.json"
        self.assertEqual(validator.main(["--release", str(self.root), "--report", str(report_path)]), 0)
        self.write_payload({"type": "FeatureCollection", "features": []}, layer="water")
        self.assertEqual(validator.main(["--release", str(self.root)]), 0)
        self.path().write_text("{", encoding="utf-8")
        self.assertEqual(validator.main(["--release", str(self.root)]), 1)

    def test_input_files_remain_unchanged(self):
        before = {path: path.read_bytes() for path in self.root.rglob("*.geojson")}
        validator.validate_release(self.root)
        after = {path: path.read_bytes() for path in self.root.rglob("*.geojson")}
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
