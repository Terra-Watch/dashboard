"""Sort the latest satellite detections into quality groups and post the groups to the dashboard (after post_hotspots.py, every 3 hours).
Usage: python post_hotspot_quality.py --state STATE_DIR --cells BUNDLE/cells.parquet --url https://host/api/feeds/hotspots/quality   (FIRMS_MAP_KEY, RISK_INGEST_TOKEN in the environment)
STATE_DIR is the forecast job's state folder: detections.parquet (the history with p_scar), forest_mask.npz and quality/ (classifier, hide.json, industrial layer). The last 2 days of
near-real-time detections for India are fetched, scored like the forecast job scores them, grouped (detection_groups.py) and posted. Without the history or the classifier nothing is posted
and the dashboard keeps showing every detection ungrouped; this script never hides a detection."""
import argparse, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fire, detection_quality as Q, detection_groups as G  # noqa: E402
from retry import retry  # noqa: E402

SOURCES = ("VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT")


def score_rows(raw, hist, ids, mask, tree, model):
    """raw: FIRMS rows (fire.FIRMS_COLS). Returns a DataFrame with in_forest, bnd333, p_scar, ind_1km, px_prior_offseason_days_365 for every row, in the order of raw."""
    d = raw.copy().reset_index(drop=True)
    for c in ("latitude", "longitude", "acq_time", "bright_ti4", "bright_ti5", "frp", "scan", "track"): d[c] = pd.to_numeric(d[c], errors="coerce")
    d["date"] = pd.to_datetime(d["date"]); d["cell_id"] = fire.cell_id(d.latitude.values, d.longitude.values)
    d["in_forest"] = d.cell_id.isin(ids).values; d["p_scar"] = np.nan; d["bnd333"] = np.nan; d["ind_1km"] = False; d["px_prior_offseason_days_365"] = 0.0
    sub = d[d.in_forest].copy()
    if len(sub):
        sub["bnd333"] = fire.footprint(sub.latitude.values, sub.longitude.values, mask, 1); sub["bnd777"] = fire.footprint(sub.latitude.values, sub.longitude.values, mask, 3)
        for k, v in Q.industrial_flags(sub.latitude.values, sub.longitude.values, tree).items(): sub[k] = v
        feats = Q.features(sub, hist); d.loc[sub.index, "p_scar"] = Q.score(model, feats); d.loc[sub.index, "bnd333"] = sub.bnd333.values
        d.loc[sub.index, "ind_1km"] = sub["ind_1km"].values; d.loc[sub.index, "px_prior_offseason_days_365"] = feats["px_prior_offseason_days_365"].values
    return d


def group_rows(d):
    """Add `group` and `reasons` to the scored rows, including the seen-again promotion."""
    g, r = G.classify(d); d = d.copy()
    if len(d): g, r = G.promote_seen_again(d.assign(acq_datetime=pd.to_datetime(d.date) + pd.to_timedelta((d.acq_time.fillna(0).astype(int) // 100) * 60 + (d.acq_time.fillna(0).astype(int) % 100), unit="m")), g, r)
    d["group"] = g.values; d["reasons"] = r; return d


def payload(d):
    t = d.acq_time.fillna(0).astype(int)
    return [{"satellite": s, "acq_date": str(pd.Timestamp(dt).date()), "acq_time": f"{x:04d}", "latitude": float(la), "longitude": float(lo), "group": gr, "p_scar": None if pd.isna(p) else round(float(p), 4), "reasons": rs}
            for s, dt, x, la, lo, gr, p, rs in zip(d.satellite, d.date, t, d.latitude, d.longitude, d.group, d.p_scar, d.reasons)]


def main():
    import httpx, joblib
    ap = argparse.ArgumentParser(); ap.add_argument("--state", required=True); ap.add_argument("--cells", required=True); ap.add_argument("--url", required=True); ap.add_argument("--days", type=int, default=2); a = ap.parse_args()
    key, token = os.environ["FIRMS_MAP_KEY"].strip(), os.environ["RISK_INGEST_TOKEN"]
    need = [f"{a.state}/detections.parquet", f"{a.state}/forest_mask.npz", f"{a.state}/quality/classifier_v2.joblib", f"{a.state}/quality/industrial_sources.geojsonseq"]
    if any(not os.path.exists(p) for p in need): print("quality state is missing; nothing posted (detections stay ungrouped)"); return 0
    det = pd.read_parquet(need[0]); end = pd.Timestamp.now("UTC").tz_localize(None).normalize(); start = end - pd.Timedelta(days=a.days - 1)
    hist = det[det.date < start]; ids = set(pd.read_parquet(a.cells).cell_id.values); mask = np.load(need[1])["mask"]
    model = joblib.load(need[2])["model"]; tree = Q.industrial_tree(need[3])
    raw, errors = fire.fetch_firms((68, 6, 98, 36), start, end, key)
    if not len(raw): print("no detections fetched", errors[:2]); return 0
    d = group_rows(score_rows(raw, hist, ids, mask, tree, model)); rows = payload(d)
    def once():
        r = httpx.post(a.url, json={"items": rows}, headers={"X-Ingest-Token": token}, timeout=300)
        if r.status_code >= 500: raise httpx.TransportError(f"HTTP {r.status_code}")
        if r.status_code != 200: raise RuntimeError(f"the dashboard refused the groups: HTTP {r.status_code} {r.text[:200]}")
        return r.json()
    res = retry(once, retry_on=(httpx.TransportError,)); print(d.group.value_counts().to_dict(), res); return 0


if __name__ == "__main__": sys.exit(main())
