"""Area forecast: the chance that a fire is detected in each forest area (about 55 km) tomorrow, with a level, what is usual for the week, and the places to look at.
Serves, read-only, the files written by the forecast job (forecast/live/area_forecast.py): <date>.json per forecast date and index.json, read from
FIRE_FORECAST_DIR (env), else runtime_data/area_forecast, else the replay days shipped with the code (app/area_forecast_data), which is what a read-only deployment sees.
Only chances and levels are served, never model scores. A person sees the areas inside their community (rangers) or their states (everyone else); an admin sees all."""
import hmac
import json
import os
import re
from pathlib import Path

from fastapi import APIRouter, Body, Depends, Header, HTTPException

from .. import risk_settings

from ..core.permissions import in_communities, ranger_communities, user_scopes
from ..core.security import require_risk_roles

router = APIRouter(prefix="/api/area-forecast", tags=["area-forecast"])

ROLES = ("range_officer", "control_room_operator", "incident_commander")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _root() -> Path:
    if os.environ.get("FIRE_FORECAST_DIR"):
        return Path(os.environ["FIRE_FORECAST_DIR"])
    local = Path(__file__).resolve().parents[2] / "runtime_data" / "area_forecast"
    return local if local.is_dir() and any(local.glob("2*.json")) else Path(__file__).resolve().parents[1] / "area_forecast_data"


def _archive_root() -> Path:
    """The archived days of 2025, replayed from the stored model predictions and shipped with the code. Used for demos and for checking the forecast against what was detected."""
    return Path(__file__).resolve().parents[1] / "area_forecast_data"


def _dates(root: Path | None = None) -> list[str]:
    root = root or _root()
    return sorted(p.stem for p in root.glob("*.json") if _DATE.match(p.stem)) if root.is_dir() else []


def _load(date: str, root: Path | None = None) -> dict:
    root = root or _root()
    if not _DATE.match(date) or date not in _dates(root):
        raise HTTPException(status_code=404, detail="No forecast for that date")
    try:
        return json.loads((root / f"{date}.json").read_text())
    except (OSError, ValueError):
        raise HTTPException(status_code=404, detail="No forecast for that date") from None


def _scoped(body: dict, user: dict, archive: bool = False) -> dict:
    """Keep the areas the person may see. Counts in the summary are recomputed for what is kept. An archived day also carries what was actually detected that day
    (per area `fire_detected`, and the outcome counts, recomputed for the areas kept); a live forecast never does."""
    if user["role"] == "admin":
        scope, areas = "all", body["areas"]
    else:
        circles = ranger_communities(user)
        if circles:
            scope, areas = "community", [a for a in body["areas"] if in_communities(circles, a["lat"], a["lon"])]
        else:
            states = user_scopes(user["id"]); scope, areas = "state", [a for a in body["areas"] if a["state"] in states]
    levels = [lv["id"] for lv in body["levels"]]
    out = {**body, "areas": areas, "scope": scope, "summary": {k: sum(1 for a in areas if a["level"] == k) for k in levels}, "areas_scored": len(areas)}
    out.pop("outcome", None)
    if archive and body.get("mode") == "replay":
        flagged = [a for a in areas if a["level"] in ("high", "extreme")]; hit = [a for a in areas if a.get("fire_detected")]
        out["outcome"] = {"areas_with_fire": len(hit), "in_high_or_extreme": sum(1 for a in hit if a["level"] in ("high", "extreme")),
                          "areas_rated_high_or_extreme": len(flagged), "of_those_with_fire": sum(1 for a in flagged if a.get("fire_detected"))}
    else:
        for a in areas: a.pop("fire_detected", None)
    _burning(body, areas)
    return out


def attach_burning(areas: list[dict], rows) -> None:
    """rows: (block id, group, count) of satellite detections in the last 24 hours. Adds burning_now = {likely, known_source, unconfirmed} to the areas that have any; outside-forest ones are not counted."""
    by: dict[int, dict] = {}
    for b, grp, n in rows:
        if grp in ("likely", "known_source", "unconfirmed"):
            by.setdefault(int(b), {})[grp] = by.get(int(b), {}).get(grp, 0) + int(n)
    for a in areas:
        if a["id"] in by:
            a["burning_now"] = by[a["id"]]


def _burning(body: dict, areas: list[dict]) -> None:
    """Live forecasts only (a replay day is archived). Never fails the forecast: with no database or no quality table the areas simply carry no count."""
    if body.get("mode") != "live" or not areas:
        return
    try:
        from sqlalchemy import text
        from ..database.session import engine
        with engine.connect() as db:
            rows = db.execute(text("""SELECT floor(h.latitude/0.5)::int*1000 + floor(h.longitude/0.5)::int AS b, COALESCE(q.grp,'unconfirmed') AS g, count(*) FROM resq_hotspots h
                LEFT JOIN resq_hotspot_quality q ON q.satellite=h.satellite AND q.acq_datetime=h.acq_datetime AND q.latitude=h.latitude AND q.longitude=h.longitude
                WHERE h.acq_datetime >= now() - interval '24 hours' GROUP BY 1,2""")).all()
        attach_burning(areas, rows)
    except Exception:
        return


def _writable_root() -> Path:
    """Where a posted forecast is stored: FIRE_FORECAST_DIR, else runtime_data/area_forecast. Never the folder shipped with the code."""
    root = Path(os.environ["FIRE_FORECAST_DIR"]) if os.environ.get("FIRE_FORECAST_DIR") else Path(__file__).resolve().parents[2] / "runtime_data" / "area_forecast"
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError:
        raise HTTPException(status_code=503, detail="This deployment cannot store forecasts") from None
    return root


@router.post("/runs")
def ingest(body: dict = Body(...), x_ingest_token: str | None = Header(None)):
    """The daily job posts its area forecast here (same shared secret as the risk run). One file per forecast date, replaced when the job reruns."""
    expected = risk_settings.ingest_token()
    if not expected:
        raise HTTPException(status_code=404, detail="Not found")
    if not x_ingest_token or not hmac.compare_digest(x_ingest_token.encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Not allowed")
    date = str(body.get("date", ""))
    if not _DATE.match(date) or not isinstance(body.get("areas"), list) or not body["areas"] or not isinstance(body.get("levels"), list):
        raise HTTPException(status_code=422, detail="Not an area forecast")
    if any(not isinstance(a, dict) or not {"id", "state", "lat", "lon", "level", "chance"} <= a.keys() for a in body["areas"]):
        raise HTTPException(status_code=422, detail="Not an area forecast")
    if any("score" in a for a in body["areas"]):
        raise HTTPException(status_code=422, detail="Model scores must not be sent")
    root = _writable_root(); tmp = root / f"{date}.json.tmp"
    tmp.write_text(json.dumps(body, separators=(",", ":"))); tmp.replace(root / f"{date}.json")
    return {"stored": date, "areas": len(body["areas"])}


@router.get("/dates")
def dates(user: dict = Depends(require_risk_roles(*ROLES))):
    """The forecast dates that are available, newest last, and whether they are a replay of archived days."""
    ds = _dates()
    if not ds:
        raise HTTPException(status_code=404, detail="No forecast is available yet")
    return {"dates": ds, "latest": ds[-1], "mode": _load(ds[-1]).get("mode")}


@router.get("/archive/dates")
def archive_dates(user: dict = Depends(require_risk_roles(*ROLES))):
    """The archived days available for a demo, newest last."""
    ds = _dates(_archive_root())
    if not ds:
        raise HTTPException(status_code=404, detail="No archived forecast is available")
    return {"dates": ds, "latest": ds[-1], "mode": "replay"}


@router.get("/archive/{date}")
def archive_by_date(date: str, user: dict = Depends(require_risk_roles(*ROLES))):
    return _scoped(_load(date, _archive_root()), user, archive=True)


@router.get("/latest")
def latest(user: dict = Depends(require_risk_roles(*ROLES))):
    ds = _dates()
    if not ds:
        raise HTTPException(status_code=404, detail="No forecast is available yet")
    return _scoped(_load(ds[-1]), user)


@router.get("/{date}")
def by_date(date: str, user: dict = Depends(require_risk_roles(*ROLES))):
    return _scoped(_load(date), user)
