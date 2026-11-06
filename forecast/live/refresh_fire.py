"""Extend the detection store and the fire-day store with FIRMS rows up to --day. Usage: python refresh_fire.py --day 2026-11-01 --cells BUNDLE/cells.parquet --store F.parquet
FIRMS_MAP_KEY comes from the environment (never printed). Next to F.parquet the state folder holds detections.parquet (every detection with its measurements and p_scar), forest_mask.npz and quality/
(classifier_v2.joblib, hide.json, industrial_sources.geojsonseq). Each new detection is scored by the quality classifier of the dataset build; detections below the `hide` threshold are dropped
before the fire-day store (cell_id, date, forest) is derived, the same rule as in the clean training data. Later runs re-fetch the last 3 days (near-real-time rows change).
"""
import argparse, json, os, sys
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fire, detection_quality as Q  # noqa: E402

MIN_BND = 0.5


def derive_fire_store(det, hide):
    """(cell_id, date, forest) from the detections that pass the filter; a detection without a score is kept."""
    k = det[(det.p_scar >= hide) | det.p_scar.isna()]
    return pd.DataFrame({"cell_id": k.cell_id.values, "date": k.date.values, "forest": k.bnd333.values >= MIN_BND}).groupby(["cell_id", "date"], as_index=False).forest.max()


def process(raw, hist, ids, mask, tree, model, hide):
    """New FIRMS rows -> scored rows for the cells of the bundle (pure function: no network, no files)."""
    raw = raw.copy()
    for c in ("latitude", "longitude", "acq_time", "bright_ti4", "bright_ti5", "frp", "scan", "track"): raw[c] = pd.to_numeric(raw[c], errors="coerce")      # empty FIRMS chunks arrive as object columns
    raw["date"] = pd.to_datetime(raw["date"])
    raw = raw[(raw.latitude > 6.05) & (raw.latitude < 34.9) & (raw.longitude > 68.05) & (raw.longitude < 97.9)].copy()
    raw["cell_id"] = fire.cell_id(raw.latitude.values, raw.longitude.values); raw = raw[raw.cell_id.isin(ids)]
    return Q.filter_new(raw, hist, mask, tree, model, hide, fire.footprint) if len(raw) else raw.assign(bnd333=[], bnd777=[], p_scar=[], keep=[])


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--day", required=True); ap.add_argument("--cells", required=True); ap.add_argument("--store", required=True); a = ap.parse_args()
    key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    if not key: sys.exit("FIRMS_MAP_KEY is not set")
    state = os.path.dirname(os.path.abspath(a.store)); ids = set(pd.read_parquet(a.cells).cell_id.values)
    dpath = f"{state}/detections.parquet"
    if not os.path.exists(dpath): sys.exit(f"no detection store at {dpath}: build it first with init_detection_store.py")
    import joblib
    model = joblib.load(f"{state}/quality/classifier_v2.joblib")["model"]; hide = json.load(open(f"{state}/quality/hide.json"))["hide"]
    tree = Q.industrial_tree(f"{state}/quality/industrial_sources.geojsonseq")
    mask = np.load(os.environ.get("FOREST_MASK", f"{state}/forest_mask.npz"))["mask"]   # forest-land mask, 0.001 degree, rows lat 35 downward, columns lon 68 eastward
    det = pd.read_parquet(dpath); start = det.date.max() - pd.Timedelta(days=3); hist = det[det.date < start]
    raw, errors = fire.fetch_firms((68, 6, 98, 36), start, pd.Timestamp(a.day), key)
    new = process(raw, hist, ids, mask, tree, model, hide)
    det = pd.concat([hist, new.drop(columns="keep")], ignore_index=True); det.to_parquet(dpath, index=False)
    store = derive_fire_store(det, hide); store.to_parquet(a.store, index=False)
    print(f"detections={len(det)} through {det.date.max().date()} new={len(new)} dropped_by_filter={int((~new.keep).sum()) if len(new) else 0} fire store rows={len(store)} fetch_errors={len(errors)}")
    for e in errors[:5]: print("error", e)
