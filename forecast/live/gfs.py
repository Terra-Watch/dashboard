"""GFS block (the 8 forecast channels) from the NOAA open-data bucket on AWS (noaa-gfs-bdp-pds): the 06 UTC run of day d, hours 18..42, bilinear to the cell centres.
Copied from terrawatch-datasets/scripts/20_gfs_pull_aws.py (the arithmetic the model was trained on) with the dataset-only helpers removed. Needs eccodes."""
import calendar, os, sys, time
from concurrent.futures import ThreadPoolExecutor
import numpy as np, pandas as pd, requests, eccodes

BUCKET = "https://noaa-gfs-bdp-pds.s3.amazonaws.com"
HOURS = list(range(18, 45, 3)); AVG_FILES = (24, 30, 36, 42)       # the files that carry the 6-hour PRATE average ending at that hour
NAMES = ["gfs_t2m_max", "gfs_t2m_mean", "gfs_rh_min", "gfs_vpd_max", "gfs_wind_mean", "gfs_gust_max", "gfs_rain_mm", "gfs_soil_0_10"]
ROW0, COL0 = 216, 272                                                # lat 36 and lon 68 on the global 0.25 degree grid (lat 90 -> -90, lon 0 -> 359.75); the box is 121 x 121 points
S = requests.Session(); S.mount("https://", requests.adapters.HTTPAdapter(pool_maxsize=32))

def log(*a): print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)

def weights(c):                                                      # same as g03: cell position inside the 121 x 121 box
    fi = (36.0 - c.lat.values) / 0.25; fj = (c.lon.values - 68.0) / 0.25; i0 = np.clip(np.floor(fi).astype(int), 0, 119); j0 = np.clip(np.floor(fj).astype(int), 0, 119)
    assert (fi >= 0).all() and (fi <= 120).all() and (fj >= 0).all() and (fj <= 120).all(), "cell outside the box"
    return i0, j0, fi - i0, fj - j0

def interp(a, w):                                                    # same as g03: bilinear, masked corners left out and the weights renormalised
    i0, j0, wi, wj = w; c = np.stack([a[i0, j0], a[i0, j0 + 1], a[i0 + 1, j0], a[i0 + 1, j0 + 1]]); ww = np.stack([(1 - wi) * (1 - wj), (1 - wi) * wj, wi * (1 - wj), wi * wj]); ok = ~np.isnan(c)
    den = np.where(ok, ww, 0).sum(0); return np.where(den > 0, np.where(ok, c * ww, 0).sum(0) / np.where(den > 0, den, 1), np.nan).astype(np.float32)

def get(url, headers=None, tries=6):
    for k in range(tries):
        try:
            r = S.get(url, headers=headers, timeout=60)
            if r.status_code == 404: return None
            r.raise_for_status(); return r.content
        except requests.RequestException as e:
            if k == tries - 1: raise
            time.sleep(2 * (k + 1))

def messages(day, h):
    """{(var, level, fcst): grib bytes} for the messages we need of the 06 UTC run of `day` at forecast hour h, or None if the file is not in the bucket"""
    names = ["atmos/", ""] if day >= "20210323" else ["", "atmos/"]      # the folder layout changed with the GFS v16 upgrade
    for sub in names:
        key = f"gfs.{day}/06/{sub}gfs.t06z.pgrb2.0p25.f{h:03d}"; idx = get(f"{BUCKET}/{key}.idx")
        if idx is not None: break
    else: return None
    rows = [l.split(":") for l in idx.decode().strip().split("\n")]; off = [int(r[1]) for r in rows]
    want = {("TMP", "2 m above ground", f"{h} hour fcst"), ("DPT", "2 m above ground", f"{h} hour fcst"), ("UGRD", "10 m above ground", f"{h} hour fcst"), ("VGRD", "10 m above ground", f"{h} hour fcst"),
            ("GUST", "surface", f"{h} hour fcst"), ("SOILW", "0-0.1 m below ground", f"{h} hour fcst")}
    if h in AVG_FILES: want.add(("PRATE", "surface", f"{h - 6}-{h} hour ave fcst"))
    out = {}
    for i, r in enumerate(rows):
        if (r[3], r[4], r[5]) in want:
            end = off[i + 1] - 1 if i + 1 < len(rows) else ""
            b = get(f"{BUCKET}/{key}", {"Range": f"bytes={off[i]}-{end}"})
            if b is None: return None
            out[(r[3], r[4], r[5])] = b
    return out if len(out) == len(want) else None

def decode(b):
    """GRIB message -> [121, 121] float32 of the India box (NaN where the field is masked)"""
    g = eccodes.codes_new_from_message(b)
    try:
        assert eccodes.codes_get(g, "Ni") == 1440 and eccodes.codes_get(g, "Nj") == 721, "unexpected grid"
        eccodes.codes_set(g, "missingValue", 1e30); v = eccodes.codes_get_values(g).reshape(721, 1440)
    finally: eccodes.codes_release(g)
    a = v[ROW0:ROW0 + 121, COL0:COL0 + 121].astype(np.float32); a[a > 1e29] = np.nan; return a

def hour_fields(day, h, w):
    m = messages(day, h)
    if m is None: return None
    pick = lambda v, l, f: decode(m[(v, l, f)])
    f = f"{h} hour fcst"; T = interp(pick("TMP", "2 m above ground", f), w) - 273.15; Td = interp(pick("DPT", "2 m above ground", f), w) - 273.15
    U = interp(pick("UGRD", "10 m above ground", f), w); V = interp(pick("VGRD", "10 m above ground", f), w); G = interp(pick("GUST", "surface", f), w); So = interp(pick("SOILW", "0-0.1 m below ground", f), w)
    R = interp(pick("PRATE", "surface", f"{h - 6}-{h} hour ave fcst"), w) * 21600.0 if h in AVG_FILES else None
    return T, Td, U, V, G, So, R

def day_block(day, w):
    """[8, cells] for the 06 UTC run of `day` (YYYYMMDD), or None if a file is missing. Same arithmetic as g03.day_block."""
    with ThreadPoolExecutor(len(HOURS)) as ex: parts = list(ex.map(lambda h: hour_fields(day, h, w), HOURS))
    if any(p is None for p in parts): return None
    T, Td, U, V, G, So = (np.array([p[i] for p in parts]) for i in range(6)); R = np.array([p[6] for p in parts if p[6] is not None])
    es = lambda t: 0.6108 * np.exp(17.27 * t / (t + 237.3))                       # kPa, Tetens
    rh = np.clip(100 * es(Td) / es(T), 0, 100); vpd = es(T) * (1 - rh / 100)
    return np.stack([T.max(0) + 273.15, T.mean(0) + 273.15, rh.min(0), vpd.max(0), np.hypot(U, V).mean(0), G.max(0), R.sum(0), So.mean(0)]).astype(np.float32)

