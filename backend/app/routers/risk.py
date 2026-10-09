from datetime import date
import json
from fastapi import APIRouter
from sqlalchemy import text
from ..barv3 import daily_geojson, daily_risk
from ..database.session import engine

router = APIRouter(prefix="/api/risk", tags=["risk"])

@router.get("/daily")
def daily_risk_endpoint(target: date) -> dict[str, object]:
    result = daily_risk(target)
    return result or {"model": "bar-v3", "date": target.isoformat(), "forest_cell_count": 0, "coverage": "unavailable", "coverage_complete": False, "records": []}

@router.get("/geojson")
def risk_geojson_endpoint(target: date) -> dict[str, object]:
    """Return ranked imported cell geometry without exposing model scores."""
    replay = daily_geojson(target)
    if replay["features"]:
        return replay
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
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "geometry": json.loads(row["geometry"]) if row["geometry"] else None,
         "properties": {"cell_id": row["id"], "state": row["state"], "place_name": row["place_name"], "rank": row["rank"], "rank_percentile": row["rank_percentile"], "band": row["band"]}}
        for row in rows if row["geometry"]
    ]}
