"""Prepare openly sourced, uncalibrated Similipal demo inputs.

This writes only under backend/runtime_data and never touches the research repo.
WorldCover is retained as land-cover evidence, not silently converted into an
Indian Rothermel fuel model.
"""
from pathlib import Path
import gzip
import json
import shutil
import urllib.request

import numpy as np
import rasterio
from rasterio.transform import from_origin
from rasterio.windows import from_bounds

ROOT = Path(__file__).resolve().parents[1] / "runtime_data/simulation_demo"
WORLD_COVER_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_N21E084_Map.tif"
SRTM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/skadi/N21/N21E086.hgt.gz"
BOUNDS = (86.49, 21.85, 86.51, 21.88)


def prepare_worldcover() -> None:
    output = ROOT / "landcover/worldcover_similipal_demo.tif"
    source = "/vsicurl/" + WORLD_COVER_URL
    with rasterio.open(source) as dataset:
        window = from_bounds(*BOUNDS, transform=dataset.transform).round_offsets().round_lengths()
        values = dataset.read(1, window=window)
        transform = dataset.window_transform(window)
        profile = dataset.profile.copy()
        profile.update(driver="GTiff", height=values.shape[0], width=values.shape[1], transform=transform, compress="deflate", tiled=True)
        with rasterio.open(output, "w", **profile) as target:
            target.write(values, 1)


def prepare_terrain() -> None:
    source_gz = ROOT / "terrain/N21E086.hgt.gz"
    elevation = ROOT / "terrain/elevation_similipal_demo.tif"
    slope = ROOT / "terrain/slope_similipal_demo.tif"
    aspect = ROOT / "terrain/aspect_similipal_demo.tif"
    if not source_gz.exists():
        urllib.request.urlretrieve(SRTM_URL, source_gz)
    raw = ROOT / "terrain/N21E086.hgt"
    if not raw.exists():
        with gzip.open(source_gz, "rb") as source, raw.open("wb") as target:
            shutil.copyfileobj(source, target)
    size = 3601
    values = np.fromfile(raw, dtype=">i2").reshape((size, size)).astype("float32")
    transform = from_origin(86.0, 22.0, 1 / 3600, 1 / 3600)
    row0, col0 = rasterio.transform.rowcol(transform, BOUNDS[0], BOUNDS[3])
    row1, col1 = rasterio.transform.rowcol(transform, BOUNDS[2], BOUNDS[1])
    values = values[min(row0, row1):max(row0, row1), min(col0, col1):max(col0, col1)]
    transform = transform * rasterio.Affine.translation(min(col0, col1), min(row0, row1))
    cell_m = 30.0
    gy, gx = np.gradient(values, cell_m, cell_m)
    slope_values = np.degrees(np.arctan(np.hypot(gx, gy))).astype("float32")
    aspect_values = (np.degrees(np.arctan2(-gx, gy)) + 360) % 360
    aspect_values = aspect_values.astype("float32")
    profile = {"driver": "GTiff", "height": values.shape[0], "width": values.shape[1], "count": 1, "dtype": "float32", "crs": "EPSG:4326", "transform": transform, "compress": "deflate"}
    for path, array in ((elevation, values), (slope, slope_values), (aspect, aspect_values)):
        with rasterio.open(path, "w", **profile) as target:
            target.write(array, 1)


def main() -> None:
    (ROOT / "landcover").mkdir(parents=True, exist_ok=True)
    (ROOT / "terrain").mkdir(parents=True, exist_ok=True)
    prepare_worldcover()
    prepare_terrain()
    (ROOT / "manifest.json").write_text(json.dumps({"region": "Similipal demo extent", "bounds": BOUNDS, "inputs": {"terrain": "NASA SRTM 1 arc-second; slope/aspect derived locally", "landcover": "ESA WorldCover 2021 v200", "weather": "GCS GFS 00Z January 2024"}, "fuel_mapping": "UNMAPPED_LANDCOVER_PROXY", "production_eligible": False, "calibration_status": "UNCALIBRATED_DEVELOPMENT_ONLY"}, indent=2) + "\n")


if __name__ == "__main__":
    main()
