"""The 8 GFS channels for forecast day d (06 UTC run of day d, hours 18..42), for the bundle's cells. Needs eccodes (own environment).
Uses gfs.py (the arithmetic the model was trained on).
Usage: python gfs_fetch.py --day 20250315 --cells BUNDLE/cells.parquet --out DIR   -> DIR/gfs_<day>.npz (data [cells, 8], names, cell_id, ok)
"""
import argparse, os, sys
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path[:0] = [HERE, os.path.join(HERE, "vendor")]  # vendor/ holds the dataset feature code the model was trained with
import gfs as g  # noqa: E402

ap = argparse.ArgumentParser(); ap.add_argument("--day", required=True); ap.add_argument("--cells", required=True); ap.add_argument("--out", required=True); a = ap.parse_args()
c = pd.read_parquet(a.cells)[["cell_id", "lat", "lon"]]
from retry import retry  # noqa: E402
w = g.weights(c)

def once():
    b = g.day_block(a.day, w)                                   # [8, cells], or None while a file is not in the bucket yet
    if b is None: raise FileNotFoundError("the 06 UTC run is not fully published yet")
    return b
try: block = retry(once, deadline_s=5400, ceiling=300)           # the run is normally out by 10 UTC: wait up to 90 minutes
except Exception as e: print("gfs gave up:", e); block = None
os.makedirs(a.out, exist_ok=True)
data = np.full((len(c), len(g.NAMES)), np.nan, np.float32) if block is None else block.T
np.savez_compressed(f"{a.out}/gfs_{a.day}.npz", data=data, names=np.array(g.NAMES), cell_id=c.cell_id.values, ok=block is not None)
print("gfs", a.day, "ok" if block is not None else "MISSING (run not in the bucket)")
