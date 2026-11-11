"""Parity check of live/detection_quality.py against the dataset's own features (c07) and scores (c09) for one month of detections, with everything earlier as history.
Needs terrawatch-datasets (dataset/detections_forest.parquet, audit/false_detections/*). Run: fire-spread/.venv/bin/python website/forecast/tests/check_detection_quality.py [YYYY-MM]"""
import os, sys, time
import numpy as np, pandas as pd, joblib
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
sys.path.insert(0, os.path.join(ROOT, "website/forecast/live")); import detection_quality as Q
V4 = f"{ROOT}/terrawatch-datasets"; A = f"{V4}/audit/false_detections"
month = sys.argv[1] if len(sys.argv) > 1 else "2025-03"
d = pd.read_parquet(f"{V4}/dataset/detections_forest.parquet"); d["rid"] = np.arange(len(d))
d = d.merge(pd.read_parquet(f"{A}/detection_attributes.parquet"), on="rid", how="left").merge(pd.read_parquet(f"{A}/industrial_flags.parquet"), on="rid", how="left")
for k in ("0.5", "1", "2"): d[f"ind_{k}km"] = d[f"near_industrial_{k}km"]
d["date"] = pd.to_datetime(d.date_utc).dt.tz_localize(None); d = d[d.rid.isin(pd.read_parquet(f"{A}/detection_attributes.parquet").rid)]
new = d[d.date.dt.strftime("%Y-%m") == month].reset_index(drop=True); hist = d[d.date < new.date.min()]
t0 = time.time(); F = Q.features(new, hist); print(f"{len(new)} new detections, {len(hist)} history rows, {time.time()-t0:.1f} s")
ref = pd.read_parquet(f"{A}/detection_features.parquet").set_index("rid").loc[new.rid.values].reset_index(drop=True)
bad = {}
for c in Q.FEATURES:
    a, b = F[c].values.astype(float), ref[c].values.astype(float); ok = np.isclose(a, b, rtol=1e-6, atol=1e-6, equal_nan=True)
    if not ok.all(): bad[c] = (int((~ok).sum()), float(np.nanmax(np.abs(a - b))))
print("columns that differ:", bad or "none")
model = joblib.load(f"{A}/classifier_v2.joblib"); m = model["model"] if isinstance(model, dict) else model
p = Q.score(m, F); sc = pd.read_parquet(f"{A}/detection_scores_all.parquet").sort_values("rid").set_index("rid").p_scar
q = sc.reindex(new.rid.values).values; ok = np.isfinite(q)
print("score: max abs difference", float(np.nanmax(np.abs(p[ok] - q[ok]))), "| rows compared", int(ok.sum()))
