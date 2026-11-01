"""Import an archived forecast day from a risk-model bundle (see app/risk_model.py for the layout).

Needs grid/cells.geojson in the bundle for cell geometry. Model id, version, states and band cut-offs
come from the bundle's manifest; the date range is whatever the bundle's replay files contain.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import date
from pathlib import Path

from sqlalchemy import create_engine, text

from app import risk_model

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://resq:resq@localhost:55432/resq")


def import_day(bundle: Path, target: date) -> int:
    os.environ["RISK_MODEL_BUNDLE"] = str(bundle)
    risk_model.clear_caches()
    loaded = risk_model._ranked(target)
    if loaded is None:
        raise FileNotFoundError(f"{bundle} has no manifest.json")
    rows, meta, _ = loaded
    if rows.empty:
        raise ValueError(f"The bundle has no rows for {target.isoformat()}")
    cells_path = bundle / "grid" / "cells.geojson"
    if not cells_path.exists():
        raise FileNotFoundError(f"Model bundle is missing {cells_path}")
    geometry_by_id = {int(f["properties"]["cell_id"]): f for f in json.loads(cells_path.read_text()).get("features", [])}
    if not all(int(cell) in geometry_by_id for cell in rows.cell):
        raise ValueError("Cell geometry does not cover every scored cell")

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    grid_version = f"bundle-{meta['model_id']}"
    with engine.begin() as db:
        db.execute(text("INSERT INTO forecast_runs (forecast_date,mode,model_version,grid_version,status,data_cutoffs) VALUES (:date,'replay',:version,:grid,'complete','{}') ON CONFLICT (forecast_date,mode,model_version) DO UPDATE SET issued_at=now()"), {"date": target, "version": meta["model_version"], "grid": grid_version})
        run_id = db.execute(text("SELECT id FROM forecast_runs WHERE forecast_date=:date AND mode='replay' AND model_version=:version"), {"date": target, "version": meta["model_version"]}).scalar_one()
        for row in rows.itertuples():
            feature = geometry_by_id[int(row.cell)]
            db.execute(text("INSERT INTO cells (id,grid_version,state,place_name,geom,centroid) VALUES (:id,:grid,:state,:place,ST_SetSRID(ST_GeomFromGeoJSON(:geom),4326),ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(:geom),4326))) ON CONFLICT (id) DO NOTHING"), {"id": int(row.cell), "grid": grid_version, "state": str(row.state), "place": feature.get("properties", {}).get("place_name"), "geom": json.dumps(feature["geometry"])})
            db.execute(text("INSERT INTO cell_scores (run_id,cell_id,rank,rank_percentile,band,drivers) VALUES (:run,:cell,:rank,:percentile,:band,'[]') ON CONFLICT (run_id,cell_id) DO UPDATE SET rank=EXCLUDED.rank,rank_percentile=EXCLUDED.rank_percentile,band=EXCLUDED.band"), {"run": run_id, "cell": int(row.cell), "rank": row.Index + 1, "percentile": float(row.rank_percentile), "band": row.band})
    return len(rows)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("date", help="Replay date in YYYY-MM-DD format")
    parser.add_argument("--bundle", default=os.getenv("RISK_MODEL_BUNDLE"), required=not os.getenv("RISK_MODEL_BUNDLE"))
    args = parser.parse_args()
    count = import_day(Path(args.bundle), date.fromisoformat(args.date))
    print(f"Imported {count} ranked forest cells")
