"""
convert_and_tile.py — RESQ7 Step 1, Phase 2
Convert approved OSM-derived GeoJSON inputs → PMTiles using tippecanoe.

Prerequisites:
  - the approved local extraction pipeline must have produced validated inputs;
    legacy Overpass JSON is retained only for offline compatibility tests
  - tippecanoe must be installed (verified at /opt/homebrew/bin/tippecanoe)
  - pmtiles CLI must be installed (verified at /opt/homebrew/bin/pmtiles)

Run from the RESQ7 worktree root:
  python3 scripts/convert_and_tile.py

The build stages all six archives in a temporary directory, validates each
archive with `pmtiles show --metadata`, and publishes none unless all six have
the expected vector layer. Existing archives remain untouched on an incomplete
or failed build.

Output:
  frontend/public/tiles/current/osm-<layer>.pmtiles  (one file per layer)
  data/layers/tile_manifest.json             (build record)

SAFETY: Never overwrites resq-basemap.pmtiles or any non-osm-* tile file;
published layers are exposed through one atomic current-release symlink.
"""

import json
import os
import shutil
import subprocess
import tempfile
from collections import Counter
from pathlib import Path
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent
WORKTREE = SCRIPT_DIR.parent
DATA_LAYERS = WORKTREE / "data" / "layers"
EXTRACTED_ROOT = WORKTREE / "data" / "osm" / "extracted" / "current"
TILES_DIR = WORKTREE / "frontend" / "public" / "tiles"
TILE_MANIFEST = DATA_LAYERS / "tile_manifest.json"
DOWNLOAD_MANIFEST = DATA_LAYERS / "download_manifest.json"

TIPPECANOE = "/opt/homebrew/bin/tippecanoe"
PMTILES_CLI = "/opt/homebrew/bin/pmtiles"

# ---------------------------------------------------------------------------
# Layer configuration
# layer_name -> (source_layer_name, geometry_type, tippecanoe_extra_flags)
#
# Source-layer names follow the convention used by Protomaps/MapLibre:
#   osm_forest, osm_protected, osm_roads, osm_settlements, osm_water, osm_admin
# Zoom levels:
#   - polygon layers (forest, protected, water, admin): z4-z14
#   - line layers   (roads):                            z8-z14
#   - point layers  (settlements):                      z6-z14
# ---------------------------------------------------------------------------

LAYER_CONFIG = {
    "forest": {
        "source_layer": "osm_forest",
        "geom_types": {"way", "relation"},
        "tippecanoe_flags": [
            "--minimum-zoom=4", "--maximum-zoom=14",
            "--simplification=2",
            "--detect-shared-borders",
        ],
    },
    "protected": {
        "source_layer": "osm_protected",
        "geom_types": {"way", "relation"},
        "tippecanoe_flags": [
            "--minimum-zoom=4", "--maximum-zoom=14",
            "--simplification=2",
            "--detect-shared-borders",
        ],
    },
    "roads": {
        "source_layer": "osm_roads",
        "geom_types": {"way"},
        "tippecanoe_flags": [
            "--minimum-zoom=8", "--maximum-zoom=14",
            "--simplification=1",
        ],
    },
    "settlements": {
        "source_layer": "osm_settlements",
        "geom_types": {"node"},
        "tippecanoe_flags": [
            "--minimum-zoom=6", "--maximum-zoom=14",
        ],
    },
    "water": {
        "source_layer": "osm_water",
        "geom_types": {"way", "relation"},
        "tippecanoe_flags": [
            "--minimum-zoom=4", "--maximum-zoom=14",
            "--simplification=2",
            "--detect-shared-borders",
        ],
    },
    "admin": {
        "source_layer": "osm_admin",
        "geom_types": {"way", "relation"},
        "tippecanoe_flags": [
            "--minimum-zoom=4", "--maximum-zoom=14",
            "--simplification=3",
            "--detect-shared-borders",
        ],
    },
}

INCIDENT_IDS = ["E2024-131853", "E2024-135332", "E2023-084925", "E2024-155286"]

# ---------------------------------------------------------------------------
# Overpass JSON → GeoJSON conversion
# ---------------------------------------------------------------------------

class UnsupportedGeometryError(ValueError):
    """Raised when the legacy Overpass JSON cannot safely assemble geometry."""


def _coordinates(geometry: list[dict]) -> list[list[float]]:
    return [
        [point["lon"], point["lat"]]
        for point in geometry
        if "lon" in point and "lat" in point
    ]


def _is_area_way(tags: dict) -> bool:
    """Return true only for approved polygon-like tags.

    Roads and waterways are linear features.  The previous implementation
    closed every non-river way, which converted roads into invalid polygons.
    """
    return (
        tags.get("area") == "yes"
        or tags.get("natural") in {"wood", "water"}
        or tags.get("landuse") == "forest"
        or tags.get("boundary") in {"protected_area", "administrative"}
    )


def overpass_element_to_feature(element: dict) -> dict | None:
    """
    Convert a single Overpass JSON element to a GeoJSON Feature.
    Handles nodes and simple ways.  Relation geometry is deliberately rejected:
    assigning inner rings to the first outer ring is not relation-aware and can
    produce operationally wrong protected-area or administrative geometry.
    Relation-complete conversion must use the local PBF/Osmium pipeline.
    """
    elem_type = element.get("type")
    tags = element.get("tags", {})
    props = {
        "osm_id": element.get("id"),
        "osm_type": elem_type,
        "osm_feature_id": f"{elem_type}/{element.get('id')}",
        **tags,
    }

    if elem_type == "node":
        lat = element.get("lat")
        lon = element.get("lon")
        if lat is None or lon is None:
            return None
        return {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": props,
        }

    if elem_type == "way":
        geom = element.get("geometry", [])
        if not geom:
            return None
        coords = _coordinates(geom)
        if len(coords) < 2:
            return None
        if tags.get("highway") in {"motorway", "trunk", "primary", "secondary", "tertiary"}:
            geometry = {"type": "LineString", "coordinates": coords}
        elif tags.get("waterway") == "river":
            geometry = {"type": "LineString", "coordinates": coords}
        elif _is_area_way(tags):
            if coords[0] != coords[-1] or len(coords) < 4:
                return None
            geometry = {"type": "Polygon", "coordinates": [coords]}
        else:
            # Unknown/open ways are not safe to promote to polygons.
            return None
        return {
            "type": "Feature",
            "geometry": geometry,
            "properties": props,
        }

    if elem_type == "relation":
        raise UnsupportedGeometryError(
            f"relation {element.get('id')} requires relation-aware PBF/Osmium export"
        )

    return None


def convert_layer_to_geojson(
    layer_name: str,
    *,
    data_layers: Path = DATA_LAYERS,
    extracted_root: Path = EXTRACTED_ROOT,
    output_dir: Path | None = None,
) -> tuple[Path | None, int, str]:
    """
    Merge all downloaded JSON files for a layer into a single GeoJSON FeatureCollection.
    Returns (geojson_path, feature_count, status).
    Status: "converted" | "pending" | "empty"
    """
    layer_dir = data_layers / layer_name
    extracted_inputs = [extracted_root / incident_id / f"{layer_name}.geojson" for incident_id in INCIDENT_IDS]
    use_extracted = extracted_root.exists() or any(path.exists() for path in extracted_inputs)
    features = []
    seen_objects: set[tuple[str, int]] = set()
    skipped = Counter()
    files_found = 0
    files_missing = 0

    for incident_id in INCIDENT_IDS:
        src = (
            extracted_root / incident_id / f"{layer_name}.geojson"
            if use_extracted else layer_dir / f"{incident_id}.json"
        )
        if not src.exists():
            files_missing += 1
            continue
        try:
            with open(src, "r", encoding="utf-8") as f:
                data = json.load(f)
        except (json.JSONDecodeError, OSError) as e:
            print(f"  [WARN] {layer_name}/{incident_id}: could not read ({e})")
            files_missing += 1
            continue

        if use_extracted:
            if data.get("type") != "FeatureCollection" or not isinstance(data.get("features"), list):
                print(f"  [WARN] {layer_name}/{incident_id}: invalid extracted FeatureCollection")
                files_missing += 1
                continue
            for feature in data["features"]:
                properties = feature.get("properties", {}) if isinstance(feature, dict) else {}
                object_key = (str(properties.get("osm_type")), properties.get("osm_id"))
                if object_key in seen_objects:
                    continue
                seen_objects.add(object_key)
                if properties.get("osm_feature_id") is None and properties.get("osm_type") is not None and properties.get("osm_id") is not None:
                    feature = dict(feature)
                    feature["properties"] = dict(properties)
                    feature["properties"]["osm_feature_id"] = f"{properties['osm_type']}/{properties['osm_id']}"
                features.append(feature)
            files_found += 1
            continue

        elements = data.get("elements", [])
        files_found += 1
        for elem in elements:
            object_key = (str(elem.get("type")), elem.get("id"))
            if object_key in seen_objects:
                continue
            seen_objects.add(object_key)
            try:
                feat = overpass_element_to_feature(elem)
            except UnsupportedGeometryError as exc:
                skipped["unsupported_relation"] += 1
                print(f"  [WARN] {layer_name}/{incident_id}: {exc}")
                continue
            if feat is not None:
                features.append(feat)

    if files_found == 0:
        return None, 0, "pending"

    if skipped:
        return None, len(features), "invalid"

    if files_missing > 0:
        return None, len(features), "partial"

    if not features:
        return None, 0, "empty"

    features.sort(key=lambda feature: (
        feature["properties"].get("osm_type", ""),
        feature["properties"].get("osm_id", 0),
    ))
    geojson = {"type": "FeatureCollection", "features": features}
    out_path = (output_dir or data_layers) / f"{layer_name}_merged.geojson"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = out_path.with_suffix(out_path.suffix + ".tmp")
    try:
        with open(temporary, "w", encoding="utf-8") as f:
            json.dump(geojson, f, separators=(",", ":"))
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        temporary.replace(out_path)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise

    return out_path, len(features), "converted"


# ---------------------------------------------------------------------------
# tippecanoe build
# ---------------------------------------------------------------------------

def build_pmtiles(
    layer_name: str,
    geojson_path: Path,
    config: dict,
    *,
    output_dir: Path = TILES_DIR,
) -> tuple[bool, str]:
    """
    Run tippecanoe to convert a GeoJSON file to a PMTiles archive.
    Returns (success, message).
    """
    out_path = output_dir / f"osm-{layer_name}.pmtiles"
    output_dir.mkdir(parents=True, exist_ok=True)

    # Safety check: never overwrite the basemap or non-osm files
    if out_path.name == "resq-basemap.pmtiles":
        return False, "REFUSED: would overwrite resq-basemap.pmtiles"
    if not out_path.name.startswith("osm-"):
        return False, f"REFUSED: output name does not start with 'osm-': {out_path.name}"

    cmd = [
        TIPPECANOE,
        "--output", str(out_path),
        "--layer", config["source_layer"],
        "--name", f"RESQ OSM {layer_name}",
        "--description", f"OSM {layer_name} layer for RESQ demo boxes (ODbL)",
        "--attribution", "© OpenStreetMap contributors",
        # Tippecanoe feature IDs must be numeric. OSM IDs are type-scoped and
        # the composite identity is retained as a property; deterministic
        # input ordering plus generated IDs avoids cross-type collisions.
        "--generate-ids",
        "--preserve-input-order",
        "--quiet",
        *config["tippecanoe_flags"],
        str(geojson_path),
    ]

    print(f"  tippecanoe {layer_name}...")
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        return False, "tippecanoe timed out after 300s"
    except FileNotFoundError:
        return False, f"tippecanoe not found at {TIPPECANOE}"

    if result.returncode != 0:
        stderr = result.stderr.strip()
        return False, f"tippecanoe exit {result.returncode}: {stderr[:500]}"

    if not out_path.exists() or out_path.stat().st_size == 0:
        return False, "tippecanoe exited 0 but output file not found"

    metadata = inspect_pmtiles(out_path)
    if metadata.get("error"):
        return False, f"PMTiles validation failed: {metadata['error']}"
    if config["source_layer"] not in metadata.get("vector_layers", set()):
        return False, f"PMTiles is missing expected vector layer {config['source_layer']}"

    return True, str(out_path)


def inspect_pmtiles(path: Path) -> dict:
    """Run `pmtiles show --metadata` and return validated layer metadata."""
    try:
        result = subprocess.run(
            [PMTILES_CLI, "show", "--metadata", str(path)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return {"error": result.stderr.strip() or "pmtiles show failed"}
        metadata = json.loads(result.stdout)
        vector_layers = metadata.get("vector_layers")
        if not isinstance(vector_layers, list):
            return {"error": "PMTiles metadata has no vector_layers list"}
        layer_ids = {
            layer.get("id") for layer in vector_layers
            if isinstance(layer, dict) and isinstance(layer.get("id"), str)
        }
        return {"metadata": metadata, "vector_layers": layer_ids}
    except (OSError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        return {"error": str(exc)}


def write_manifest_atomic(manifest: dict, destination: Path) -> None:
    """Write a build report without exposing a truncated JSON manifest."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.{os.getpid()}.tmp")
    try:
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(manifest, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def publish_tile_release(
    staged_tiles: Path,
    tiles_dir: Path,
    layer_names: list[str],
    *,
    release_name: str,
) -> Path:
    """Atomically expose a complete six-layer tile release via ``current``."""
    required = [staged_tiles / f"osm-{layer}.pmtiles" for layer in layer_names]
    if not all(path.is_file() and path.stat().st_size > 0 for path in required):
        raise ValueError("cannot publish an incomplete PMTiles release")
    if not (staged_tiles / "manifest.json").is_file():
        raise ValueError("cannot publish a PMTiles release without its manifest")

    releases = tiles_dir / "releases"
    releases.mkdir(parents=True, exist_ok=True)
    release = releases / release_name
    if release.exists() or release.is_symlink():
        raise ValueError(f"PMTiles release already exists: {release}")
    os.replace(staged_tiles, release)

    current = tiles_dir / "current"
    if current.exists() and not current.is_symlink():
        raise ValueError(f"PMTiles current path is not a symlink: {current}")
    temporary_link = tiles_dir / f".current.{release_name}.tmp"
    try:
        temporary_link.unlink(missing_ok=True)
        temporary_link.symlink_to(Path("releases") / release_name)
        os.replace(temporary_link, current)
    except Exception:
        temporary_link.unlink(missing_ok=True)
        raise
    return release


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    TILES_DIR.mkdir(parents=True, exist_ok=True)

    print("RESQ7 Step 1 — convert and tile")
    print(f"  Input:  {DATA_LAYERS}")
    print(f"  Output: {TILES_DIR}")
    print()

    tile_entries = []
    build_root = Path(tempfile.mkdtemp(prefix=".osm-build-", dir=TILES_DIR))
    geojson_root = build_root / "geojson"
    staged_tiles = build_root / "tiles"
    try:
        for layer_name, config in LAYER_CONFIG.items():
            print(f"[{layer_name}]")
            geojson_path, feat_count, conv_status = convert_layer_to_geojson(
                layer_name, output_dir=geojson_root
            )

            if conv_status == "pending":
                print("  PENDING — no downloaded JSON files found.")
                tile_entries.append({
                    "layer": layer_name, "source_layer": config["source_layer"],
                    "status": "pending", "feature_count": 0,
                    "pmtiles_path": None, "pmtiles_metadata": None,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "note": "No downloaded data.",
                })
                continue

            if conv_status == "empty":
                print(f"  EMPTY — {feat_count} convertible features")
                tile_entries.append({
                    "layer": layer_name, "source_layer": config["source_layer"],
                    "status": "empty", "feature_count": 0,
                    "pmtiles_path": None, "pmtiles_metadata": None,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
                continue

            if conv_status == "partial":
                print("  BLOCKED — source coverage is incomplete.")
                tile_entries.append({
                    "layer": layer_name, "source_layer": config["source_layer"],
                    "status": "partial_input", "feature_count": feat_count,
                    "pmtiles_path": None, "pmtiles_metadata": None,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "note": "All four incident inputs are required.",
                })
                continue

            if conv_status == "invalid":
                print("  BLOCKED — relation geometry requires the Osmium pipeline.")
                tile_entries.append({
                    "layer": layer_name, "source_layer": config["source_layer"],
                    "status": "unsafe_input", "feature_count": feat_count,
                    "pmtiles_path": None, "pmtiles_metadata": None,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "note": "Approximate relation conversion is disabled.",
                })
                continue

            print(f"  GeoJSON: {feat_count} features → {geojson_path.name}")
            success, msg = build_pmtiles(
                layer_name, geojson_path, config, output_dir=staged_tiles
            )
            if not success:
                print(f"  FAILED: {msg}")
                tile_entries.append({
                    "layer": layer_name, "source_layer": config["source_layer"],
                    "status": "build_failed", "feature_count": feat_count,
                    "pmtiles_path": None, "pmtiles_metadata": None,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "error": msg,
                })
                continue

            tile_path = staged_tiles / f"osm-{layer_name}.pmtiles"
            metadata = inspect_pmtiles(tile_path)
            tile_entries.append({
                "layer": layer_name, "source_layer": config["source_layer"],
                "status": "success", "feature_count": feat_count,
                "pmtiles_path": f"frontend/public/tiles/osm-{layer_name}.pmtiles",
                "pmtiles_size_bytes": tile_path.stat().st_size,
                "pmtiles_metadata": metadata.get("metadata", {}),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

        all_success = len(tile_entries) == len(LAYER_CONFIG) and all(
            entry["status"] == "success" for entry in tile_entries
        )
        release_name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + f"-{os.getpid()}"
        manifest = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "worktree": str(WORKTREE),
            "source": "OpenStreetMap regional PBF via Osmium",
            "licence": "ODbL 1.0 — © OpenStreetMap contributors",
            "release": release_name if all_success else None,
            "entries": tile_entries,
        }
        if all_success:
            for entry in tile_entries:
                entry["pmtiles_path"] = f"frontend/public/tiles/current/osm-{entry['layer']}.pmtiles"
        write_manifest_atomic(manifest, staged_tiles / "manifest.json")
        if all_success:
            publish_tile_release(
                staged_tiles, TILES_DIR, list(LAYER_CONFIG), release_name=release_name
            )
        else:
            print("No PMTiles were published because the six-layer build was incomplete.")

        write_manifest_atomic(manifest, TILE_MANIFEST)

        print("=" * 60)
        print("TILE BUILD SUMMARY")
        print("=" * 60)
        for entry in tile_entries:
            path = entry.get("pmtiles_path") or "—"
            print(f"  {entry['layer']:<15} {entry['status'].upper():<14} features={entry['feature_count']:>6}  {path}")
        return tile_entries
    finally:
        shutil.rmtree(build_root, ignore_errors=True)


if __name__ == "__main__":
    main()
