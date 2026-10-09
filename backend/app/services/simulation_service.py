"""Backend service for the explicitly uncalibrated development simulation."""
import json
import subprocess
import sys
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[3]
RUNNER = PROJECT_ROOT / "backend/inference/run_demo_simulation.py"
MANIFEST = PROJECT_ROOT / "frontend/public/simulation/similipal-demo/manifest.json"
VALIDATOR = PROJECT_ROOT / "backend/inference/validate_mcd64a1.py"


class SimulationUnavailable(RuntimeError):
    pass


def run_simulation() -> dict[str, object]:
    if not RUNNER.exists():
        raise SimulationUnavailable("The development simulation runner is not installed.")
    try:
        completed = subprocess.run([sys.executable, str(RUNNER)], cwd=RUNNER.parent, capture_output=True, text=True, timeout=120)
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
