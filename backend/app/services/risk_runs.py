"""Store one daily forecast run (run info + ranked cells) in forecast_runs / cells / cell_scores.

Used by the importer script and by POST /api/risk/runs. Raw scores are never part of the input: only rank, percentile and band reach the database.
Re-importing a day replaces that run's scores (same forecast_date, mode and model_version).
"""
from __future__ import annotations

import json

import pandas as pd
from sqlalchemy import text

HALF = 0.05  # cells are 0.1 degree squares around the cell centre
RUN_COLUMNS = ("model_id VARCHAR(120)", "bundle_sha256 VARCHAR(64)", "coverage JSONB", "bands JSONB", "degraded JSONB")
NEEDED = ("cell_id", "state", "lat", "lon", "rank", "rank_percentile", "band")


def import_run_data(info: dict, rows: pd.DataFrame, engine) -> int:
    if info["status"] not in ("complete", "partial"):
        raise ValueError(f"run status {info['status']!r} is not importable")
    missing = [c for c in NEEDED if c not in rows.columns]
    if missing:
        raise ValueError(f"scores are missing columns {missing}")
    if "score" in rows.columns:
        raise ValueError("raw scores must not be sent")
    grid = f"cells-{info['coverage']['cells_in_grid']}"
    with engine.connect() as db:  # without PostGIS the geometry columns are plain text holding GeoJSON
        spatial = db.execute(text("SELECT udt_name FROM information_schema.columns WHERE table_name='cells' AND column_name='geom'")).scalar() == "geometry"
    with engine.begin() as db:
        for column in RUN_COLUMNS:  # the job may run before the new backend has started and added these itself
            db.execute(text(f"ALTER TABLE forecast_runs ADD COLUMN IF NOT EXISTS {column}"))
        run_id = db.execute(text("""INSERT INTO forecast_runs (forecast_date,mode,model_version,grid_version,status,data_cutoffs,model_id,bundle_sha256,coverage,bands,degraded)
            VALUES (:d,'live',:v,:g,:s,CAST(:cut AS jsonb),:m,:h,CAST(:cov AS jsonb),CAST(:b AS jsonb),CAST(:deg AS jsonb))
            ON CONFLICT (forecast_date,mode,model_version) DO UPDATE SET issued_at=now(),status=EXCLUDED.status,data_cutoffs=EXCLUDED.data_cutoffs,coverage=EXCLUDED.coverage,
              bands=EXCLUDED.bands,degraded=EXCLUDED.degraded,bundle_sha256=EXCLUDED.bundle_sha256,model_id=EXCLUDED.model_id RETURNING id"""),
            {"d": info["forecast_date"], "v": info["model_version"], "g": grid, "s": info["status"], "cut": json.dumps(info["data_cutoffs"]), "m": info["model_id"],
             "h": info["bundle_sha256"], "cov": json.dumps(info["coverage"]), "b": json.dumps(info["bands"]), "deg": json.dumps(info["degraded"])}).scalar_one()
        db.execute(text("DELETE FROM cell_scores WHERE run_id=:r"), {"r": run_id})
        cells, scores = [], []
        for r in rows.itertuples():
            w, e, so, n = r.lon - HALF, r.lon + HALF, r.lat - HALF, r.lat + HALF
            cells.append({"id": int(r.cell_id), "g": grid, "st": r.state, "ring": json.dumps({"type": "Polygon", "coordinates": [[[w, so], [e, so], [e, n], [w, n], [w, so]]]}),
                          "lon": float(r.lon), "lat": float(r.lat), "pt": json.dumps({"type": "Point", "coordinates": [float(r.lon), float(r.lat)]})})
            scores.append({"run": run_id, "c": int(r.cell_id), "rk": int(r.rank), "p": float(r.rank_percentile), "b": r.band})
        geom = "ST_SetSRID(ST_GeomFromGeoJSON(:ring),4326)" if spatial else ":ring"
        centroid = "ST_SetSRID(ST_MakePoint(:lon,:lat),4326)" if spatial else "CAST(:pt AS TEXT)"
        # one batched statement each (7,000+ rows): row-by-row would be too slow for a serverless request
        db.execute(text(f"INSERT INTO cells (id,grid_version,state,place_name,geom,centroid) VALUES (:id,:g,:st,NULL,{geom},{centroid}) ON CONFLICT (id) DO NOTHING"), cells)
        db.execute(text("INSERT INTO cell_scores (run_id,cell_id,rank,rank_percentile,band,drivers) VALUES (:run,:c,:rk,:p,:b,'[]')"), scores)
    return len(rows)
