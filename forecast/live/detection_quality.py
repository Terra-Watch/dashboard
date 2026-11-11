"""Quality filter for live fire detections: the same classifier and the same features as the dataset (terrawatch-datasets/scripts/c07 and c09).

A detection gets p_scar, the chance that a burned scar follows within 1 km (-2 to +10 days). Detections with p_scar below `hide` are dropped before the fire-history channels
are built, exactly as in the training data. The features use past and same-pass information only, so they exist for a detection on the day it arrives.

new:  DataFrame of the detections to score (forest detections only, as in training) with
      latitude, longitude, date (datetime64), acq_time (HHMM), bright_ti4, bright_ti5, frp, scan, track, daynight, confidence (l/n/h), bnd333, bnd777, ind_0.5km, ind_1km, ind_2km, cell_id
hist: the same columns for earlier detections (the store since 2019-01-01); it supplies the neighbour counts and the history of each pixel.

Parity (website/forecast/tests/check_detection_quality.py, March 2025, 166,498 detections): every feature equals the dataset feature except `hour`. In the dataset build (c07) the hour array was computed before the rows were sorted by time,
so the stored `hour` does not belong to its row; here `hour` is the true acquisition hour. The classifier gives it 0.4 % of its gain, and 0.06 % of the keep/drop decisions change when the true hour is used.
"""
import numpy as np, pandas as pd
from scipy.spatial import cKDTree

D0 = pd.Timestamp("2019-01-01"); PIX = 0.0034; BIG = 10000
FEATURES = ['bt4', 'bt5', 'bt_diff', 'frp', 'pixel_area', 'scan', 'night', 'hour', 'conf_high', 'bnd333', 'bnd777', 'ind_0.5km', 'ind_1km', 'ind_2km', 'month_sin', 'month_cos', 'doy_sin', 'doy_cos',
            'n_same_pass_1km', 'n_prev24_1km', 'n_prev72_3km', 'px_prior_days_30', 'px_prior_days_90', 'px_prior_days_365', 'px_prior_offseason_days_365', 'px_prior_years', 'cell_prev7d']


def industrial_tree(geojsonseq_path):
    """STRtree over the industrial-type features (OpenStreetMap landuse industrial/quarry/landfill/brownfield, works, kiln, power plant, coal), as in c02."""
    import json, shapely
    from shapely.geometry import shape
    geoms = []
    with open(geojsonseq_path) as f:
        for row in f:
            ft = json.loads(row.lstrip("\x1e"))
            if ft["geometry"]["type"] in ("Polygon", "MultiPolygon", "Point") and ft["properties"]: geoms.append(shape(ft["geometry"]))
    return shapely.STRtree(geoms)


def industrial_flags(lat, lon, tree):
    """{'ind_0.5km','ind_1km','ind_2km'} -> bool arrays: an industrial-type feature within that distance (degrees per km as in c02)."""
    import shapely
    pts = shapely.points(np.asarray(lon, float), np.asarray(lat, float)); out = {}
    for km in (0.5, 1, 2):
        i, _ = tree.query(pts, predicate="dwithin", distance=km / 111.0); hit = np.zeros(len(pts), bool); hit[np.unique(i)] = True; out[f"ind_{km}km"] = hit
    return out


def _prep(d):
    d = d.copy(); d["day"] = pd.to_datetime(d["date"]).dt.tz_localize(None).dt.normalize()
    t = d.acq_time.fillna(0).astype(int); hh = (t // 100).values + (t % 100).values / 60.0
    d["hh"] = hh; d["t_h"] = (d.day - D0).dt.days.values * 24.0 + hh; return d


def features(new, hist):
    """Classifier features of the rows of `new`, using `hist` for the past. Returns a DataFrame in the order of `new` with the columns FEATURES."""
    n = _prep(new).reset_index(drop=True); h = _prep(hist).reset_index(drop=True); n["_new"] = True; h["_new"] = False; n["_pos"] = np.arange(len(n)); h["_pos"] = -1
    d = pd.concat([h, n], ignore_index=True).sort_values("t_h", kind="stable").reset_index(drop=True); isnew = d._new.values
    x = d.longitude.values * 111.32 * np.cos(np.radians(d.latitude.values)); y = d.latitude.values * 110.57; t = d.t_h.values
    f = pd.DataFrame(index=d.index)
    f["bt4"], f["bt5"] = d.bright_ti4.values, d.bright_ti5.values; f["bt_diff"] = f.bt4 - f.bt5
    f["frp"] = d.frp.values; f["pixel_area"] = d.scan.values * d.track.values; f["scan"] = d.scan.values; f["night"] = (d.daynight == "N").astype(float).values; f["hour"] = d.hh.values
    f["conf_high"] = (d.confidence == "h").astype(float).values; f["bnd333"], f["bnd777"] = d.bnd333.values, d.bnd777.values
    for k in ("0.5", "1", "2"): f[f"ind_{k}km"] = d[f"ind_{k}km"].astype(float).values
    mo = d.day.dt.month.values; doy = d.day.dt.dayofyear.values
    f["month_sin"], f["month_cos"] = np.sin(2 * np.pi * mo / 12), np.cos(2 * np.pi * mo / 12); f["doy_sin"], f["doy_cos"] = np.sin(2 * np.pi * doy / 365.25), np.cos(2 * np.pi * doy / 365.25)
    # neighbours (only for the new rows): same pass = within 1 km and 3 h either way; earlier 3 to 24 h within 1 km; earlier 24 to 72 h within 3 km
    same = np.zeros(len(d)); p24 = np.zeros(len(d)); p72 = np.zeros(len(d)); idx_new = np.flatnonzero(isnew)
    if len(idx_new):
        lo_t = t[idx_new].min() - 72; cand = np.flatnonzero((t >= lo_t) & (t <= t[idx_new].max() + 3)); tree = cKDTree(np.column_stack([x[cand], y[cand]]))
        for r, nb in zip(idx_new, tree.query_ball_point(np.column_stack([x[idx_new], y[idx_new]]), r=3.0)):
            j = cand[nb]; j = j[j != r]
            if len(j) == 0: continue
            dt = t[r] - t[j]; dist = np.hypot(x[r] - x[j], y[r] - y[j]); m1 = dist <= 1.0
            same[r] = np.sum(m1 & (np.abs(dt) <= 3)); p24[r] = np.sum(m1 & (dt > 3) & (dt <= 24)); p72[r] = np.sum((dt > 24) & (dt <= 72))
    f["n_same_pass_1km"], f["n_prev24_1km"], f["n_prev72_3km"] = same, p24, p72
    # history of the same pixel
    px = np.round(d.latitude.values / PIX).astype(np.int64) * 100000 + np.round(d.longitude.values / PIX).astype(np.int64)
    pid = pd.factorize(px)[0].astype(np.int64); day_i = (d.day - D0).dt.days.values.astype(np.int64); allk = pid * BIG + day_i
    for W in (30, 90, 365):
        u = np.unique(allk); f[f"px_prior_days_{W}"] = np.searchsorted(u, allk, "left") - np.searchsorted(u, allk - W, "left")
    off = np.isin(mo, [7, 8, 9, 10, 11]); uo = np.unique(allk[off]); f["px_prior_offseason_days_365"] = np.searchsorted(uo, allk, "left") - np.searchsorted(uo, allk - 365, "left")
    yr = d.day.dt.year.values; pk = pid * 100 + (yr - 2019); uy = np.unique(pk); f["px_prior_years"] = np.searchsorted(uy, pk, "left") - np.searchsorted(uy, pid * 100, "left")
    cell = d.cell_id.values.astype(np.int64); cd = cell * BIG + day_i; u, c = np.unique(cd, return_counts=True); cum = np.r_[0, np.cumsum(c)]
    f["cell_prev7d"] = cum[np.searchsorted(u, cd, "left")] - cum[np.searchsorted(u, cd - 7, "left")]
    out = f[isnew][FEATURES].copy(); out["_pos"] = d._pos.values[isnew]
    return out.sort_values("_pos").drop(columns="_pos").reset_index(drop=True)      # the order of `new`


def score(model, feats):
    """p_scar from the LightGBM classifier (classifier_v2.joblib) for a features frame."""
    return model.predict(feats[FEATURES].astype(float))


def filter_new(raw, hist, mask, tree, model, hide, footprint):
    """raw: new FIRMS rows (fire.FIRMS_COLS) inside the bundle's cells, with cell_id. Adds bnd333, bnd777, the industrial flags and p_scar; `keep` is p_scar >= hide.
    `footprint(lat, lon, mask, half)` is fire.footprint. Returns the rows ready to append to the detection store."""
    d = raw.copy().reset_index(drop=True)
    d["bnd333"] = footprint(d.latitude.values, d.longitude.values, mask, 1); d["bnd777"] = footprint(d.latitude.values, d.longitude.values, mask, 3)
    for k, v in industrial_flags(d.latitude.values, d.longitude.values, tree).items(): d[k] = v
    d["p_scar"] = score(model, features(d, hist)) if len(d) else np.zeros(0)
    d["keep"] = d.p_scar >= hide
    return d
