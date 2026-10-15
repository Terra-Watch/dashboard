#!/usr/bin/env python3
"""Validate a relation-aware RESQ7 GeoJSON extraction release.

The validator is intentionally read-only.  It checks every incident/layer file
defined by ``extract_osm_layers.py`` and emits a machine-readable report when
requested.  It does not repair, rewrite, or publish GeoJSON.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Iterable

try:
    from extract_osm_layers import (
        APPROVED_LAYERS,
        EXPECTED_GEOMETRIES,
        INCIDENTS,
        _approved_feature,
        _has_approved_tag,
    )
except ImportError:  # pragma: no cover - supports direct import from repository root
    from scripts.extract_osm_layers import (  # type: ignore
        APPROVED_LAYERS,
        EXPECTED_GEOMETRIES,
        INCIDENTS,
        _approved_feature,
        _has_approved_tag,
    )


VALID_OSM_TYPES = {"node", "way", "relation"}
HARD_FAILURE = "hard_failure"
WARNING = "warning"

try:
    from shapely.geometry import shape as shapely_shape

    SHAPELY_AVAILABLE = True
except ImportError:  # pragma: no cover - depends on the host environment
    shapely_shape = None
    SHAPELY_AVAILABLE = False


def _issue(severity: str, code: str, message: str, feature_index: int | None = None, identity: str | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {"severity": severity, "code": code, "message": message}
    if feature_index is not None:
        item["feature_index"] = feature_index
    if identity is not None:
        item["identity"] = identity
    return item


def _identity(properties: dict[str, Any]) -> tuple[str, int] | None:
    object_type = properties.get("osm_type")
    object_id = properties.get("osm_id")
    if object_type not in VALID_OSM_TYPES or isinstance(object_id, bool):
        return None
    if not isinstance(object_id, int):
        return None
    return object_type, object_id


def _identity_text(identity: tuple[str, int] | None) -> str | None:
    return None if identity is None else f"{identity[0]}/{identity[1]}"


def _position(value: Any) -> tuple[float, float] | None:
    if not isinstance(value, list) or len(value) != 2:
        return None
    if not all(isinstance(number, (int, float)) and not isinstance(number, bool) for number in value):
        return None
    longitude, latitude = float(value[0]), float(value[1])
    if not math.isfinite(longitude) or not math.isfinite(latitude):
        return None
    return longitude, latitude


def _geometry_positions(geometry_type: str, coordinates: Any) -> tuple[list[tuple[float, float]], str | None]:
    """Return positions and a structural error, without repairing coordinates."""
    if geometry_type == "Point":
        point = _position(coordinates)
        return ([] if point is None else [point]), None if point is not None else "Point coordinates are malformed"
    if geometry_type == "MultiPoint":
        if not isinstance(coordinates, list) or not coordinates:
            return [], "MultiPoint coordinates are empty or malformed"
        positions = [_position(point) for point in coordinates]
        return [point for point in positions if point is not None], None if all(point is not None for point in positions) else "MultiPoint contains a malformed position"
    if geometry_type == "LineString":
        if not isinstance(coordinates, list) or len(coordinates) < 2:
            return [], "LineString must contain at least two positions"
        positions = [_position(point) for point in coordinates]
        return [point for point in positions if point is not None], None if all(point is not None for point in positions) else "LineString contains a malformed position"
    if geometry_type == "MultiLineString":
        if not isinstance(coordinates, list) or not coordinates:
            return [], "MultiLineString coordinates are empty or malformed"
        all_positions: list[tuple[float, float]] = []
        for line in coordinates:
            positions, error = _geometry_positions("LineString", line)
            if error:
                return [], f"MultiLineString contains an invalid line: {error}"
            all_positions.extend(positions)
        return all_positions, None
    if geometry_type == "Polygon":
        if not isinstance(coordinates, list) or not coordinates:
            return [], "Polygon has no rings"
        all_positions = []
        for ring in coordinates:
            if not isinstance(ring, list) or len(ring) < 4:
                return [], "Polygon ring has fewer than four positions"
            positions = [_position(point) for point in ring]
            if any(point is None for point in positions):
                return [], "Polygon ring contains a malformed position"
            typed_positions = [point for point in positions if point is not None]
            if typed_positions[0] != typed_positions[-1]:
                return [], "Polygon ring is not closed"
            if len(set(typed_positions[:-1])) < 3:
                return [], "Polygon ring has fewer than three distinct vertices"
            all_positions.extend(typed_positions)
        return all_positions, None
    if geometry_type == "MultiPolygon":
        if not isinstance(coordinates, list) or not coordinates:
            return [], "MultiPolygon has no polygons"
        all_positions = []
        for polygon in coordinates:
            positions, error = _geometry_positions("Polygon", polygon)
            if error:
                return [], f"MultiPolygon contains an invalid polygon: {error}"
            all_positions.extend(positions)
        return all_positions, None
    return [], f"unsupported geometry type: {geometry_type}"


def _geometry_check(geometry: Any, expected_types: set[str]) -> tuple[list[tuple[float, float]], str | None]:
    if not isinstance(geometry, dict):
        return [], "geometry is missing or not an object"
    geometry_type = geometry.get("type")
    if geometry_type not in expected_types:
        return [], f"geometry type {geometry_type!r} is not allowed"
    positions, error = _geometry_positions(geometry_type, geometry.get("coordinates"))
    if error:
        return [], error
    if not positions:
        return [], "geometry is empty"
    if any(not (-180 <= longitude <= 180 and -90 <= latitude <= 90) for longitude, latitude in positions):
        return [], "coordinate is outside longitude/latitude range"
    if SHAPELY_AVAILABLE:
        try:
            candidate = shapely_shape(geometry)
            if candidate.is_empty or not candidate.is_valid:
                return [], "geometry is topologically invalid"
        except Exception as exc:  # pragma: no cover - defensive library boundary
            return [], f"geometry library could not validate geometry: {exc}"
    return positions, None


def _intersects_bbox(positions: list[tuple[float, float]], bbox: tuple[float, float, float, float]) -> bool:
    west, south, east, north = bbox
    min_lon = min(point[0] for point in positions)
    max_lon = max(point[0] for point in positions)
    min_lat = min(point[1] for point in positions)
    max_lat = max(point[1] for point in positions)
    return max_lon >= west and min_lon <= east and max_lat >= south and min_lat <= north


def _feature_stats(path: Path, layer: str, bbox: tuple[float, float, float, float]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "file": str(path),
        "layer": layer,
        "feature_count": 0,
        "valid_feature_count": 0,
        "invalid_feature_count": 0,
        "geometry_types": {},
        "duplicate_identity_count": 0,
        "missing_identity_count": 0,
        "approved_tag_violation_count": 0,
        "out_of_bounds_count": 0,
        "issues": [],
        "warnings": [],
    }
    try:
        with path.open("r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        result["issues"].append(_issue(HARD_FAILURE, "malformed_json", str(exc)))
        return result
    if not isinstance(payload, dict) or payload.get("type") != "FeatureCollection" or not isinstance(payload.get("features"), list):
        result["issues"].append(_issue(HARD_FAILURE, "invalid_feature_collection", "root must be a GeoJSON FeatureCollection with a features list"))
        return result

    identities: set[tuple[str, int]] = set()
    geometry_counts: Counter[str] = Counter()
    for index, feature in enumerate(payload["features"]):
        result["feature_count"] += 1
        if not isinstance(feature, dict) or feature.get("type") != "Feature":
            result["invalid_feature_count"] += 1
            result["issues"].append(_issue(HARD_FAILURE, "invalid_feature", "feature must be a GeoJSON Feature", index))
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            result["invalid_feature_count"] += 1
            result["issues"].append(_issue(HARD_FAILURE, "missing_properties", "feature properties must be an object", index))
            continue
        identity = _identity(properties)
        identity_text = _identity_text(identity)
        if identity is None:
            result["missing_identity_count"] += 1
            result["invalid_feature_count"] += 1
            result["issues"].append(_issue(HARD_FAILURE, "invalid_identity", "osm_type must be node/way/relation and osm_id must be an integer", index))
            continue
        expected_feature_id = f"{identity[0]}/{identity[1]}"
        if properties.get("osm_feature_id") != expected_feature_id:
            result["invalid_feature_count"] += 1
            result["issues"].append(_issue(HARD_FAILURE, "invalid_osm_feature_id", f"expected {expected_feature_id!r}", index, identity_text))
            continue
        if identity in identities:
            result["duplicate_identity_count"] += 1
            result["invalid_feature_count"] += 1
            result["issues"].append(_issue(HARD_FAILURE, "duplicate_identity", "duplicate (osm_type, osm_id)", index, identity_text))
            continue
        identities.add(identity)
        if not _has_approved_tag(layer, properties) or not _approved_feature(layer, properties):
            result["approved_tag_violation_count"] += 1
            result["invalid_feature_count"] += 1
            result["issues"].append(_issue(HARD_FAILURE, "unapproved_tag", "feature has no valid approved identifying tag", index, identity_text))
            continue
        positions, geometry_error = _geometry_check(feature.get("geometry"), EXPECTED_GEOMETRIES[layer])
        geometry_type = feature.get("geometry", {}).get("type") if isinstance(feature.get("geometry"), dict) else None
        if geometry_type is not None:
            geometry_counts[geometry_type] += 1
        if geometry_error:
            result["invalid_feature_count"] += 1
            result["issues"].append(_issue(HARD_FAILURE, "invalid_geometry", geometry_error, index, identity_text))
            continue
        if not _intersects_bbox(positions, bbox):
            result["out_of_bounds_count"] += 1
            result["invalid_feature_count"] += 1
            result["issues"].append(_issue(HARD_FAILURE, "outside_bbox", "feature envelope does not intersect the intended extraction bbox", index, identity_text))
            continue
        if any(not (bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]) for lon, lat in positions):
            result["warnings"].append(_issue(WARNING, "boundary_crossing", "valid geometry extends beyond the extraction bbox", index, identity_text))
        result["valid_feature_count"] += 1

    result["geometry_types"] = dict(sorted(geometry_counts.items()))
    if result["feature_count"] == 0:
        result["warnings"].append(_issue(WARNING, "empty_layer", "layer contains no features"))
    elif result["feature_count"] == 1:
        result["warnings"].append(_issue(WARNING, "sparse_layer", "layer contains one feature; investigate coverage, no minimum is imposed"))
    if not SHAPELY_AVAILABLE:
        result["warnings"].append(_issue(WARNING, "topology_unchecked", "Shapely is unavailable; ring structure was checked but full topology was not"))
    return result


def validate_release(release_root: Path) -> dict[str, Any]:
    """Read-only validation of all 24 expected incident/layer files."""
    report: dict[str, Any] = {
        "release_root": str(release_root),
        "status": "pass",
        "shapely_available": SHAPELY_AVAILABLE,
        "expected_incident_count": len(INCIDENTS),
        "expected_layer_count": len(APPROVED_LAYERS),
        "files_checked": 0,
        "hard_failure_count": 0,
        "warning_count": 0,
        "layers": [],
    }
    for incident_id, spec in INCIDENTS.items():
        incident_report = {"incident_id": incident_id, "bbox": list(spec["bbox"]), "layers": []}
        for layer in APPROVED_LAYERS:
            path = release_root / incident_id / f"{layer}.geojson"
            report["files_checked"] += 1
            if not path.is_file():
                stats = {
                    "file": str(path),
                    "layer": layer,
                    "feature_count": 0,
                    "valid_feature_count": 0,
                    "invalid_feature_count": 0,
                    "geometry_types": {},
                    "duplicate_identity_count": 0,
                    "missing_identity_count": 0,
                    "approved_tag_violation_count": 0,
                    "out_of_bounds_count": 0,
                    "issues": [_issue(HARD_FAILURE, "missing_file", "required layer file does not exist")],
                    "warnings": [],
                }
            else:
                stats = _feature_stats(path, layer, spec["bbox"])
            incident_report["layers"].append(stats)
            report["hard_failure_count"] += sum(item["severity"] == HARD_FAILURE for item in stats["issues"])
            report["warning_count"] += len(stats["warnings"])
        report["layers"].append(incident_report)
    if report["hard_failure_count"]:
        report["status"] = "hard_failure"
    elif report["warning_count"]:
        report["status"] = "warning"
    return report


def write_report(report: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _print_summary(report: dict[str, Any]) -> None:
    print(
        f"GeoJSON validation: {report['status']} | files={report['files_checked']} "
        f"hard_failures={report['hard_failure_count']} warnings={report['warning_count']}"
    )
    for incident in report["layers"]:
        for layer in incident["layers"]:
            print(
                f"  {incident['incident_id']}/{layer['layer']}: "
                f"features={layer['feature_count']} valid={layer['valid_feature_count']} "
                f"invalid={layer['invalid_feature_count']}"
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", type=Path, required=True, help="completed extraction release root")
    parser.add_argument("--report", type=Path, help="write machine-readable JSON report to this path")
    args = parser.parse_args(argv)
    report = validate_release(args.release)
    if args.report:
        write_report(report, args.report)
    _print_summary(report)
    return 1 if report["hard_failure_count"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
