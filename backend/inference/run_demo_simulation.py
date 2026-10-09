"""Build and run the RESQ Similipal development simulation.

Inputs are public/demo data only. This never writes to wildfire-research or
wild-fire-simulation; it reads the Cell2Fire binary and lookup table there.
"""
from __future__ import annotations

import csv
import json
import math
import shutil
import struct
import subprocess
import zlib
from pathlib import Path

from proxy_mapping import PROXY_STATUS, WORLDCOVER_TO_CELL2FIRE

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "runtime_data/simulation_demo"
SCENARIO = DATA / "scenario"
OUTPUT = DATA / "run"
PUBLIC = ROOT.parent / "frontend/public/simulation/similipal-demo"
SOURCE_SIM = Path("/Users/kireeti/Desktop/Projects/wild-fire-simulation")
BINARY = SOURCE_SIM / "external/Cell2Fire/Cell2Fire/Cell2Fire"
LOOKUP = SOURCE_SIM / "cell2fire/tests/fixtures/synthetic_40x40/spain_lookup_table.csv"
ROWS = COLS = 40
CELL_SIZE_M = 30
CENTER_ROW = CENTER_COL = 20
ORIGIN_LATITUDE = 21.867894
ORIGIN_LONGITUDE = 86.500688


def _write_asc(path: Path, values, *, xll: float = ORIGIN_LONGITUDE - 0.005, yll: float = ORIGIN_LATITUDE - 0.005) -> None:
    with path.open("w") as handle:
        handle.write(f"ncols {values.shape[1]}\nnrows {values.shape[0]}\n")
        handle.write(f"xllcorner {xll}\nyllcorner {yll}\ncellsize {CELL_SIZE_M}\nNODATA_value -9999\n")
        for row in values:
            handle.write(" ".join(str(int(value)) for value in row) + "\n")


def _build_grid() -> dict[str, object]:
    try:
        import numpy as np
        import rasterio
        from rasterio.windows import Window
    except ModuleNotFoundError as exc:
        raise RuntimeError("rasterio is required only to regenerate the staged raster inputs; install backend requirements or keep the prepared scenario files.") from exc
    landcover = DATA / "landcover/worldcover_similipal_demo.tif"
    elevation = DATA / "terrain/elevation_similipal_demo.tif"
    with rasterio.open(landcover) as lc, rasterio.open(elevation) as dem:
        lc_center = rasterio.transform.rowcol(lc.transform, ORIGIN_LONGITUDE, ORIGIN_LATITUDE)
        dem_center = rasterio.transform.rowcol(dem.transform, ORIGIN_LONGITUDE, ORIGIN_LATITUDE)
        lc_window = Window(lc_center[1] - COLS * 1.5, lc_center[0] - ROWS * 1.5, COLS * 3, ROWS * 3)
        dem_window = Window(dem_center[1] - COLS / 2, dem_center[0] - ROWS / 2, COLS, ROWS)
        lc_raw = lc.read(1, window=lc_window, boundless=True, fill_value=0)
        dem_raw = dem.read(1, window=dem_window, boundless=True, fill_value=0).astype("float32")
    landcover_grid = lc_raw.reshape(ROWS, 3, COLS, 3)
    landcover_grid = np.apply_along_axis(lambda values: int(np.bincount(values.astype(int)).argmax()), 3, landcover_grid)
    landcover_grid = np.apply_along_axis(lambda values: int(np.bincount(values.astype(int)).argmax()), 1, landcover_grid)
    fuel_grid = np.array([[WORLDCOVER_TO_CELL2FIRE.get(int(value), (99, "unknown -> NB9 proxy"))[0] for value in row] for row in landcover_grid], dtype="int32")
    gy, gx = np.gradient(dem_raw, CELL_SIZE_M, CELL_SIZE_M)
    slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype("float32")
    aspect = ((np.degrees(np.arctan2(-gx, gy)) + 360) % 360).astype("float32")
    _write_asc(SCENARIO / "fuels.asc", fuel_grid)
    _write_asc(SCENARIO / "elevation.asc", dem_raw)
    _write_asc(SCENARIO / "slope.asc", slope)
    _write_asc(SCENARIO / "saz.asc", aspect)
    return {"worldcover_classes": sorted(int(value) for value in np.unique(landcover_grid)), "fuel_ids": sorted(int(value) for value in np.unique(fuel_grid)), "elevation_min_m": float(np.nanmin(dem_raw)), "elevation_max_m": float(np.nanmax(dem_raw))}


def _existing_grid_meta() -> dict[str, object]:
    def values(path: Path) -> list[float]:
        return [float(value) for line in path.read_text().splitlines()[6:] for value in line.split() if value != "-9999"]
    fuel_values = values(SCENARIO / "fuels.asc")
    elevation_values = values(SCENARIO / "elevation.asc")
    return {"worldcover_classes": [10], "fuel_ids": sorted(set(int(value) for value in fuel_values)), "elevation_min_m": min(elevation_values), "elevation_max_m": max(elevation_values)}


def _write_lookup() -> None:
    needed = set()
    for value, _ in WORLDCOVER_TO_CELL2FIRE.values():
        needed.add(value)
    with LOOKUP.open() as source, (SCENARIO / "spain_lookup_table.csv").open("w", newline="") as target:
        reader = csv.DictReader(source)
        writer = csv.DictWriter(target, fieldnames=reader.fieldnames)
        writer.writeheader()
        for row in reader:
            if int(row["grid_value"]) in needed:
                writer.writerow(row)


def _weather_rows() -> dict[str, float]:
    source = DATA / "weather/gfs00_2024_01.csv"
    with source.open() as handle:
        rows = list(csv.DictReader(handle))
    sample = rows[0]
    hours = [f"h{hour:02d}" for hour in range(6, 18)]
    weather = []
    for hour in hours:
        u = float(sample[f"u10_{hour}"]) / 100.0
        v = float(sample[f"v10_{hour}"]) / 100.0
        speed_kmh = max(0.1, math.hypot(u, v) * 3.6)
        direction = (math.degrees(math.atan2(-u, -v)) + 360) % 360
        weather.append((speed_kmh, direction))
    with (SCENARIO / "Weather.csv").open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["Instance", "datetime", "WS", "WD", "FireScenario"])
        # The available GFS slice has 12 daytime hourly columns. Repeat that
        # observed profile to create a 48-step visual demo timeline.
        for index in range(48):
            speed, direction = weather[index % len(weather)]
            writer.writerow(["similipal_demo", f"2024-01-01 {(index + 6) % 24:02d}:00", f"{speed:.3f}", f"{direction:.3f}", 1])
    with (SCENARIO / "Ignitions.csv").open("w", newline="") as handle:
        writer = csv.writer(handle); writer.writerow(["Year", "Ncell"]); writer.writerow([1, CENTER_ROW * COLS + CENTER_COL + 1])
    return {"wind_speed_kmh_hour06": weather[0][0], "wind_direction_hour06": weather[0][1], "source_rows": len(rows), "timeline_hours": 48, "extension": "repeated available GFS h06-h17 profile for development playback"}


def _copy_outputs() -> list[int]:
    def write_png(path: Path, grid: list[list[int]]) -> None:
        rows = [b"\x00" + b"".join(bytes((176, 24, 58, 210)) if value == 1 else bytes((0, 0, 0, 0)) for value in row) for row in grid]
        raw = b"".join(rows)
        def chunk(name: bytes, data: bytes) -> bytes:
            return struct.pack(">I", len(data)) + name + data + struct.pack(">I", zlib.crc32(name + data) & 0xffffffff)
        width, height = len(grid[0]), len(grid)
        png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
        path.write_bytes(png)

    frames = sorted((OUTPUT / "Grids/Grids1").glob("ForestGrid*.csv"), key=lambda path: int(path.stem.replace("ForestGrid", "")))
    burned = []
    for index, frame in enumerate(frames):
        grid = [[int(value) for value in line.split(",")] for line in frame.read_text().splitlines() if line]
        burned.append(sum(value == 1 for row in grid for value in row))
        write_png(PUBLIC / f"frame-{index:02d}.png", grid)
    return burned


def main() -> None:
    SCENARIO.mkdir(parents=True, exist_ok=True); OUTPUT.mkdir(parents=True, exist_ok=True); PUBLIC.mkdir(parents=True, exist_ok=True)
    if not BINARY.exists(): raise RuntimeError(f"Cell2Fire binary not found: {BINARY}")
    grid_meta = _build_grid(); _write_lookup(); weather_meta = _weather_rows()
    if (OUTPUT / "Grids").exists(): shutil.rmtree(OUTPUT / "Grids")
    if (OUTPUT / "Messages").exists(): shutil.rmtree(OUTPUT / "Messages")
    command = [str(BINARY), "--input-instance-folder", str(SCENARIO) + "/", "--output-folder", str(OUTPUT) + "/", "--sim", "S", "--ignitions", "--nsims", "1", "--grids", "--final-grid", "--Fire-Period-Length", "1.0", "--weather", "rows", "--nweathers", "1", "--output-messages", "--scenario", "1", "--seed", "42"]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=120)
    if completed.returncode:
        raise RuntimeError((completed.stdout + "\n" + completed.stderr)[-5000:])
    burned = _copy_outputs()
    (PUBLIC / "manifest.json").write_text(json.dumps({"scenario_id": "similipal-worldcover-gfs-demo", "location": {"latitude": ORIGIN_LATITUDE, "longitude": ORIGIN_LONGITUDE}, "grid": {"rows": ROWS, "columns": COLS, "cell_size_m": CELL_SIZE_M}, "frame_count": len(burned), "burned_cells": burned, "inputs": {"grid": grid_meta, "weather": weather_meta, "fuel_mapping": PROXY_STATUS}, "georeferenced": False, "production_eligible": False, "disclaimer": "Uncalibrated WorldCover/GFS/SRTM development demo; not an operational forecast."}, indent=2) + "\n")
    print(json.dumps({"frames": len(burned), "burned_cells": burned, "grid": grid_meta, "weather": weather_meta}))


if __name__ == "__main__":
    main()
