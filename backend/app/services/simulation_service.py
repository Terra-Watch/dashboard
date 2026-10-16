"""Backend service for the explicitly uncalibrated development simulation."""
import json
import subprocess
import sys
from pathlib import Path

from inference.simulation_domain import MAX_DURATION_HOURS, ORIGIN_LATITUDE, ORIGIN_LONGITUDE, RequestOutsideDomain, locate_ignition, validate_duration


PROJECT_ROOT = Path(__file__).resolve().parents[3]
RUNNER = PROJECT_ROOT / "backend/inference/run_demo_simulation.py"
MANIFEST = PROJECT_ROOT / "frontend/public/simulation/similipal-demo/manifest.json"
VALIDATOR = PROJECT_ROOT / "backend/inference/validate_mcd64a1.py"


class SimulationUnavailable(RuntimeError):
    pass


def validate_spread_request(latitude: float, longitude: float, duration_hours: int) -> tuple[int, int]:
    """Return the (row, column) ignition cell, or raise RequestOutsideDomain."""
    validate_duration(duration_hours)
    return locate_ignition(latitude, longitude)


def run_simulation(latitude: float = ORIGIN_LATITUDE, longitude: float = ORIGIN_LONGITUDE, duration_hours: int = MAX_DURATION_HOURS) -> dict[str, object]:
    validate_spread_request(latitude, longitude, duration_hours)
    if not RUNNER.exists():
        raise SimulationUnavailable("The development simulation runner is not installed.")
    try:
        completed = subprocess.run([sys.executable, str(RUNNER), "--latitude", repr(float(latitude)), "--longitude", repr(float(longitude)), "--duration-hours", str(int(duration_hours))], cwd=RUNNER.parent, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired as exc:
        raise SimulationUnavailable("The development simulation timed out.") from exc
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout)[-1000:]
        raise SimulationUnavailable(f"The development simulation failed: {detail}")
    if not MANIFEST.exists():
        raise SimulationUnavailable("The simulation finished without producing a manifest.")
    return json.loads(MANIFEST.read_text())


def validate_simulation(month: str) -> dict[str, object]:
    if not VALIDATOR.exists():
        return {'status': 'unavailable', 'message': 'MCD64A1 validation is not installed.'}
    completed = subprocess.run([sys.executable, str(VALIDATOR), '--month', month], cwd=VALIDATOR.parent, capture_output=True, text=True, timeout=60)
    if completed.returncode != 0:
        return {'status': 'unavailable', 'message': (completed.stderr or completed.stdout)[-1000:]}
    return json.loads(completed.stdout)


def get_simulation_domain_info() -> dict[str, object]:
    """Expose domain boundaries, grid resolution, and defaults for scenario configuration."""
    from inference.simulation_domain import (
        CELL_SIZE_M, COLS, MAX_DURATION_HOURS, MIN_DURATION_HOURS,
        ORIGIN_LATITUDE, ORIGIN_LONGITUDE, ROWS, domain_bounds,
    )
    bounds = domain_bounds()
    return {
        "domain_id": "similipal-demo",
        "label": "Similipal Tiger Reserve, Odisha (Demonstration Domain)",
        "bounds": bounds,
        "center": {"latitude": ORIGIN_LATITUDE, "longitude": ORIGIN_LONGITUDE},
        "grid": {"rows": ROWS, "columns": COLS, "cell_size_m": CELL_SIZE_M},
        "limits": {"min_duration_hours": MIN_DURATION_HOURS, "max_duration_hours": MAX_DURATION_HOURS},
        "defaults": {"latitude": ORIGIN_LATITUDE, "longitude": ORIGIN_LONGITUDE, "duration_hours": 12},
        "assumptions": {
            "fuel_model": "ESA WorldCover 2021 reclassified to Rothermel fuel types (TL2 / GR1).",
            "weather": "January 2024 daytime GFS 12h meteorological profile.",
            "terrain": "Copernicus GLO-30 digital elevation model slope and aspect.",
            "disclaimer": "Development simulation using Rothermel fire-spread equations; uncalibrated for operational forecasting.",
        },
    }


def execute_isolated_simulation(latitude: float, longitude: float, duration_hours: int) -> dict[str, object]:
    """Execute Cell2Fire in a temporary workspace, returning GeoJSON frames and execution metadata without touching saved artifacts."""
    import tempfile
    import time
    from inference.simulation_domain import (
        COLS, ROWS, domain_bounds, ignition_ncell, locate_ignition, validate_duration,
    )

    validate_duration(duration_hours)
    row, col = locate_ignition(latitude, longitude)
    ncell = ignition_ncell(row, col)
    bounds = domain_bounds()
    dlat = (bounds["north"] - bounds["south"]) / ROWS
    dlon = (bounds["east"] - bounds["west"]) / COLS

    if not RUNNER.exists():
        raise SimulationUnavailable("The development simulation runner is not installed.")

    with tempfile.TemporaryDirectory(prefix="resq-sim-run-") as tmp:
        t0 = time.perf_counter()
        try:
            completed = subprocess.run(
                [
                    sys.executable,
                    str(RUNNER),
                    "--latitude", repr(float(latitude)),
                    "--longitude", repr(float(longitude)),
                    "--duration-hours", str(int(duration_hours)),
                    "--work-dir", tmp,
                ],
                cwd=RUNNER.parent,
                capture_output=True,
                text=True,
                timeout=90,
            )
        except subprocess.TimeoutExpired as exc:
            raise SimulationUnavailable("The development simulation timed out.") from exc

        execution_duration = round(time.perf_counter() - t0, 3)

        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout)[-1000:]
            raise SimulationUnavailable(f"The development simulation failed: {detail}")

        manifest_path = Path(tmp) / "public/manifest.json"
        if not manifest_path.exists():
            raise SimulationUnavailable("The simulation finished without producing a manifest.")

        manifest = json.loads(manifest_path.read_text())

        frames = []
        for k in range(duration_hours + 1):
            grid_file = Path(tmp) / f"run/Grids/Grids1/ForestGrid{k}.csv"
            features = []
            if grid_file.exists():
                lines = grid_file.read_text().splitlines()
                for r, line in enumerate(lines):
                    for c, val in enumerate(line.split(",")):
                        if val == "1":
                            w = bounds["west"] + c * dlon
                            e = bounds["west"] + (c + 1) * dlon
                            n = bounds["north"] - r * dlat
                            s = bounds["north"] - (r + 1) * dlat
                            features.append({
                                "type": "Feature",
                                "geometry": {
                                    "type": "Polygon",
                                    "coordinates": [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
                                },
                                "properties": {"hour": k, "row": r, "column": c, "status": "burned"},
                            })
            frames.append({
                "hour": k,
                "burned_cells_count": len(features),
                "geojson": {"type": "FeatureCollection", "features": features},
            })

        return {
            "scenario_id": f"similipal-run-{int(time.time())}",
            "location": {"latitude": latitude, "longitude": longitude},
            "ignition": {
                "latitude": latitude,
                "longitude": longitude,
                "row": row,
                "column": col,
                "ncell": ncell,
            },
            "domain": bounds,
            "duration_hours": duration_hours,
            "burned_cells": [f["burned_cells_count"] for f in frames],
            "frames": frames,
            "weather": manifest.get("inputs", {}).get("weather", {}),
            "execution": {
                "duration_seconds": execution_duration,
                "exit_code": completed.returncode,
                "engine": "Cell2Fire (Rothermel S-model)",
            },
            "assumptions": {
                "fuel_model": "ESA WorldCover 2021 (TL2/GR1 mapping)",
                "weather": "January 2024 GFS daytime hourly wind cycle",
                "terrain": "Copernicus GLO-30 DEM",
                "uncalibrated": True,
                "scientific_limitation": "Explicitly uncalibrated physical fire-spread simulation for testing and scenario exploration. Not an operational forecast.",
            },
            "sample_data": True,
            "uncalibrated": True,
        }
