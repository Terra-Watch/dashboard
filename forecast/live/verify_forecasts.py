"""Score every finished run against what the satellite saw on its forecast date (the silent-period check, run daily).
Label = a forest fire-day in the cell on the forecast date (fire store, `forest` flag). A run is scored once its date is fully in the store (two days after the date, as FIRMS rows can still arrive).
Usage: python verify_forecasts.py --runs DIR_OF_RUNS --fire F.parquet --out verification.csv
"""
import argparse, glob, json, os
import numpy as np, pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score

ap = argparse.ArgumentParser(); ap.add_argument("--runs", required=True); ap.add_argument("--fire", required=True); ap.add_argument("--out", required=True); a = ap.parse_args()
fire = pd.read_parquet(a.fire); newest = fire.date.max()
done = pd.read_csv(a.out) if os.path.exists(a.out) else pd.DataFrame(columns=["forecast_date"])
rows = []
for d in sorted(glob.glob(f"{a.runs}/*/run.json")):
    info = json.load(open(d)); fd = pd.Timestamp(info["forecast_date"])
    if info["forecast_date"] in set(done.forecast_date.astype(str)) or fd > newest - pd.Timedelta(days=2): continue
    s = pd.read_parquet(os.path.join(os.path.dirname(d), "scores.parquet")); hit = set(fire[(fire.date == fd) & fire.forest].cell_id)
    y = s.cell_id.isin(hit).values.astype(int); p = s.score.values; n = int(y.sum())
    rec = lambda q: float(y[np.argsort(-p)[:max(1, int(q * len(p)))]].sum() / n) if n else np.nan
    rows.append({"forecast_date": info["forecast_date"], "model_version": info["model_version"], "cells": len(s), "fire_cells": n, "base_rate": n / len(s),
                 "auprc": average_precision_score(y, p) if n else np.nan, "auroc": roc_auc_score(y, p) if 0 < n < len(y) else np.nan,
                 "recall_top1pct": rec(.01), "recall_top5pct": rec(.05), "recall_top10pct": rec(.10), "degraded": ";".join(info.get("degraded", []))})
if rows:
    pd.concat([done, pd.DataFrame(rows)], ignore_index=True).to_csv(a.out, index=False)
print(f"verified {len(rows)} new run(s)" + (": " + ", ".join(r["forecast_date"] for r in rows) if rows else ""))
