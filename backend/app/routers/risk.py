from datetime import date
import json
import hmac
from typing import Literal

from pydantic import BaseModel
from fastapi import APIRouter, Depends, Header, HTTPException
import pandas as pd
from sqlalchemy import text
from .. import risk_settings
from ..risk_model import daily_geojson, daily_risk
from ..core.permissions import user_scopes
from ..core.security import require_risk_roles
from ..database.session import engine
from ..services.risk_runs import import_run_data

router = APIRouter(prefix="/api/risk", tags=["risk"])

RISK_ROLES = ("range_officer", "control_room_operator", "incident_commander")

_HIGH_RISK_BANDS = {"Very high", "High"}


def _scope_filter_features(features: list[dict], user: dict) -> list[dict]:
    if user["role"] == "admin":
        return features
    scopes = user_scopes(user["id"])
    return [f for f in features if f.get("properties", {}).get("state") in scopes]


def _filter_risk_band(
    collection: dict[str, object], risk_band: Literal["high"] | None
) -> dict[str, object]:
    """Filter existing pre-classified risk bands without changing their thresholds."""
    if risk_band is None:
        return collection
    features = collection.get("features", [])
    return {
        **collection,
        "features": [
            feature
            for feature in features
            if feature.get("properties", {}).get("band") in _HIGH_RISK_BANDS
        ],
    }


@router.get("/daily")
def daily_risk_endpoint(target: date, user: dict = Depends(require_risk_roles(*RISK_ROLES))) -> dict[str, object]:
    result = daily_risk(target)
    result = result or {"model_id": None, "date": target.isoformat(), "forest_cell_count": 0, "coverage": {"cells_scored": 0, "cells_in_grid": None, "complete": False, "missing_states": []}, "records": []}
    if user["role"] != "admin":
        scopes = user_scopes(user["id"])
        result = {**result, "records": [r for r in result["records"] if r.get("state") in scopes]}
    return result


@router.get("/geojson")
def risk_geojson_endpoint(
    target: date,
    risk_band: Literal["high"] | None = None,
    user: dict = Depends(require_risk_roles(*RISK_ROLES)),
) -> dict[str, object]:
    """Return ranked imported cell geometry without exposing model scores.
    
    Gated by RISK_FORECAST_ENABLED environment variable. Returns 403 when disabled.
    Control Room operators only; scoped to user's assigned states.
    """
    if not risk_settings.forecast_enabled():
        raise HTTPException(
            status_code=403,
            detail="Risk forecast layer is not enabled. Set RISK_FORECAST_ENABLED=true to enable."
        )
    
    replay = daily_geojson(target)
    if replay["features"]:
        scoped = {**replay, "features": _scope_filter_features(replay["features"], user)}
        return _filter_risk_band(scoped, risk_band)
    with engine.connect() as db:
        run = db.execute(text("SELECT id,mode,model_id,model_version,status,issued_at,coverage,bands,degraded FROM forecast_runs WHERE forecast_date=:date AND status IN ('complete','partial') ORDER BY (mode='live') DESC, issued_at DESC LIMIT 1"), {"date": target}).mappings().first()
        if run is None:
            return {"type": "FeatureCollection", "features": []}
        rows = db.execute(text("""
            SELECT c.id, c.state, c.place_name, s.rank, s.rank_percentile, s.band,
                   {geometry} AS geometry
            FROM cell_scores s JOIN cells c ON c.id=s.cell_id
            WHERE s.run_id=:run_id ORDER BY s.rank
        """.format(geometry="ST_AsGeoJSON(c.geom)" if _spatial(db) else "c.geom")), {"run_id": run["id"]}).mappings().all()
    features = [
        {"type": "Feature", "geometry": json.loads(row["geometry"]) if row["geometry"] else None,
         "properties": {"cell_id": row["id"], "state": row["state"], "place_name": row["place_name"], "rank": row["rank"], "rank_percentile": row["rank_percentile"], "band": row["band"]}}
        for row in rows if row["geometry"]
    ]
    scoped = {"type": "FeatureCollection", "run": _run_summary(run, target), "features": _scope_filter_features(features, user)}
    return _filter_risk_band(scoped, risk_band)


def _spatial(db) -> bool:
    """True when the cells table has PostGIS geometry; otherwise geom holds GeoJSON text."""
    return db.execute(text("SELECT udt_name FROM information_schema.columns WHERE table_name='cells' AND column_name='geom'")).scalar() == "geometry"


def _run_summary(run, target: date) -> dict:
    return {"model_id": run["model_id"], "model_version": run["model_version"], "date": target.isoformat(), "mode": run["mode"], "status": run["status"],
            "issued_at": run["issued_at"].isoformat(), "bands": run["bands"], "coverage": run["coverage"], "degraded": run["degraded"] or []}


@router.get("/status")
def risk_status_endpoint(user: dict = Depends(require_risk_roles(*RISK_ROLES))) -> dict[str, object]:
    """Latest usable run per mode, with its age, so the UI can say what it is showing and whether it is stale."""
    stale_after = risk_settings.max_age_hours()
    with engine.connect() as db:
        rows = db.execute(text("""SELECT DISTINCT ON (mode) id,mode,model_id,model_version,status,issued_at,forecast_date,coverage,bands,degraded,
              floor(extract(epoch from (now()-issued_at))/3600)::int AS age_hours
            FROM forecast_runs WHERE status IN ('complete','partial') ORDER BY mode, forecast_date DESC, issued_at DESC""")).mappings().all()
    runs = {r["mode"]: {**_run_summary(r, r["forecast_date"]), "forecast_date": r["forecast_date"].isoformat(), "age_hours": r["age_hours"], "stale": r["age_hours"] > stale_after} for r in rows}
    return {"enabled": risk_settings.forecast_enabled(), "max_age_hours": stale_after, "runs": runs}


class RunIn(BaseModel):
    run: dict
    rows: list[dict]


@router.post("/runs")
def ingest_run_endpoint(payload: RunIn, x_ingest_token: str | None = Header(None)) -> dict[str, object]:
    """The daily job posts its run here, so the database password never leaves the host. Authenticated by a shared secret, not by a user."""
    expected = risk_settings.ingest_token()
    if not expected:
        raise HTTPException(status_code=404, detail="Not found")
    if not x_ingest_token or not hmac.compare_digest(x_ingest_token.encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Not allowed")
    try:
        count = import_run_data(payload.run, pd.DataFrame(payload.rows), engine)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None
    return {"imported": count}
