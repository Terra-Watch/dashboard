"""Read-only adapter for a risk-model bundle.

Everything that describes the model (id, version, states, band cut-offs, files) comes from the
bundle's manifest.json; nothing about a particular model is written in this module. The adapter
exposes per-day ranks and bands only, never model scores.

Replay bundle layout:
  manifest.json      model_id, model_version, states[], bands[{name, top_share}], replay_files[],
                     optional score_column (default "score")
  <replay_files>     npz with arrays cell, day (days since 1970-01-01), state, <score_column>
  cell_centers.csv   cell, lon, lat, state (every cell in the grid; used for coverage), optional forest_land_frac (served as forest_frac)
"""
from __future__ import annotations

import json
from datetime import date
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from .risk_settings import bundle_dir

_EPOCH = date(1970, 1, 1)


class BundleError(ValueError):
    pass


def manifest() -> dict | None:
    root = bundle_dir()
    return dict(_manifest(root)) if root and (Path(root) / "manifest.json").exists() else None


@lru_cache(maxsize=2)
def _manifest(root: str) -> dict:
    data = json.loads((Path(root) / "manifest.json").read_text())
    missing = {"model_id", "model_version", "states", "bands", "replay_files"} - data.keys()
    if missing:
        raise BundleError(f"manifest.json is missing {sorted(missing)}")
    shares = [b["top_share"] for b in data["bands"]]
    if shares != sorted(shares) or shares[-1] != 1.0:
        raise BundleError("bands must be ordered by top_share and the last one must be 1.0")
    return data


@lru_cache(maxsize=2)
def _load(root: str) -> pd.DataFrame:
    meta = _manifest(root)
    column = meta.get("score_column", "score")
    frames = []
    for name in meta["replay_files"]:
        saved = np.load(Path(root) / name, allow_pickle=False)
        frames.append(pd.DataFrame({"cell": saved["cell"], "day": saved["day"], "state": saved["state"], "score": saved[column]}))
    rows = pd.concat(frames, ignore_index=True)
    return rows[rows["state"].isin(meta["states"])]


@lru_cache(maxsize=2)
def _centers(root: str) -> pd.DataFrame | None:
    path = Path(root) / "cell_centers.csv"
    return pd.read_csv(path) if path.exists() else None


def assign_bands(count: int, bands: list[dict]) -> list[str]:
    """Band name for ranks 0..count-1 (best first); the one place the cut-offs are applied."""
    names = []
    for rank in range(count):
        share = (rank + 1) / count
        names.append(next(b["name"] for b in bands if share <= b["top_share"]))
    return names


def _ranked(target: date) -> tuple[pd.DataFrame, dict, str] | None:
    root = bundle_dir()
    if not root or not (Path(root) / "manifest.json").exists():
        return None
    meta = _manifest(root)
    rows = _load(root)
    day = (target - _EPOCH).days
    ranked = rows[rows["day"] == day].sort_values("score", ascending=False, kind="stable").reset_index(drop=True)
    count = len(ranked)
    ranked["rank_percentile"] = 100.0 * (1.0 - ranked.index / max(count - 1, 1))
    ranked["band"] = assign_bands(count, meta["bands"])
    return ranked, meta, root


def _coverage(ranked: pd.DataFrame, meta: dict, root: str) -> dict:
    centers = _centers(root)
    in_grid = centers[centers["state"].isin(meta["states"])] if centers is not None else None
    total = int(len(in_grid)) if in_grid is not None else None
    scored_states = set(ranked["state"])
    return {
        "cells_scored": int(len(ranked)),
        "cells_in_grid": total,
        "complete": total is not None and len(ranked) >= total,
        "missing_states": sorted(set(meta["states"]) - scored_states),
    }


def _run(meta: dict, target: date, ranked: pd.DataFrame, root: str) -> dict:
    return {"model_id": meta["model_id"], "model_version": meta["model_version"], "date": target.isoformat(),
            "mode": "replay", "bands": meta["bands"], "coverage": _coverage(ranked, meta, root)}


def daily_risk(target: date) -> dict | None:
    loaded = _ranked(target)
    if loaded is None:
        return None
    ranked, meta, root = loaded
    return {
        **_run(meta, target, ranked, root),
        "forest_cell_count": len(ranked),
        "records": [
            {"cell_id": int(r.cell), "state": r.state, "rank_percentile": round(float(r.rank_percentile), 3), "band": r.band, "top_drivers": []}
            for r in ranked.itertuples()
        ],
    }


def daily_geojson(target: date) -> dict:
    empty = {"type": "FeatureCollection", "features": []}
    loaded = _ranked(target)
    if loaded is None:
        return empty
    ranked, meta, root = loaded
    centers = _centers(root)
    if centers is None or ranked.empty:
        return empty
    points = centers.merge(ranked[["cell", "rank_percentile", "band"]], on="cell", how="inner")
    has_forest = "forest_land_frac" in points.columns   # share of the cell that is forest land; lets the map filter to forest cells
    return {
        "type": "FeatureCollection",
        "run": _run(meta, target, ranked, root),
        "features": [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [float(r.lon), float(r.lat)]},
             "properties": {"cell_id": int(r.cell), "state": r.state, "rank_percentile": round(float(r.rank_percentile), 3), "band": r.band,
                            **({"forest_frac": round(float(r.forest_land_frac), 2)} if has_forest else {})}}
            for r in points.itertuples()
        ],
    }


def clear_caches() -> None:
    for fn in (_manifest, _load, _centers):
        fn.cache_clear()
