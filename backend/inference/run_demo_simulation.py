"""Build and run the RESQ Similipal development simulation.

Inputs are public/demo data only. This never writes to wildfire-research or
wild-fire-simulation; it reads the Cell2Fire binary and lookup table there.

This is the single exporter for frontend/public/simulation/similipal-demo/
(frames and manifest.json). The earlier benchmark exporter that wrote a
different manifest into the same folder has been removed.

Usage: run_demo_simulation.py [--latitude LAT] [--longitude LON] [--duration-hours N]
The ignition cell is derived from the coordinate and must lie inside the
1.2 km x 1.2 km domain (see simulation_domain.py); the number of hourly
weather rows, and so of frames, is the duration.

Fixed inputs that are NOT yet event-specific (see docs/sim_followups.md):
the wind is the first row of the January 2024 GFS file (one 12-hour daytime
profile repeated), not the weather of the ignition pixel or date.

Data.csv, written by the Cell2Fire binary, carries latitude 51.621244 and
longitude -115.608378 (Banff, hard-coded in DataGenerator.cpp). Simulator
"S" never reads them (they only feed the Canadian FBP model), so they have
no effect here; the real location is carried by this script's constants.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import shutil
import struct
import subprocess
import time
import zlib
from pathlib import Path

from proxy_mapping import PROXY_STATUS, WORLDCOVER_TO_CELL2FIRE
from simulation_domain import (
    CELL_SIZE_M, COLS, MAX_DURATION_HOURS, ORIGIN_LATITUDE, ORIGIN_LONGITUDE, ROWS,
    RequestOutsideDomain, domain_bounds, ignition_ncell, locate_ignition, validate_duration,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "runtime_data/simulation_demo"
SCENARIO = DATA / "scenario"
OUTPUT = DATA / "run"
PUBLIC = ROOT.parent / "frontend/public/simulation/similipal-demo"
SOURCE_SIM = Path("/Users/kireeti/Desktop/Projects/wild-fire-simulation")
BINARY = SOURCE_SIM / "external/Cell2Fire/Cell2Fire/Cell2Fire"
LOOKUP = SOURCE_SIM / "cell2fire/tests/fixtures/synthetic_40x40/spain_lookup_table.csv"


def _write_asc(path: Path, values, *, xll: float = domain_bounds()["west"], yll: float = domain_bounds()["south"]) -> None:
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
        # The domain is fixed, so the staged fuels/elevation files do not depend on the request.
        if all((SCENARIO / name).exists() for name in ("fuels.asc", "elevation.asc", "slope.asc", "saz.asc")):
            return _existing_grid_meta()
        raise RuntimeError("rasterio is required to build the raster inputs and no staged scenario files exist; run `pip install -r backend/requirements.txt`.") from exc
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


def _weather_rows(duration_hours: int, ignition_row: int, ignition_col: int) -> dict[str, float]:
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
        for index in range(duration_hours):
            speed, direction = weather[index % len(weather)]
            writer.writerow(["similipal_demo", f"2024-01-01 {(index + 6) % 24:02d}:00", f"{speed:.3f}", f"{direction:.3f}", 1])
    with (SCENARIO / "Ignitions.csv").open("w", newline="") as handle:
        writer = csv.writer(handle); writer.writerow(["Year", "Ncell"]); writer.writerow([1, ignition_ncell(ignition_row, ignition_col)])
    return {"wind_speed_kmh_hour06": weather[0][0], "wind_direction_hour06": weather[0][1], "source_rows": len(rows), "timeline_hours": duration_hours, "profile": "fixed", "source_date": "2024-01-01", "source_row": 0, "extension": "repeated available GFS h06-h17 profile for development playback; not the weather of the ignition pixel or date"}


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
    for stale in PUBLIC.glob("frame-*.png"):
        stale.unlink()
    for index, frame in enumerate(frames):
        grid = [[int(value) for value in line.split(",")] for line in frame.read_text().splitlines() if line]
        burned.append(sum(value == 1 for row in grid for value in row))
        write_png(PUBLIC / f"frame-{index:02d}.png", grid)
    return burned


def _configure_work_dir(work_dir: Path) -> None:
    """Redirect all generated scenario/run/public files into a fresh workspace."""
    global SCENARIO, OUTPUT, PUBLIC
    resolved = work_dir.expanduser().resolve()
    repository = ROOT.parents[1].resolve()
    if resolved == repository or repository in resolved.parents or resolved in repository.parents:
        raise ValueError("--work-dir must be outside the repository")
    for protected in (DATA.resolve(), SCENARIO.resolve(), OUTPUT.resolve(), PUBLIC.resolve()):
        if resolved == protected or resolved in protected.parents or protected in resolved.parents:
            raise ValueError("--work-dir must not overlap input data or the default public artifact directory")
    if resolved.exists():
        if not resolved.is_dir() or next(resolved.iterdir(), None) is not None:
            raise ValueError("--work-dir must be a new or empty directory")
    else:
        resolved.mkdir(parents=True, exist_ok=False)
    SCENARIO = resolved / "scenario"
    OUTPUT = resolved / "run"
    PUBLIC = resolved / "public"


def main(argv: list[str] | None = None) -> None:
    global DATA, BINARY, LOOKUP
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--latitude", type=float, default=ORIGIN_LATITUDE)
    parser.add_argument("--longitude", type=float, default=ORIGIN_LONGITUDE)
    parser.add_argument("--duration-hours", type=int, default=MAX_DURATION_HOURS)
    parser.add_argument("--data-dir", type=Path, default=DATA, help="input data root; defaults to the checked-in demo inputs")
    parser.add_argument("--work-dir", type=Path, help="fresh isolated root for scenario, simulator output, and generated public frames")
    parser.add_argument("--binary", type=Path, default=BINARY, help="Cell2Fire executable")
    parser.add_argument("--lookup", type=Path, default=LOOKUP, help="Cell2Fire fuel lookup CSV")
    parser.add_argument("--timeout-seconds", type=float, default=120.0)
    args = parser.parse_args(argv)
    try:
        duration_hours = validate_duration(args.duration_hours)
        ignition_row, ignition_col = locate_ignition(args.latitude, args.longitude)
    except RequestOutsideDomain as exc:
        raise SystemExit(f"Invalid simulation request: {exc}")
    DATA = args.data_dir.expanduser().resolve()
    BINARY = args.binary.expanduser().resolve()
    LOOKUP = args.lookup.expanduser().resolve()
    if not math.isfinite(args.timeout_seconds) or args.timeout_seconds <= 0 or args.timeout_seconds > 600:
        raise SystemExit("--timeout-seconds must be greater than 0 and at most 600")
    if args.work_dir is not None:
        _configure_work_dir(args.work_dir)
    required_inputs = (
        DATA / "landcover/worldcover_similipal_demo.tif",
        DATA / "terrain/elevation_similipal_demo.tif",
        DATA / "weather/gfs00_2024_01.csv",
        LOOKUP,
    )
    missing = [str(path) for path in required_inputs if not path.is_file()]
    if missing:
        raise SystemExit("Required simulation inputs are missing: " + ", ".join(missing))
    if not BINARY.is_file() or not os.access(BINARY, os.X_OK):
        raise SystemExit(f"Cell2Fire binary is missing or not executable: {BINARY}")
    SCENARIO.mkdir(parents=True, exist_ok=True); OUTPUT.mkdir(parents=True, exist_ok=True); PUBLIC.mkdir(parents=True, exist_ok=True)
    grid_meta = _build_grid(); _write_lookup(); weather_meta = _weather_rows(duration_hours, ignition_row, ignition_col)
    if (OUTPUT / "Grids").exists(): shutil.rmtree(OUTPUT / "Grids")
    if (OUTPUT / "Messages").exists(): shutil.rmtree(OUTPUT / "Messages")
    command = [str(BINARY), "--input-instance-folder", str(SCENARIO) + "/", "--output-folder", str(OUTPUT) + "/", "--sim", "S", "--ignitions", "--nsims", "1", "--grids", "--final-grid", "--Fire-Period-Length", "1.0", "--weather", "rows", "--nweathers", "1", "--output-messages", "--scenario", "1", "--seed", "42"]
    simulator_started = time.monotonic()
    try:
        completed = subprocess.run(command, capture_output=True, text=True, timeout=args.timeout_seconds)
    except subprocess.TimeoutExpired as exc:
        def decode_capture(value):
            if isinstance(value, bytes):
                return value.decode("utf-8", errors="replace")
            return value or ""
        print(json.dumps({"cell2fire_execution": {
            "command": command,
            "exit_code": None,
            "duration_seconds": round(time.monotonic() - simulator_started, 3),
            "timed_out": True,
            "stdout": decode_capture(exc.stdout),
            "stderr": decode_capture(exc.stderr),
        }}), flush=True)
        raise
    simulator_duration = round(time.monotonic() - simulator_started, 3)
    print(json.dumps({"cell2fire_execution": {
        "command": command,
        "exit_code": completed.returncode,
        "duration_seconds": simulator_duration,
        "timed_out": False,
        "stdout": completed.stdout,
        "stderr": completed.stderr,
    }}), flush=True)
    if completed.returncode:
        raise RuntimeError((completed.stdout + "\n" + completed.stderr)[-5000:])
    burned = _copy_outputs()
    manifest = {
        "scenario_id": "similipal-worldcover-gfs-demo",
        "location": {"latitude": ORIGIN_LATITUDE, "longitude": ORIGIN_LONGITUDE},
        "domain": {"center": {"latitude": ORIGIN_LATITUDE, "longitude": ORIGIN_LONGITUDE}, "bounds": domain_bounds(), "rows": ROWS, "columns": COLS, "cell_size_m": CELL_SIZE_M},
        "ignition": {"latitude": args.latitude, "longitude": args.longitude, "row": ignition_row, "column": ignition_col, "ncell": ignition_ncell(ignition_row, ignition_col)},
        "duration_hours": duration_hours,
        "grid": {
            "rows": ROWS,
            "columns": COLS,
            "cell_size_m": CELL_SIZE_M,
            "row_order": "north_to_south",
            "column_order": "west_to_east",
        },
        "frame_count": len(burned),
        "burned_cells": burned,
        "inputs": {"grid": grid_meta, "weather": weather_meta, "fuel_mapping": PROXY_STATUS},
        "georeferenced": True,
        "production_eligible": False,
        "disclaimer": "Synthetic, uncalibrated WorldCover/GFS/SRTM example at a point in Similipal with a fixed wind profile; not an observed event and not an operational forecast.",
    }
    (PUBLIC / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"frames": len(burned), "burned_cells": burned, "grid": grid_meta, "weather": weather_meta}))


if __name__ == "__main__":
    main()
