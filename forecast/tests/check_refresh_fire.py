"""Replay check of refresh_fire.process: the detections of a few days are treated as new FIRMS rows (without their stored p_scar), everything before is the history, and the live path must reproduce
the dataset's scores and keep/drop decisions. Needs a detection store built by wildfire-ignition-forecasting/scripts/live/init_detection_store.py and terrawatch-datasets.
Run: fire-spread/.venv/bin/python website/forecast/tests/check_refresh_fire.py STORE_DIR [START END]"""
import json, os, sys, time
import numpy as np, pandas as pd, joblib
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
sys.path.insert(0, os.path.join(ROOT, "website/forecast/live")); import fire, detection_quality as Q, refresh_fire as R
A = f"{ROOT}/terrawatch-datasets/audit/false_detections"; state = sys.argv[1]; s0, s1 = (sys.argv[2], sys.argv[3]) if len(sys.argv) > 3 else ("2025-03-15", "2025-03-17")
det = pd.read_parquet(f"{state}/detections.parquet"); m = (det.date >= s0) & (det.date <= s1); hist = det[det.date < s0]
raw = det[m][fire.FIRMS_COLS + ["p_scar"]].copy().reset_index(drop=True); truth = raw.pop("p_scar").values
cells = pd.read_parquet(f"{ROOT}/wildfire-ignition-forecasting/live_state/bundle/cells.parquet").cell_id.values; mask = np.load(f"{ROOT}/wildfire-ignition-forecasting/live_state/forest_mask.npz")["mask"]
model = joblib.load(f"{A}/classifier_v2.joblib")["model"]; hide = json.load(open(f"{A}/classifier_report_v2.json"))["thresholds_from_2019_2023"]["hide_keeps_98pct_of_confirmed"]
tree = Q.industrial_tree(f"{A}/industrial_sources.geojsonseq"); t0 = time.time()
new = R.process(raw, hist, set(cells), mask, tree, model, hide); print(f"{len(raw)} rows in, {len(new)} scored, {time.time()-t0:.1f} s")
a = new.merge(det[m][["latitude", "longitude", "date", "acq_time", "p_scar"]].rename(columns={"p_scar": "p_ref"}), on=["latitude", "longitude", "date", "acq_time"], how="left")
d = np.abs(a.p_scar - a.p_ref); print("p_scar: max abs diff", round(float(d.max()), 3), "| mean", round(float(d.mean()), 4), "| keep/drop decisions that differ", int(((a.p_scar >= hide) != (a.p_ref >= hide)).sum()), "of", len(a))
fs = R.derive_fire_store(pd.concat([hist, new.drop(columns="keep")]), hide); ref = R.derive_fire_store(det[det.date <= s1], hide)
j = fs[(fs.date >= s0)].merge(ref[(ref.date >= s0)], on=["cell_id", "date"], how="outer", suffixes=("", "_ref"), indicator=True); print("cell-days in the replay:", int((j._merge != "right_only").sum()), "| only in one of the two:", int((j._merge != "both").sum()), "| forest flag differs:", int(((j._merge == "both") & (j.forest != j.forest_ref)).sum()))
