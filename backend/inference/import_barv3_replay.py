"""Import an archived Bar v3 validation day from an exported model bundle.

The bundle is created outside this application. This script never reads the
research repository and refuses dates outside the 2023–2024 replay window.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://resq:resq@localhost:55432/resq")


def day_number(value: date) -> int:
    return (value - date(1970, 1, 1)).days


def band(rank: int, count: int) -> str:
    share = (rank + 1) / count
    if share <= 0.01:
        return "Very high"
    if share <= 0.05:
        return "High"
    if share <= 0.15:
        return "Moderate"
    return "Low"


def import_day(bundle: Path, target: date) -> int:
    if target.year not in (2023, 2024):
        raise ValueError("Replay import accepts only 2023 and 2024 dates")
    archive = bundle / "results" / f"bar3_deployable_{target.year}_predictions.npz"
    table_path = bundle / "features" / "model_table.pkl"
    cells_path = bundle / "grid" / "cells.geojson"
    for path in (archive, table_path, cells_path):
        if not path.exists():
            raise FileNotFoundError(f"Model bundle is missing {path}")

    saved = np.load(archive, allow_pickle=False)
    table = pd.read_pickle(table_path)
    rows = table.iloc[saved["val_idx"]][["cell", "day", "state"]].copy()
    rows["score"] = saved["p_bagged"]
    rows = rows[rows.day == day_number(target)].sort_values("score", ascending=False, kind="stable").reset_index(drop=True)
    if rows.empty:
        raise ValueError(f"No archived Bar v3 rows exist for {target.isoformat()}")

    geometry = json.loads(cells_path.read_text())
    geometry_by_id = {int(feature["properties"]["cell_id"]): feature for feature in geometry.get("features", [])}
    if not all(int(cell) in geometry_by_id for cell in rows.cell):
        raise ValueError("Cell geometry does not cover every scored cell")

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    with engine.begin() as db:
        grid_version = "bundle-bar-v3"
        db.execute(text("INSERT INTO forecast_runs (forecast_date,mode,model_version,grid_version,status,data_cutoffs) VALUES (:date,'replay','bar-v3',:grid,'complete','{}') ON CONFLICT (forecast_date,mode,model_version) DO UPDATE SET issued_at=now() RETURNING id"), {"date": target, "grid": grid_version})
        run_id = db.execute(text("SELECT id FROM forecast_runs WHERE forecast_date=:date AND mode='replay' AND model_version='bar-v3'"), {"date": target}).scalar_one()
        for rank, row in rows.iterrows():
            cell_id = int(row.cell)
            feature = geometry_by_id[cell_id]
            db.execute(text("INSERT INTO cells (id,grid_version,state,place_name,geom,centroid) VALUES (:id,:grid,:state,:place,ST_SetSRID(ST_GeomFromGeoJSON(:geom),4326),ST_Centroid(ST_SetSRID(ST_GeomFromGeoJSON(:geom),4326))) ON CONFLICT (id) DO NOTHING"), {"id": cell_id, "grid": grid_version, "state": str(row.state), "place": feature.get("properties", {}).get("place_name"), "geom": json.dumps(feature["geometry"])})
            db.execute(text("INSERT INTO cell_scores (run_id,cell_id,rank,rank_percentile,band,drivers) VALUES (:run,:cell,:rank,:percentile,:band,'[]') ON CONFLICT (run_id,cell_id) DO UPDATE SET rank=EXCLUDED.rank,rank_percentile=EXCLUDED.rank_percentile,band=EXCLUDED.band"), {"run": run_id, "cell": cell_id, "rank": rank + 1, "percentile": 100.0 * (1.0 - rank / max(len(rows) - 1, 1)), "band": band(rank, len(rows))})
    return len(rows)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("date", help="Replay date in YYYY-MM-DD format")
    parser.add_argument("--bundle", default=os.getenv("RESQ_MODEL_BUNDLE_DIR"), required=not os.getenv("RESQ_MODEL_BUNDLE_DIR"))
    args = parser.parse_args()
    count = import_day(Path(args.bundle), date.fromisoformat(args.date))
    print(f"Imported {count} ranked forest cells")
