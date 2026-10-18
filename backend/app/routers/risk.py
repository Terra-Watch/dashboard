from datetime import date
import json
import os
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from ..barv3 import daily_geojson, daily_risk
from ..core.permissions import user_scopes
from ..core.security import require_risk_roles
from ..database.session import engine

router = APIRouter(prefix="/api/risk", tags=["risk"])

RISK_ROLES = ("range_officer", "control_room_operator", "incident_commander")

def _risk_forecast_enabled() -> bool:
    """Check if risk forecast is enabled via environment variable."""
    return os.getenv("RISK_FORECAST_ENABLED", "").strip().lower() in ("true", "1", "yes")
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
    result = result or {"model": "bar-v3", "date": target.isoformat(), "forest_cell_count": 0, "coverage": "unavailable", "coverage_complete": False, "records": []}
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
    if not _risk_forecast_enabled():
        raise HTTPException(
            status_code=403,
            detail="Risk forecast layer is not enabled. Set RISK_FORECAST_ENABLED=true to enable."
        )
    
    replay = daily_geojson(target)
    if replay["features"]:
        scoped = {**replay, "features": _scope_filter_features(replay["features"], user)}
        return _filter_risk_band(scoped, risk_band)
    with engine.connect() as db:
        run_id = db.execute(text("SELECT id FROM forecast_runs WHERE forecast_date=:date AND mode='replay' ORDER BY issued_at DESC LIMIT 1"), {"date": target}).scalar()
        if run_id is None:
            return {"type": "FeatureCollection", "features": []}
        rows = db.execute(text("""
            SELECT c.id, c.state, c.place_name, s.rank, s.rank_percentile, s.band,
                   ST_AsGeoJSON(c.geom) AS geometry
            FROM cell_scores s JOIN cells c ON c.id=s.cell_id
            WHERE s.run_id=:run_id ORDER BY s.rank
        """), {"run_id": run_id}).mappings().all()
    features = [
        {"type": "Feature", "geometry": json.loads(row["geometry"]) if row["geometry"] else None,
         "properties": {"cell_id": row["id"], "state": row["state"], "place_name": row["place_name"], "rank": row["rank"], "rank_percentile": row["rank_percentile"], "band": row["band"]}}
        for row in rows if row["geometry"]
    ]
    scoped = {"type": "FeatureCollection", "features": _scope_filter_features(features, user)}
    return _filter_risk_band(scoped, risk_band)
