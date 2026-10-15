#!/usr/bin/env python3
"""Relation-aware RESQ7 extraction from validated regional OSM PBF files.

This command is intentionally guarded. Production execution requires:

    RESQ7_ALLOW_PRODUCTION_OSM=1 python3 scripts/extract_osm_layers.py --execute

It is not a replacement for the legacy Overpass-JSON converter.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Iterable


INCIDENTS = {
    "E2024-131853": {
        "bbox": (78.5318, 19.1352, 78.6745, 19.2700),
        "region": "southern-zone-latest.osm.pbf",
    },
    "E2024-135332": {
        "bbox": (78.6410, 19.8842, 78.7843, 20.0190),
        "region": "western-zone-latest.osm.pbf",
    },
    "E2023-084925": {
        "bbox": (83.8657, 19.2591, 84.0086, 19.3939),
        "region": "eastern-zone-latest.osm.pbf",
    },
    "E2024-155286": {
        "bbox": (80.8286, 19.0550, 80.9712, 19.1898),
        "region": "central-zone-latest.osm.pbf",
    },
}

APPROVED_FILTERS = {
    "forest": ("nwr/natural=wood", "nwr/landuse=forest"),
    "protected": ("nwr/boundary=protected_area",),
    "roads": (
        "w/highway=motorway,trunk,primary,secondary,tertiary",
    ),
    "settlements": ("nwr/place=city,town,village",),
    "water": ("w/waterway=river", "nwr/natural=water"),
    # admin_level is checked again after export because tags-filter has no
    # compound-key predicate syntax.
    "admin": ("nwr/boundary=administrative",),
}

APPROVED_LAYERS = tuple(APPROVED_FILTERS)
OSM_ATTRIBUTION = "© OpenStreetMap contributors"
EXPECTED_SIZES = {
    "western-zone-latest.osm.pbf": 221215934,
    "eastern-zone-latest.osm.pbf": 247272544,
    "central-zone-latest.osm.pbf": 351766093,
    "southern-zone-latest.osm.pbf": 558191437,
}
EXPECTED_MD5 = {
    "western-zone-latest.osm.pbf": "a6fba2e9da0b2b85928aa9060b6720d0",
    "eastern-zone-latest.osm.pbf": "190724e4b21ed59e8d6334bd125684fa",
    "central-zone-latest.osm.pbf": "0c5030767774dc49bad2bf5458035912",
    "southern-zone-latest.osm.pbf": "cd4deedec8d7d607668849445d5fbbc5",
}
EXPECTED_SHA256 = {
    "western-zone-latest.osm.pbf": "d616089efcf2102eb5303a10443a14a3abe852c2fc186f05a3488bebe15fcaf6",
    "eastern-zone-latest.osm.pbf": "2134a2604524714198ef3963a2ef023245b6660a92f883646e2c46c65b971dfd",
    "central-zone-latest.osm.pbf": "4e277df297f3a488e45b27ae3833d834628e7ff526efd2cdf34a87884a92ee2f",
    "southern-zone-latest.osm.pbf": "96e748cee47e5ec00beb9823b8260fc2f40dd3eecb18c5acd86e7163cc3880d5",
}
EXPECTED_URLS = {
    filename: f"https://download.geofabrik.de/asia/india/{filename}"
    for filename in EXPECTED_SIZES
}
EXPECTED_GEOMETRIES = {
    "forest": {"Polygon", "MultiPolygon"},
    "protected": {"Polygon", "MultiPolygon"},
    "roads": {"LineString", "MultiLineString"},
    "settlements": {"Point", "MultiPoint", "Polygon", "MultiPolygon"},
    "water": {"LineString", "MultiLineString", "Polygon", "MultiPolygon"},
    "admin": {"Polygon", "MultiPolygon"},
}


class PipelineError(RuntimeError):
    """Expected, actionable pipeline failure."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def active_download_targets(
    process_reader: Callable[[], str] | None = None,
) -> list[str]:
    """Return active aria2 commands without opening any data files."""
    if process_reader is None:
        result = subprocess.run(
            ["ps", "ax", "-o", "command="],
            capture_output=True,
            text=True,
            check=False,
        )
        process_reader = lambda: result.stdout
    return [
        line.strip()
        for line in process_reader().splitlines()
        if "aria2c" in line and "southern-zone-latest.osm.pbf" in line
    ]


def _manifest_entries(manifest_path: Path) -> dict[str, dict]:
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PipelineError(f"cannot read manifest {manifest_path}: {exc}") from exc
    if data.get("source") != "Official Geofabrik OpenStreetMap regional extracts":
        raise PipelineError("manifest source is not the official Geofabrik source")
    entries = data.get("entries")
    if not isinstance(entries, list):
        raise PipelineError("manifest has no entries list")
    return {str(entry.get("region")): entry for entry in entries if isinstance(entry, dict)}


def _hash_file(path: Path) -> tuple[str, str]:
    md5 = hashlib.md5()
    sha256 = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            md5.update(chunk)
            sha256.update(chunk)
    return md5.hexdigest(), sha256.hexdigest()


def check_inputs(
    worktree: Path,
    *,
    manifest_path: Path | None = None,
    process_reader: Callable[[], str] | None = None,
) -> dict[str, Path]:
    """Validate all four final regional inputs without touching active partials."""
    if active_download_targets(process_reader):
        raise PipelineError(
            "Southern download is active; production extraction is blocked before "
            "any Southern file access"
        )

    manifest = _manifest_entries(
        manifest_path or worktree / "data/osm/geofabrik/manifest.json"
    )
    result: dict[str, Path] = {}
    data_dir = worktree / "data/osm/geofabrik"
    for incident_id, spec in INCIDENTS.items():
        filename = spec["region"]
        region_name = filename.removesuffix("-latest.osm.pbf").replace("-", " ").title()
        entry = manifest.get(region_name)
        path = data_dir / filename
        if path.name.endswith(".part") or path.with_name(path.name + ".part").exists():
            raise PipelineError(f"partial input detected for {incident_id}: {path}")
        if path.is_symlink():
            raise PipelineError(f"symlinked regional input is not allowed: {path}")
        if not path.exists():
            raise PipelineError(f"missing regional PBF for {incident_id}: {path}")
        if entry is None:
            raise PipelineError(f"manifest entry is missing for {filename}")
        if entry.get("status") != "validated":
            raise PipelineError(
                f"manifest does not mark {filename} as validated: {entry.get('status')}"
            )
        expected_size = EXPECTED_SIZES[filename]
        if path.stat().st_size != expected_size:
            raise PipelineError(
                f"size mismatch for {filename}: {path.stat().st_size} != {expected_size}"
            )
        if entry.get("expected_size_bytes") != expected_size or entry.get("actual_size_bytes") != expected_size:
            raise PipelineError(f"manifest size record is inconsistent for {filename}")
        if entry.get("file_path") != f"data/osm/geofabrik/{filename}":
            raise PipelineError(f"manifest path record is inconsistent for {filename}")
        if entry.get("source_url") != EXPECTED_URLS[filename]:
            raise PipelineError(f"manifest source URL is inconsistent for {filename}")
        if entry.get("published_md5") != EXPECTED_MD5[filename]:
            raise PipelineError(f"manifest published MD5 is inconsistent for {filename}")
        if entry.get("calculated_md5") != EXPECTED_MD5[filename]:
            raise PipelineError(f"manifest calculated MD5 is inconsistent for {filename}")
        if entry.get("calculated_sha256") != EXPECTED_SHA256[filename]:
            raise PipelineError(f"manifest calculated SHA-256 is inconsistent for {filename}")
        if not entry.get("published_source_timestamp"):
            raise PipelineError(f"manifest source timestamp is missing for {filename}")
        calculated_md5, calculated_sha256 = _hash_file(path)
        if calculated_md5 != EXPECTED_MD5[filename]:
            raise PipelineError(f"published MD5 mismatch for {filename}")
        if calculated_sha256 != EXPECTED_SHA256[filename]:
            raise PipelineError(f"SHA-256 mismatch for {filename}")
        result[incident_id] = path
    return result


def _bbox_text(bbox: tuple[float, float, float, float]) -> str:
    return ",".join(f"{value:.7f}" for value in bbox)


def build_extract_command(osmium: str, source: Path, output: Path, bbox: tuple[float, float, float, float]) -> list[str]:
    return [
        osmium, "extract", "--strategy", "smart", "--bbox", _bbox_text(bbox),
        "--output-format", "pbf", "--output", str(output), str(source),
    ]


def build_filter_command(osmium: str, source: Path, output: Path, expressions: Iterable[str]) -> list[str]:
    return [
        osmium, "tags-filter", "--input-format", "pbf", "--output-format", "pbf",
        "--output", str(output), str(source), *expressions,
    ]


def build_check_refs_command(osmium: str, source: Path) -> list[str]:
    return [osmium, "check-refs", str(source)]


def build_export_command(osmium: str, source: Path, output: Path) -> list[str]:
    return [
        osmium, "export", "--input-format", "pbf", "--output-format", "geojson",
        "--output", str(output), "--attributes", "type,id",
        "--show-errors", "--stop-on-error", str(source),
    ]


def run_checked(command: list[str], *, label: str) -> None:
    try:
        result = subprocess.run(command, capture_output=True, text=True, check=False)
    except FileNotFoundError as exc:
        raise PipelineError(
            f"{label}: required executable is unavailable: {command[0]}. "
            "Install it separately and obtain approval first."
        ) from exc
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()[-2000:]
        raise PipelineError(f"{label} failed with exit {result.returncode}: {detail}")


def _feature_identity(properties: dict) -> tuple[str, int] | None:
    object_type = properties.get("osm_type", properties.get("type"))
    object_id = properties.get("osm_id", properties.get("id"))
    if object_type is None or object_id is None:
        return None
    try:
        return str(object_type), int(object_id)
    except (TypeError, ValueError):
        return None


def _with_stable_feature_id(feature: dict, identity: tuple[str, int]) -> dict:
    normalized = dict(feature)
    properties = dict(feature.get("properties", {}))
    properties["osm_feature_id"] = f"{identity[0]}/{identity[1]}"
    normalized["properties"] = properties
    return normalized


def _coordinates(value) -> Iterable[tuple[float, float]]:
    if isinstance(value, list) and len(value) == 2 and all(isinstance(v, (int, float)) for v in value):
        yield float(value[0]), float(value[1])
    elif isinstance(value, list):
        for child in value:
            yield from _coordinates(child)


def _valid_geometry(geometry: dict) -> bool:
    if not isinstance(geometry, dict) or geometry.get("type") not in {
        "Point", "MultiPoint", "LineString", "MultiLineString",
        "Polygon", "MultiPolygon",
    }:
        return False
    coords = list(_coordinates(geometry.get("coordinates")))
    if not coords or any(not math.isfinite(x) or not math.isfinite(y) for x, y in coords):
        return False
    if geometry["type"] in {"LineString", "MultiLineString"} and len(coords) < 2:
        return False
    if geometry["type"] in {"Polygon", "MultiPolygon"}:
        rings = geometry["coordinates"] if geometry["type"] == "Polygon" else [
            ring for polygon in geometry["coordinates"] for ring in polygon
        ]
        if any(
            len(ring) < 4
            or ring[0] != ring[-1]
            or len({tuple(point) for point in ring[:-1]}) < 3
            for ring in rings
        ):
            return False
    return True


def _approved_feature(layer: str, properties: dict) -> bool:
    if layer == "forest":
        return properties.get("natural") == "wood" or properties.get("landuse") == "forest"
    if layer == "protected":
        return properties.get("boundary") == "protected_area"
    if layer == "roads":
        return properties.get("highway") in {"motorway", "trunk", "primary", "secondary", "tertiary"}
    if layer == "settlements":
        return properties.get("place") in {"city", "town", "village"}
    if layer == "water":
        return properties.get("waterway") == "river" or properties.get("natural") == "water"
    if layer == "admin":
        try:
            level = int(properties.get("admin_level"))
        except (TypeError, ValueError):
            return False
        return properties.get("boundary") == "administrative" and 2 <= level <= 8
    return False


def _has_approved_tag(layer: str, properties: dict) -> bool:
    """Identify a feature that should not be silently discarded as a dependency."""
    if layer == "forest":
        return properties.get("natural") == "wood" or properties.get("landuse") == "forest"
    if layer == "protected":
        return properties.get("boundary") == "protected_area"
    if layer == "roads":
        return properties.get("highway") in {"motorway", "trunk", "primary", "secondary", "tertiary"}
    if layer == "settlements":
        return properties.get("place") in {"city", "town", "village"}
    if layer == "water":
        return properties.get("waterway") == "river" or properties.get("natural") == "water"
    if layer == "admin":
        return properties.get("boundary") == "administrative"
    return False


def validate_geojson(
    data: dict,
    layer: str,
    bbox: tuple[float, float, float, float] | None = None,
) -> tuple[dict, int]:
    """Validate and deterministically filter one Osmium GeoJSON export."""
    if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
        raise PipelineError("export is not a GeoJSON FeatureCollection")
    accepted = []
    identities: set[tuple[str, int]] = set()
    for feature in data["features"]:
        properties = feature.get("properties", {}) if isinstance(feature, dict) else {}
        identity = _feature_identity(properties)
        if identity is None:
            if _has_approved_tag(layer, properties):
                raise PipelineError(f"approved {layer} feature is missing OSM identity")
            continue
        if not _approved_feature(layer, properties):
            continue
        if not _valid_geometry(feature.get("geometry", {})):
            raise PipelineError(f"invalid {layer} geometry for OSM object {identity}")
        if feature["geometry"]["type"] not in EXPECTED_GEOMETRIES[layer]:
            raise PipelineError(
                f"unexpected {layer} geometry type for OSM object {identity}: "
                f"{feature['geometry']['type']}"
            )
        if bbox is not None:
            west, south, east, north = bbox
            if not any(west <= x <= east and south <= y <= north for x, y in _coordinates(feature["geometry"]["coordinates"])):
                raise PipelineError(f"{layer} feature {identity} is outside requested bbox")
        if identity in identities:
            raise PipelineError(f"duplicate OSM identity in {layer}: {identity}")
        identities.add(identity)
        accepted.append(_with_stable_feature_id(feature, identity))
    accepted.sort(key=lambda feature: _feature_identity(feature["properties"]))
    return {
        "type": "FeatureCollection",
        "features": accepted,
        "metadata": {
            "attribution": OSM_ATTRIBUTION,
            "layer": layer,
            "bbox": list(bbox) if bbox else None,
            "bbox_policy": "relation-aware exports may retain member coordinates outside the box",
        },
    }, len(accepted)


def publish_geojson(payload: dict, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=destination.parent,
            prefix=f".{destination.name}.", suffix=".tmp", delete=False,
        ) as handle:
            temporary = Path(handle.name)
            json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    except Exception:
        if "temporary" in locals():
            temporary.unlink(missing_ok=True)
        raise


def publish_release(staging_run: Path, output_root: Path, provenance: dict) -> Path:
    """Publish one complete validated run while preserving the prior current run."""
    releases = output_root / "releases"
    releases.mkdir(parents=True, exist_ok=True)
    publish_geojson(provenance, staging_run / "manifest.json")
    release = releases / staging_run.name
    if release.exists() or release.is_symlink():
        raise PipelineError(f"release already exists: {release}")
    os.replace(staging_run, release)
    current_temp = output_root / f".current.{staging_run.name}.tmp"
    try:
        current_temp.unlink(missing_ok=True)
        current_temp.symlink_to(Path("releases") / release.name)
        os.replace(current_temp, output_root / "current")
    except Exception:
        current_temp.unlink(missing_ok=True)
        raise
    return release


def production_pipeline(worktree: Path) -> None:
    if os.environ.get("RESQ7_ALLOW_PRODUCTION_OSM") != "1":
        raise PipelineError(
            "production execution is guarded; set RESQ7_ALLOW_PRODUCTION_OSM=1 "
            "only after all four PBFs are independently validated"
        )
    osmium = shutil.which("osmium")
    if not osmium:
        raise PipelineError("osmium is unavailable; install it only with approval")
    sources = check_inputs(worktree)
    output_root = worktree / "data/osm/extracted"
    staging_root = worktree / "data/osm/.staging"
    staging_root.mkdir(parents=True, exist_ok=True)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{os.getpid()}"
    staging_run = staging_root / run_id
    staging_run.mkdir(parents=True, exist_ok=False)
    provenance = {"generated_at": utc_now(), "attribution": OSM_ATTRIBUTION, "entries": []}
    for incident_id, spec in INCIDENTS.items():
        incident_stage = staging_run / incident_id
        incident_stage.mkdir(parents=True, exist_ok=True)
        extracted = incident_stage / "box.osm.pbf"
        run_checked(
            build_extract_command(osmium, sources[incident_id], extracted, spec["bbox"]),
            label=f"extract {incident_id}",
        )
        run_checked(build_check_refs_command(osmium, extracted), label=f"check-refs {incident_id}")
        for layer, expressions in APPROVED_FILTERS.items():
            filtered = incident_stage / f"{layer}.osm.pbf"
            exported = incident_stage / f"{layer}.geojson"
            run_checked(
                build_filter_command(osmium, extracted, filtered, expressions),
                label=f"filter {incident_id}/{layer}",
            )
            run_checked(build_check_refs_command(osmium, filtered), label=f"check-refs {incident_id}/{layer}")
            run_checked(
                build_export_command(osmium, filtered, exported),
                label=f"export {incident_id}/{layer}",
            )
            payload = json.loads(exported.read_text(encoding="utf-8"))
            validated, count = validate_geojson(payload, layer, spec["bbox"])
            destination = staging_run / incident_id / f"{layer}.geojson"
            publish_geojson(validated, destination)
            provenance["entries"].append({
                "incident_id": incident_id, "layer": layer,
                "feature_count": count,
                "path": str((output_root / "current" / incident_id / f"{layer}.geojson").relative_to(worktree)),
            })
    publish_release(staging_run, output_root, provenance)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="run guarded production extraction")
    args = parser.parse_args()
    if not args.execute:
        parser.error("production extraction is blocked; pass --execute only with the approval guard")
    production_pipeline(Path(__file__).resolve().parents[1])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
