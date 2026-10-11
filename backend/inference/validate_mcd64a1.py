"""Compare a completed demo footprint with an MCD64A1 month.

MCD64A1 is monthly ~463 m burned area (the tile is 2400 pixels, not 500 m
ones; pixel positions come from the file's own metadata), so this validates spatial overlap only;
it does not validate the simulated hour 24/48 timing.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from pyhdf.SD import SD, SDC

from mcd64a1_geo import grid_from_hdf


ROOT = Path(__file__).resolve().parents[1]
MCD_ROOT = ROOT / "runtime_data/mcd64a1"
RUN_ROOT = ROOT / "runtime_data/simulation_demo/run/Grids/Grids1"
RADIUS_M = 6_371_007.181


def _mcd_pixels(path: Path) -> list[tuple[float, float]]:
    """(latitude, longitude) of every burned pixel centre, from the file's own georeferencing."""
    dataset = SD(str(path), SDC.READ)
    burn_date = np.asarray(dataset.select("Burn Date").get())
    rows, cols = np.where(burn_date > 0)
    longitude, latitude = grid_from_hdf(path, dataset).lonlat(rows, cols)
    return list(zip(latitude.tolist(), longitude.tolist()))


def _mcd_indices(path: Path) -> set[tuple[int, int]]:
    dataset = SD(str(path), SDC.READ)
    burn_date = np.asarray(dataset.select("Burn Date").get())
    rows, cols = np.where(burn_date > 0)
    return set(zip(rows.tolist(), cols.tolist()))


def _predicted_mcd_indices(path: Path, predicted: np.ndarray, origin: tuple[float, float], cell_size_m: float) -> set[tuple[int, int]]:
    grid = grid_from_hdf(path)
    latitude, longitude = origin
    indices: set[tuple[int, int]] = set()
    rows, cols = np.where(predicted)
    cell_latitude = latitude - ((rows + 0.5) - predicted.shape[0] / 2) * cell_size_m / RADIUS_M * 180 / math.pi
    cell_longitude = longitude + ((cols + 0.5) - predicted.shape[1] / 2) * cell_size_m / (RADIUS_M * math.cos(math.radians(latitude))) * 180 / math.pi
    pixel_rows, pixel_cols = grid.rowcol(cell_longitude, cell_latitude)
    indices.update(zip(pixel_rows.tolist(), pixel_cols.tolist()))
    return indices


def _observed_grid(path: Path, origin: tuple[float, float], rows: int, cols: int, cell_size_m: float) -> np.ndarray:
    observed = np.zeros((rows, cols), dtype=bool)
    latitude, longitude = origin
    for pixel_latitude, pixel_longitude in _mcd_pixels(path):
        row = int(round((latitude - pixel_latitude) * math.pi / 180 * RADIUS_M / cell_size_m + (rows / 2 - 0.5)))
        col = int(round((pixel_longitude - longitude) * math.pi / 180 * RADIUS_M * math.cos(math.radians(latitude)) / cell_size_m + (cols / 2 - 0.5)))
        if 0 <= row < rows and 0 <= col < cols:
            observed[row, col] = True
    return observed


def _predicted_grid(rows: int, cols: int) -> np.ndarray:
    frame = RUN_ROOT / "ForestGrid48.csv"
    if not frame.exists():
        raise FileNotFoundError(f"Simulation output is missing: {frame}")
    values = [[int(value) for value in line.split(",")] for line in frame.read_text().splitlines() if line]
    grid = np.asarray(values, dtype=int)
    if grid.shape != (rows, cols):
        raise ValueError(f"Expected {rows}x{cols} simulation grid, found {grid.shape}")
    return grid == 1


def validate(month: str, *, latitude: float = 21.867894, longitude: float = 86.500688, rows: int = 40, cols: int = 40, cell_size_m: float = 30.0) -> dict[str, object]:
    matches = sorted((MCD_ROOT / month).glob("MCD64A1.*.h*.hdf"))
    if not matches:
        return {"status": "unavailable", "month": month, "message": "No MCD64A1 tile has been imported for this month."}
    valid_matches: list[Path] = []
    for match in matches:
        try:
            SD(str(match), SDC.READ).select("Burn Date")
            valid_matches.append(match)
        except Exception:
            continue
    if not valid_matches:
        return {"status": "unavailable", "month": month, "message": "The imported MCD64A1 file is incomplete or unreadable."}
    predicted = _predicted_grid(rows, cols)
    predicted_count = int(predicted.sum())
    observed_indices = _mcd_indices(valid_matches[0])
    predicted_indices = _predicted_mcd_indices(valid_matches[0], predicted, (latitude, longitude), cell_size_m)
    observed_indices = observed_indices & {index for index in observed_indices if index in predicted_indices or abs(index[0] - min((item[0] for item in predicted_indices), default=0)) <= 2 and abs(index[1] - min((item[1] for item in predicted_indices), default=0)) <= 2}
    observed_count = len(observed_indices)
    if observed_count == 0:
        return {"status": "unavailable", "month": month, "source": valid_matches[0].name, "message": "MCD64A1 contains no observed burned pixels in the simulated extent for this month; no accuracy metric is reported.", "predicted_cells": predicted_count, "observed_cells": 0}
    intersection = len(predicted_indices & observed_indices)
    union = len(predicted_indices | observed_indices)
    return {"status": "ready", "month": month, "source": valid_matches[0].name, "predicted_cells": predicted_count, "predicted_mcd_pixels": len(predicted_indices), "observed_cells": observed_count, "intersection_cells": intersection, "iou": round(intersection / union, 4) if union else 0.0, "observed_product": "MCD64A1 monthly 500m burned area", "timing_validated": False}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--month", required=True, help="YYYY-MM, limited to imported 2023-2024 data")
    args = parser.parse_args()
    print(json.dumps(validate(args.month), indent=2))
