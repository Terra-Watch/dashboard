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
