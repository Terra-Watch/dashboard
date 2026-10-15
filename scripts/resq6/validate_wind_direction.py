"""Controlled Cell2Fire cardinal-wind convention validation (synthetic only).

Runs each cardinal downwind direction twice with identical flat terrain,
uniform TL2 fuel, centered ignition, weather speed, simulator settings, and
seed. Outputs are new, immutable experiment artifacts; this never loads
incident or held-out data.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np
import pandas as pd

WEBSITE = Path(__file__).resolve().parents[2]
BIN = Path("/Users/kireeti/Desktop/Projects/wild-fire-simulation/external/Cell2Fire/Cell2Fire/Cell2Fire")
LOOKUP = Path("/Users/kireeti/Desktop/Projects/wild-fire-simulation/external/Cell2Fire/test/model/sb-asc/spain_lookup_table.csv")
CELL_M = 30
N = 301
IGNITION = (N // 2, N // 2)
HOURS = 24
WIND_SPEED_MS = 8.0
REPEATS = 2
CASES = {
    # Expected movement: row decreases north, column increases east.
    "north": {"wind_from_deg": 180, "expected_to_bearing_deg": 0, "axis": "north_south", "expected_sign": 1},
    "east": {"wind_from_deg": 270, "expected_to_bearing_deg": 90, "axis": "east_west", "expected_sign": 1},
    "south": {"wind_from_deg": 0, "expected_to_bearing_deg": 180, "axis": "north_south", "expected_sign": -1},
    "west": {"wind_from_deg": 90, "expected_to_bearing_deg": 270, "axis": "east_west", "expected_sign": -1},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_asc(path: Path, value: int) -> None:
    row = " ".join([str(value)] * N)
    with path.open("w") as stream:
        stream.write(f"ncols {N}\nnrows {N}\nxllcorner 0\nyllcorner 0\ncellsize {CELL_M}\nNODATA_value -9999\n")
        stream.write((row + "\n") * N)


def make_weather(path: Path, wind_from_deg: int) -> None:
    with path.open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["Instance", "datetime", "WS", "WD", "FireScenario"])
        for hour in range(HOURS):
            writer.writerow(["cardinal", f"2024-01-01 {hour:02d}:00", f"{WIND_SPEED_MS * 3.6:.3f}", wind_from_deg, 1])


def inspect_grid(grid: np.ndarray) -> dict:
    rows, cols = np.where(grid)
    if not len(rows):
        raise RuntimeError("simulator produced an empty burn grid")
    dr = rows.astype(float) - IGNITION[0]
    dc = cols.astype(float) - IGNITION[1]
    return {
        "burned_cells": int(len(rows)),
        "centroid_row_offset_cells": float(dr.mean()),
        "centroid_col_offset_cells": float(dc.mean()),
        "centroid_north_m": float(-dr.mean() * CELL_M),
        "centroid_east_m": float(dc.mean() * CELL_M),
        "extent_north_m": int((IGNITION[0] - rows.min()) * CELL_M),
        "extent_south_m": int((rows.max() - IGNITION[0]) * CELL_M),
        "extent_east_m": int((cols.max() - IGNITION[1]) * CELL_M),
        "extent_west_m": int((IGNITION[1] - cols.min()) * CELL_M),
        "touches_grid_edge": bool(grid[0].any() or grid[-1].any() or grid[:, 0].any() or grid[:, -1].any()),
    }


def run_case(output: Path, direction: str, repeat: int) -> dict:
    case = CASES[direction]
    with tempfile.TemporaryDirectory(prefix=f"resq6-wind-{direction}-{repeat}-") as temp_name:
        temp = Path(temp_name)
        scenario, run = temp / "scenario", temp / "run"
        scenario.mkdir()
        run.mkdir()
        for filename, value in (("fuels.asc", 182), ("elevation.asc", 500), ("slope.asc", 0)):
            write_asc(scenario / filename, value)
        (scenario / "spain_lookup_table.csv").write_bytes(LOOKUP.read_bytes())
        make_weather(scenario / "Weather.csv", case["wind_from_deg"])
        ignition_cell = IGNITION[0] * N + IGNITION[1] + 1
        with (scenario / "Ignitions.csv").open("w", newline="") as stream:
            writer = csv.writer(stream)
            writer.writerow(["Year", "Ncell"])
            writer.writerow([1, ignition_cell])
        command = [
            str(BIN), "--input-instance-folder", str(scenario) + "/", "--output-folder", str(run) + "/",
            "--sim", "S", "--ignitions", "--nsims", "1", "--grids", "--final-grid",
            "--Fire-Period-Length", "1.0", "--weather", "rows", "--nweathers", "1",
            "--output-messages", "--scenario", "1", "--seed", "42",
        ]
        started = time.monotonic()
        proc = subprocess.run(command, capture_output=True, text=True, timeout=900)
        elapsed = time.monotonic() - started
        if proc.returncode:
            raise RuntimeError(f"{direction} repeat {repeat}: Cell2Fire failed ({proc.returncode})\n{proc.stdout[-2000:]}\n{proc.stderr[-2000:]}")
        grid_path = run / "Grids/Grids1" / f"ForestGrid{HOURS}.csv"
        if not grid_path.is_file():
            raise RuntimeError(f"{direction} repeat {repeat}: required {HOURS}h grid missing")
        grid = pd.read_csv(grid_path, header=None).to_numpy() == 1
        if grid.shape != (N, N) or not grid[IGNITION]:
            raise RuntimeError(f"unexpected grid shape/ignition for {direction}: {grid.shape}")
        case_dir = output / direction
        case_dir.mkdir(exist_ok=True)
        grid_out = case_dir / f"repeat_{repeat}_h{HOURS}.npz"
        np.savez_compressed(grid_out, burned=grid)
        # Persist the exact CSV passed through the parser and the simulator's captured output.
        weather_out = case_dir / f"repeat_{repeat}_Weather.csv"
        weather_out.write_bytes((scenario / "Weather.csv").read_bytes())
        stdout_out = case_dir / f"repeat_{repeat}_stdout.txt"
        stdout_out.write_text(proc.stdout + ("\n--- STDERR ---\n" + proc.stderr if proc.stderr else ""))
        return {
            "direction": direction,
            "repeat": repeat,
            "input_wind_from_deg": case["wind_from_deg"],
            "expected_cell2fire_waz_to_deg_after_reader_plus_180": (case["wind_from_deg"] + 180) % 360,
            "expected_downwind": direction,
            "simulator_return_code": proc.returncode,
            "wall_seconds": round(elapsed, 3),
            "grid_shape": list(grid.shape),
            "grid_metrics": inspect_grid(grid),
            "burn_grid_npz": str(grid_out.relative_to(output)),
            "burn_grid_sha256": sha256(grid_out),
            "burn_grid_content_sha256": hashlib.sha256(np.ascontiguousarray(grid).tobytes()).hexdigest(),
            "weather_csv": str(weather_out.relative_to(output)),
            "weather_csv_sha256": sha256(weather_out),
            "stdout_log": str(stdout_out.relative_to(output)),
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    output = args.output_dir if args.output_dir.is_absolute() else WEBSITE / args.output_dir
    output = output.resolve()
    if output.exists():
        parser.error(f"refusing to overwrite existing experiment directory: {output}")
    if not BIN.is_file() or not LOOKUP.is_file():
        parser.error("Cell2Fire binary or stock lookup table is unavailable")
    output.mkdir(parents=True)
    results = []
    for direction in CASES:
        for repeat in range(1, REPEATS + 1):
            print(f"Running {direction}, repeat {repeat}/{REPEATS}", flush=True)
            results.append(run_case(output, direction, repeat))

    # Strict, predeclared directional acceptance: centroid must move into the
    # expected half-plane and opposite winds must have opposite signed offsets.
    for direction, spec in CASES.items():
        for item in (r for r in results if r["direction"] == direction):
            m = item["grid_metrics"]
            signed = m["centroid_north_m"] if spec["axis"] == "north_south" else m["centroid_east_m"]
            item["signed_downwind_centroid_m"] = signed * spec["expected_sign"]
            if item["signed_downwind_centroid_m"] <= 0:
                raise RuntimeError(f"{direction} repeat {item['repeat']} centroid failed to move downwind: {m}")
            if m["touches_grid_edge"]:
                raise RuntimeError(f"{direction} repeat {item['repeat']} reached a grid edge; enlarge domain and rerun")
    for one, opposite, field in (("north", "south", "centroid_north_m"), ("east", "west", "centroid_east_m")):
        a = np.mean([r["grid_metrics"][field] for r in results if r["direction"] == one])
        b = np.mean([r["grid_metrics"][field] for r in results if r["direction"] == opposite])
        if a * b >= 0:
            raise RuntimeError(f"opposite wind tendency check failed for {one}/{opposite}: {a}, {b}")
    manifest = {
        "purpose": "synthetic end-to-end Cell2Fire cardinal wind direction validation",
        "held_out_or_incident_data_used": False,
        "configuration": {
            "grid": {"rows": N, "columns": N, "cell_size_m": CELL_M, "asc_row_0": "north"},
            "ignition_row_col_zero_based": list(IGNITION),
            "fuel_code": 182,
            "elevation_m": 500,
            "slope_degrees": 0,
            "hours": HOURS,
            "wind_speed_ms": WIND_SPEED_MS,
            "weather_ws_kmh": round(WIND_SPEED_MS * 3.6, 3),
            "simulator_seed": 42,
            "repeats_per_direction": REPEATS,
            "simulator_flags": ["--sim S", "--Fire-Period-Length 1.0", "--weather rows", "--nweathers 1", "--scenario 1", "--seed 42"],
        },
        "binary": str(BIN),
        "binary_sha256": sha256(BIN),
        "lookup_sha256": sha256(LOOKUP),
        "harness_sha256": sha256(Path(__file__).resolve()),
        "results": results,
        "directional_checks": {
            "all_centroids_in_expected_half_plane": True,
            "north_south_opposites": True,
            "east_west_opposites": True,
            "repeat_grid_hashes_match_per_direction": {},
        },
    }
    for direction in CASES:
        hashes = [r["burn_grid_content_sha256"] for r in results if r["direction"] == direction]
        manifest["directional_checks"]["repeat_grid_hashes_match_per_direction"][direction] = len(set(hashes)) == 1
        if len(set(hashes)) != 1:
            raise RuntimeError(f"{direction} repeat burn grids differ; deterministic reproducibility check failed")
    path = output / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(path)
    print(json.dumps(manifest["directional_checks"], indent=2))


if __name__ == "__main__":
    main()
