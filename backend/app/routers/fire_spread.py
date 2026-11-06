"""Fire spread: where the next cells of an active fire are most likely to burn, ranked in bands. Serves, read-only, the files written by fire-spread/scripts/34_score_active.py
(runtime_data/fire_spread/<run>/events.json, <event>_<H>h.geojson, <event>_pixels.geojson, and skill.json with the measured validation numbers).
It is a ranking of cells within 8 km of the fire, not a calibrated probability and not wind-driven; every response carries that note."""
import json
import os
import re
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from ..core.permissions import in_communities, ranger_communities, user_scopes
from ..core.security import require_risk_roles
from ..services.ingest import tag_state

router = APIRouter(prefix="/api/fire-spread", tags=["fire-spread"])

ROLES = ("range_officer", "control_room_operator", "incident_commander")
HORIZONS = (24, 48)
_SAFE = re.compile(r"^[A-Za-z0-9T_-]{1,60}$")


def _root() -> Path:
    return Path(os.environ.get("FIRE_SPREAD_DIR") or Path(__file__).resolve().parents[2] / "runtime_data" / "fire_spread")


def _json(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        raise HTTPException(status_code=404, detail="Not available") from None


def _latest_run() -> Path:
    runs = [p for p in _root().glob("*") if (p / "events.json").is_file()] if _root().is_dir() else []
    if not runs:
        raise HTTPException(status_code=404, detail="No fire spread run is available yet")
    return max(runs, key=lambda p: str(_json(p / "events.json").get("at", "")))       # by the moment the run describes, not by its folder name


def _visible(fires: list[dict], user: dict) -> list[dict]:
    """The fires this person may see: all for an admin, inside the community for a ranger, inside their states otherwise (same rule as the risk map)."""
    if user["role"] == "admin":
        return fires
    circles = ranger_communities(user)
    if circles:
        return [f for f in fires if in_communities(circles, f["lat"], f["lon"])]
    scopes = user_scopes(user["id"])
    return [f for f in fires if tag_state(f["lat"], f["lon"]) in scopes]


def _run_dir(run: str) -> Path:
    if not _SAFE.match(run) or not (_root() / run / "events.json").is_file():
        raise HTTPException(status_code=404, detail="Not available")
    return _root() / run


def _event_files(run: str, event: str, user: dict) -> Path:
    d = _run_dir(run)
    if not _SAFE.match(event) or event not in {f["event"] for f in _visible(_json(d / "events.json")["fires"], user)}:
        raise HTTPException(status_code=404, detail="Not available")
    return d


@router.get("/runs/latest")
def latest(user: dict = Depends(require_risk_roles(*ROLES))):
    d = _latest_run()
    body = _json(d / "events.json")
    body["fires"] = _visible(body["fires"], user)
    skill = d / "skill.json" if (d / "skill.json").is_file() else d.parent / "skill.json"       # a run carries the skill of the model that scored it
    body["skill"] = _json(skill) if skill.is_file() else None
    return body


@router.get("/{run}/{event}/pixels")
def pixels(run: str, event: str, user: dict = Depends(require_risk_roles(*ROLES))):
    return _json(_event_files(run, event, user) / f"{event}_pixels.geojson")


@router.get("/{run}/{event}/burned/{horizon}")
def burned(run: str, event: str, horizon: int, user: dict = Depends(require_risk_roles(*ROLES))):
    """What MODIS later showed burned, for archived (replay) fires only; the file is absent for a live fire."""
    if horizon not in HORIZONS:
        raise HTTPException(status_code=404, detail="Horizon must be 24 or 48 hours")
    return _json(_event_files(run, event, user) / f"{event}_burned_{horizon}h.geojson")


@router.get("/{run}/{event}/layer/{name}/{horizon}")
def layer(run: str, event: str, name: str, horizon: int, user: dict = Depends(require_risk_roles(*ROLES))):
    """What the bands run over: named places and public buildings (name = places) or roads and tracks (name = roads), from OpenStreetMap."""
    if horizon not in HORIZONS or name not in ("places", "roads"):
        raise HTTPException(status_code=404, detail="Not available")
    return _json(_event_files(run, event, user) / f"{event}_{name}_{horizon}h.geojson")


@router.get("/{run}/{event}/{horizon}")
def bands(run: str, event: str, horizon: int, user: dict = Depends(require_risk_roles(*ROLES))):
    if horizon not in HORIZONS:
        raise HTTPException(status_code=404, detail="Horizon must be 24 or 48 hours")
    return _json(_event_files(run, event, user) / f"{event}_{horizon}h.geojson")
