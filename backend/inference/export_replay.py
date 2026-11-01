"""Export a replay bundle (manifest.json, replay_<year>.npz, cell_centers.csv) from per-day prediction tables.

Input: a parquet with columns cell_id, label_date, state, p (one row per cell-day; average seeds first),
a cell table with cell_id, lat, lon, state, and a model description. Writes the layout read by app/risk_model.py.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

DEFAULT_BANDS = [{"name": "Very high", "top_share": 0.01}, {"name": "High", "top_share": 0.05}, {"name": "Moderate", "top_share": 0.15}, {"name": "Low", "top_share": 1.0}]


def export(predictions: Path, cells: Path, output: Path, model_id: str, model_version: str, bands: list[dict]) -> None:
    pred = pd.read_parquet(predictions)
    grid = pd.read_parquet(cells)[["cell_id", "lat", "lon", "state"]].rename(columns={"cell_id": "cell"})
    pred["day"] = (pd.to_datetime(pred["label_date"]) - pd.Timestamp("1970-01-01")).dt.days
    output.mkdir(parents=True, exist_ok=True)
    files = []
    for year, part in pred.groupby(pd.to_datetime(pred["label_date"]).dt.year):
        name = f"replay_{year}.npz"
        np.savez_compressed(output / name, cell=part.cell_id.to_numpy("int64"), day=part.day.to_numpy("int32"), state=part.state.astype(str).to_numpy("U3"), score=part.p.to_numpy("float32"))
        files.append(name)
    grid.to_csv(output / "cell_centers.csv", index=False)
    manifest = {"model_id": model_id, "model_version": model_version, "mode": "replay", "states": sorted(pred.state.astype(str).unique()), "bands": bands, "replay_files": sorted(files)}
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--predictions", required=True, type=Path)
    ap.add_argument("--cells", required=True, type=Path)
    ap.add_argument("--output", required=True, type=Path)
    ap.add_argument("--model-id", required=True)
    ap.add_argument("--model-version", required=True)
    a = ap.parse_args()
    export(a.predictions, a.cells, a.output, a.model_id, a.model_version, DEFAULT_BANDS)
