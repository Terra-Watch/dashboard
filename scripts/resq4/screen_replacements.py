"""RESQ-4 step 2: apply the RESQ-3 forest rule to the replacement candidates in the stated order.

Rule (unchanged from RESQ-3, check_inputs.py): the ESA WorldCover 2021 class of the 10 m pixel containing
the CSV ignition coordinate must be forest (10 tree cover, 95 mangroves). Stop after two accepted.
Only the WorldCover window is fetched here; accepted incidents get the full RESQ-3 fetch afterwards.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from rasterio.transform import rowcol

WEBSITE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WEBSITE / "scripts/resq3"))
import fetch_inputs as fi  # noqa: E402

ORDER = ["E2023-084925", "E2024-155286", "E2023-076569", "E2023-098685", "E2023-078410"]
NAMES = {10: "tree cover", 20: "shrubland", 30: "grassland", 40: "cropland", 50: "built-up", 60: "bare/sparse", 80: "water", 90: "herbaceous wetland", 95: "mangroves"}


def main():
    cand = pd.read_csv(WEBSITE / "results/resq2_incident_candidates.csv", dtype={"first_time_utc": str, "first_time_ist": str})
    out, accepted = [], []
    for iid in ORDER:
        if len(accepted) == 2:
            out.append({"incident_id": iid, "status": "not evaluated (two replacements already accepted)"})
            continue
        row = next(cand[cand.event_id == iid].itertuples())
        folder = fi.OUT / iid
        folder.mkdir(parents=True, exist_ok=True)
        bounds = fi.window_bounds(row)
        urls = [fi.WC_URL.format(tile=f"N{la:02d}E{lo:03d}") for la, lo in fi.tiles(bounds, 3)]
        fi.fetch_window(urls, bounds, folder / "worldcover_2021_window.tif", "ESA WorldCover 2021 v200, 10 m, window")
        with rasterio.open(folder / "worldcover_2021_window.tif") as r:
            a = r.read(1)
            ri, ci = rowcol(r.transform, row.ign_lon, row.ign_lat)
            cls = int(a[ri, ci])
            # context only (not the rule): 190 m disc
            rows, cols = np.indices(a.shape)
            xs, ys = rasterio.transform.xy(r.transform, rows.ravel(), cols.ravel())
            kx = (np.array(xs).reshape(a.shape) - row.ign_lon) * 111.32 * np.cos(np.radians(row.ign_lat))
            ky = (np.array(ys).reshape(a.shape) - row.ign_lat) * 111.2
            near = np.hypot(kx, ky) <= 0.19
            ctx = {NAMES.get(int(v), str(v)): round(100 * c / near.sum(), 1) for v, c in zip(*np.unique(a[near], return_counts=True))}
        ok = cls in (10, 95)
        rec = {"incident_id": iid, "state": row.state, "ignition": [row.ign_lat, row.ign_lon], "ignition_pixel_class": cls, "class_name": NAMES.get(cls, "?"),
               "within_190m_pct": ctx, "status": "accepted" if ok else "rejected", "reason": None if ok else f"ignition pixel is class {cls} ({NAMES.get(cls, '?')}), not forest"}
        out.append(rec)
        if ok:
            accepted.append(iid)
    (WEBSITE / "data/resq2/replacement_screening.json").write_text(json.dumps(out, indent=1))
    for r in out:
        print(r["incident_id"], r["status"], r.get("ignition_pixel_class"), r.get("within_190m_pct"))


if __name__ == "__main__":
    main()
