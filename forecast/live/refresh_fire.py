"""Extend the fire-day store with FIRMS rows up to --day. Usage: python refresh_fire.py --day 2026-11-01 --cells BUNDLE/cells.parquet --store F.parquet
FIRMS_MAP_KEY comes from the environment (never printed). First run starts from the dataset's detections; later runs re-fetch the last 3 days (near-real-time rows change).
"""
import argparse, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fire  # noqa: E402

ap = argparse.ArgumentParser(); ap.add_argument("--day", required=True); ap.add_argument("--cells", required=True); ap.add_argument("--store", required=True); a = ap.parse_args()
key = os.environ.get("FIRMS_MAP_KEY", "").strip()
if not key: sys.exit("FIRMS_MAP_KEY is not set")
ids = pd.read_parquet(a.cells).cell_id.values
if not os.path.exists(a.store): sys.exit(f"no fire store at {a.store}: build it first with init_fire_store.py")
store = pd.read_parquet(a.store)
start = store.date.max() - pd.Timedelta(days=3); store = store[store.date < start]
det, errors = fire.fetch_firms((68, 6, 98, 36), start, pd.Timestamp(a.day), key)
mask = np.load(os.environ.get("FOREST_MASK", os.path.join(os.path.dirname(os.path.abspath(a.store)), "forest_mask.npz")))["mask"]   # forest-land mask, 0.001 degree, rows lat 35 downward, columns lon 68 eastward
det = det[(det.latitude > 6.05) & (det.latitude < 34.9) & (det.longitude > 68.05) & (det.longitude < 97.9)]
new = fire.daily_flags(det, mask) if len(det) else store.iloc[0:0]
new = new[new.cell_id.isin(set(ids))]
store = pd.concat([store, new]).groupby(["cell_id", "date"], as_index=False).forest.max()
store.to_parquet(a.store, index=False)
print(f"fire store rows={len(store)} through {store.date.max().date()} new_cell_days={len(new)} fetch_errors={len(errors)}")
for e in errors[:5]: print("error", e)
