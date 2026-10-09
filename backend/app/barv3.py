"""Read-only adapter for archived Bar v3 validation predictions.

The research artifacts remain outside this repository.  This adapter exposes
only per-day ranks and bands; it never returns model scores.
"""
from __future__ import annotations

import os
from datetime import date
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

STATES = {"OD", "CG", "TS", "MP", "MH", "JH"}

def _bundle_dir() -> str | None:
    configured = os.getenv("RESQ_MODEL_BUNDLE_DIR")
    if configured:
        return configured
    local_bundle = Path(__file__).resolve().parents[1] / "models" / "barv3"
    return str(local_bundle) if local_bundle.exists() else None


def _paths(year: int) -> tuple[Path, Path] | None:
    bundle = _bundle_dir()
    if not bundle:
        local_bundle = Path(__file__).resolve().parents[1] / "models" / "barv3"
        if (local_bundle / f"bar3_replay_{year}.npz").exists():
            bundle = str(local_bundle)
    if bundle:
        root = Path(bundle)
        replay = root / f"bar3_replay_{year}.npz"
        if replay.exists():
            return replay, root / "cell_centers.csv"
        return root / "results" / f"bar3_deployable_{year}_predictions.npz", root / "features" / "model_table.pkl"
    root = os.getenv("RESQ_BAR_V3_RESULTS_DIR")
    table = os.getenv("RESQ_BAR_V3_TABLE_PATH")
    if not root or not table:
        return None
    return Path(root) / f"bar3_deployable_{year}_predictions.npz", Path(table)


@lru_cache(maxsize=2)
def _load(year: int) -> tuple[pd.DataFrame, np.ndarray] | None:
    paths = _paths(year)
    if not paths or not all(path.exists() for path in paths):
        return None
    archive, table_path = paths
    if year not in (2023, 2024):
        return None
    saved = np.load(archive, allow_pickle=False)
    if "val_idx" in saved.files:
        table = pd.read_pickle(table_path)
        rows = table.iloc[saved["val_idx"]][["cell", "day", "state"]].copy()
        rows["score"] = saved["p_bagged"]
    else:
        rows = pd.DataFrame({key: saved[key] for key in ("cell", "day", "state", "p_bagged")})
        rows = rows.rename(columns={"p_bagged": "score"})
    rows = rows[rows["state"].isin(STATES)]
    return rows, saved["p_bagged"]


def daily_risk(target: date) -> dict[str, object] | None:
    loaded = _load(target.year)
    if loaded is None:
        return None
    rows, _ = loaded
    day_number = (target - date(1970, 1, 1)).days
    rows = rows[rows["day"] == day_number].copy()
    if rows.empty:
        return {"model": "bar-v3", "date": target.isoformat(), "forest_cell_count": 0, "records": []}

    rows = rows.sort_values("score", ascending=False, kind="stable").reset_index(drop=True)
    count = len(rows)
    rows["rank_percentile"] = 100.0 * (1.0 - rows.index / max(count - 1, 1))

    def band(rank: int) -> str:
        share = (rank + 1) / count
        if share <= 0.01:
            return "Very high"
        if share <= 0.05:
            return "High"
        if share <= 0.15:
            return "Moderate"
        return "Low"

    return {
        "model": "bar-v3",
        "date": target.isoformat(),
        "forest_cell_count": count,
        "coverage": "archived validation subset; not the complete forest grid",
        "coverage_complete": False,
        "records": [
            {
                "cell_id": int(row.cell),
                "state": row.state,
                "rank_percentile": round(float(row.rank_percentile), 3),
                "band": band(index),
                "top_drivers": [],
            }
            for index, row in rows.iterrows()
        ],
    }


@lru_cache(maxsize=2)
def _centers(bundle: str) -> pd.DataFrame | None:
    path = Path(bundle) / "cell_centers.csv"
    return pd.read_csv(path) if path.exists() else None


def daily_geojson(target: date) -> dict[str, object]:
    bundle = _bundle_dir()
    if not bundle:
        return {"type": "FeatureCollection", "features": []}
    loaded = _load(target.year)
    centers = _centers(bundle)
    if loaded is None or centers is None:
        return {"type": "FeatureCollection", "features": []}
    rows, _ = loaded
    day_number = (target - date(1970, 1, 1)).days
    ranked = rows[rows["day"] == day_number].copy().sort_values("score", ascending=False, kind="stable").reset_index(drop=True)
    count = len(ranked)
    if not count:
        return {"type": "FeatureCollection", "features": []}
    ranked["rank_percentile"] = 100.0 * (1.0 - ranked.index / max(count - 1, 1))
    ranked["band"] = ["Very high" if (i + 1) / count <= .01 else "High" if (i + 1) / count <= .05 else "Moderate" if (i + 1) / count <= .15 else "Low" for i in range(count)]
    points = centers.merge(ranked[["cell", "rank_percentile", "band"]], on="cell", how="inner")
    return {"type": "FeatureCollection", "features": [{"type": "Feature", "geometry": {"type": "Point", "coordinates": [float(row.lon), float(row.lat)]}, "properties": {"cell_id": int(row.cell), "state": row.state, "rank_percentile": round(float(row.rank_percentile), 3), "band": row.band}} for row in points.itertuples()]}
