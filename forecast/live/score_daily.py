"""Score every cell for the day after `--day` and write run.json + scores.parquet (the website imports these into the database).
Usage: python score_daily.py --day 2025-03-15 --bundle B --weather W.parquet --fire F.parquet [--gfs gfs_20250315.npz] --out DIR
"""
import argparse, hashlib, json, os, sys
from datetime import datetime, timezone
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
from bundle import Bundle  # noqa: E402
import features  # noqa: E402


def run(day, bundle_dir, wstore, fstore, gfs, out):
    b = Bundle(bundle_dir, os.environ.get('RISK_BUNDLE_PUBLIC_KEY') or None); m = b.manifest; cells = pd.read_parquet(f"{bundle_dir}/cells.parquet")
    raw, scored, notes = features.build(day, b, cells, wstore, fstore, gfs)
    total = len(cells); cov = float(scored.mean())
    res = cells[["cell_id", "state", "lat", "lon"]][scored].copy().reset_index(drop=True)
    res["score"] = b.score(raw[scored])
    res = res.sort_values("score", ascending=False, kind="stable").reset_index(drop=True); n = len(res)
    res["rank"] = np.arange(1, n + 1); res["rank_percentile"] = 100.0 * (1.0 - np.arange(n) / max(n - 1, 1))
    res["band"] = [next(x["name"] for x in m["bands"] if (i + 1) / n <= x["top_share"]) for i in range(n)]
    status = "complete" if cov >= m["min_input_coverage"] else "partial"
    info = {"model_id": m["model_id"], "model_version": m["model_version"], "bundle_sha256": hashlib.sha256(open(f"{bundle_dir}/SHA256SUMS", "rb").read()).hexdigest(),
            "issue_day": str(pd.Timestamp(day).date()), "forecast_date": str((pd.Timestamp(day) + pd.Timedelta(days=1)).date()), "mode": "live", "status": status,
            "issued_at": datetime.now(timezone.utc).isoformat(), "bands": m["bands"], "degraded": notes["degraded"], "signed_by": b.signed_by, "licence_notices": m.get("licence_notices", []),
            "coverage": {"cells_scored": int(n), "cells_in_grid": total, "share": cov, "missing_states": sorted(set(m["states"]) - set(res.state))},
            "data_cutoffs": {"weather": str(wstore.date.max().date()), "fire": str(fstore.date.max().date()), "gfs": bool(gfs is not None and bool(gfs["ok"]))}}
    os.makedirs(out, exist_ok=True); res.to_parquet(f"{out}/scores.parquet", index=False); res.drop(columns=["score"]).to_csv(f"{out}/scores.csv", index=False);  # the website importer reads the CSV; raw scores are never exported
    json.dump(info, open(f"{out}/run.json", "w"), indent=2)
    return info, res


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); [ap.add_argument(f"--{k}", required=(k != "gfs")) for k in ("day", "bundle", "weather", "fire", "gfs", "out")]; a = ap.parse_args()
    gfs = dict(np.load(a.gfs, allow_pickle=False)) if a.gfs else None
    info, _ = run(a.day, a.bundle, pd.read_parquet(a.weather), pd.read_parquet(a.fire), gfs, a.out)
    print(json.dumps({k: info[k] for k in ("forecast_date", "status", "coverage", "degraded")}))
