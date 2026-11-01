"""Assemble the 41 raw channels, in the bundle's order, for every cell on forecast day d (the forecast is for d + 1)."""
import os, sys
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path[:0] = [HERE, os.path.join(HERE, "vendor")]  # vendor/ holds the dataset feature code the model was trained with
import fire, weather as W  # noqa: E402
from features_lib import calendar  # noqa: E402  (path added by fire.py)

STATIC = ["forest_fraction", "shrub_fraction", "grass_fraction", "crop_fraction", "elevation", "slope", "population_density", "distance_to_roads_km", "forest_land_frac", "nonforest_land_ring8", "crop_ring8"]


def weather_channels(store, cell_ids, day):
    """store: daily weather rows (cell_id, date, t2m, tmax, td, u, v, tp, soil, source). Returns (array [cells, 11], complete-mask, source share)."""
    days = pd.date_range(pd.Timestamp(day) - pd.Timedelta(days=W.HISTORY_DAYS - 1), pd.Timestamp(day))
    s = store[store.date.isin(days)].sort_values(["cell_id", "date"]); groups = dict(tuple(s.groupby("cell_id")))
    out = np.full((len(cell_ids), len(W.NAMES)), np.nan, np.float32); done = np.zeros(len(cell_ids), bool)
    for i, c in enumerate(cell_ids):
        g = groups.get(c)
        if g is None or len(g) < len(days) or not (g.date.values == days.values).all(): continue
        r = W.channels(g)[-1]
        if np.isfinite(r).all(): out[i], done[i] = r, True
    return out, done


def build(day, bundle, cells, wstore, fstore, gfs=None):
    """bundle: bundle.Bundle; cells: bundle cells table. Returns (raw [cells, 41], scored mask, notes dict)."""
    names, ids, notes = bundle.names, cells.cell_id.values, {"degraded": []}
    vals = {n: cells[n].values.astype(np.float32) for n in STATIC}
    w, done = weather_channels(wstore, ids, day); vals.update({n: w[:, j] for j, n in enumerate(W.NAMES)})
    vals.update(fire.fire_channels(fstore, ids, day))
    vals["doy_sin"], vals["doy_cos"] = [np.full(len(ids), v, np.float32) for v in calendar(pd.Timestamp(day).dayofyear)]
    z = np.load(f"{bundle.root}/ndvi_clim.npz"); vals["ndvi"] = z["ndvi"][:, min(pd.Timestamp(day).dayofyear, 366) - 1]; vals["ndvi_age_days"] = np.full(len(ids), z["age"], np.float32)
    notes["degraded"].append("ndvi_climatology")
    gnames = [n for n in names if n.startswith("gfs_")]
    if gfs is not None and bool(gfs["ok"]):
        assert (gfs["cell_id"] == ids).all(), "GFS cells differ from the bundle cells"
        for j, n in enumerate(str(x) for x in gfs["names"]): vals[n] = gfs["data"][:, j]
    else:
        for n in gnames: vals[n] = np.full(len(ids), np.nan, np.float32)
        notes["degraded"].append("gfs_missing")
    missing = [n for n in names if n not in vals]
    if missing: raise KeyError(f"channels not built: {missing}")
    raw = np.stack([vals[n] for n in names], axis=1)
    # a cell is scored only if every observed input exists; GFS and NDVI fall back as flagged above
    scored = done & np.isfinite(np.delete(raw, [names.index(n) for n in gnames + ["ndvi"]], axis=1)).all(axis=1)
    notes["weather_cells_complete"] = int(done.sum())
    return raw.astype(np.float64), scored, notes
