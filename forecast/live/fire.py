"""Fire-history channels for the live job.

A detection becomes a fire-day of its 0.1 degree cell (cell_id = round(lat*10)*1000 + round(lon*10)). A forest fire-day also needs
>= 50 % of the 3x3-pixel footprint inside the forest-land mask, exactly as in wildfire-datasets-v4/scripts/f01 and f02.
The store is a parquet of (cell_id, date, forest): one row per cell-day with a detection; `forest` is True when a forest detection exists that day.
It starts from the dataset's detections (wildfire-ml-v4/src/live/init_fire_store.py) and is extended with NASA FIRMS rows by refresh_fire.py.

shortcut: the polygon rule the dataset applies to Andhra Pradesh and Uttarakhand cells is not applied here, so about 0.2 % of cells differ
from the dataset on a given day (checked on 2025-03-15 .. 2025-11-30); apply it before relying on those two states.
"""
import io, os, sys
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path[:0] = [HERE, os.path.join(HERE, "vendor")]  # vendor/ holds the dataset feature code the model was trained with
from features_lib import fire_history  # noqa: E402  the dataset's own definition

D0 = pd.Timestamp("2019-01-01")
MIN_BND = 0.5
SATELLITES = ("VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT")   # the two satellites the training detections came from
FIRMS = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"


def cell_id(lat, lon):
    return np.round(np.asarray(lat) * 10).astype(np.int64) * 1000 + np.round(np.asarray(lon) * 10).astype(np.int64)


def footprint(lat, lon, mask, half=1):
    """Share of the (2*half+1) x (2*half+1) mask pixels (0.001 degree) around each detection that lie inside forest land: half=1 is bnd333, half=3 is bnd777."""
    i = np.floor((35.0 - np.asarray(lat)) / 0.001).astype(int); j = np.floor((np.asarray(lon) - 68.0) / 0.001).astype(int)
    if not ((i >= half) & (i < mask.shape[0] - half) & (j >= half) & (j < mask.shape[1] - half)).all(): raise ValueError("detection outside the mask grid")
    s = np.zeros(len(i), np.float32)
    for di in range(-half, half + 1):
        for dj in range(-half, half + 1): s += mask[i + di, j + dj]
    return s / float((2 * half + 1) ** 2)


def footprint_bnd333(lat, lon, mask): return footprint(lat, lon, mask, 1)


def daily_flags(det, mask):
    """det: DataFrame with latitude, longitude, date (datetime64[D]) -> (cell_id, date, forest) one row per cell-day with a detection."""
    d = pd.DataFrame({"cell_id": cell_id(det.latitude.values, det.longitude.values), "date": pd.to_datetime(det.date).dt.normalize().values,
                      "forest": footprint_bnd333(det.latitude.values, det.longitude.values, mask) >= MIN_BND})
    return d.groupby(["cell_id", "date"], as_index=False).forest.max()


FIRMS_COLS = ["latitude", "longitude", "date", "acq_time", "bright_ti4", "bright_ti5", "frp", "scan", "track", "daynight", "confidence", "satellite"]


def parse_firms(csv_text, satellite):
    """FIRMS area CSV -> detections the way training kept them: confidence nominal or high; one row per location, time, satellite. The measurements stay (the quality filter needs them)."""
    if not csv_text.strip() or csv_text.lstrip().lower().startswith(("invalid", "error")): return pd.DataFrame(columns=FIRMS_COLS)
    df = pd.read_csv(io.StringIO(csv_text)); df.columns = [c.strip().lower() for c in df.columns]
    conf = df.confidence.astype(str).str.strip().str.lower().str[0]
    df = df[conf.isin(["n", "h"])]; conf = conf[df.index]
    df = df.drop_duplicates(["latitude", "longitude", "acq_date", "acq_time"])
    return pd.DataFrame({"latitude": df.latitude.values, "longitude": df.longitude.values, "date": pd.to_datetime(df.acq_date).values, "acq_time": df.acq_time.values,
                         "bright_ti4": df.bright_ti4.values, "bright_ti5": df.bright_ti5.values, "frp": df.frp.values, "scan": df.scan.values, "track": df.track.values,
                         "daynight": df.daynight.astype(str).str.strip().str.upper().values, "confidence": conf.loc[df.index].values, "satellite": satellite})


def _get(client, url):
    """GET that is retried again and again on connection errors and 5xx/429 (about 2 hours at most)."""
    import httpx
    from retry import retry

    def once():
        r = client.get(url)
        if r.status_code == 429 or r.status_code >= 500: raise httpx.TransportError(f"HTTP {r.status_code}")
        return r
    return retry(once, retry_on=(httpx.TransportError,))


def availability(key, client):
    """{source: max_date} from FIRMS: standard-processing files run about three months behind, near-real-time covers the rest."""
    r = _get(client, f"https://firms.modaps.eosdis.nasa.gov/api/data_availability/csv/{key}/ALL"); r.raise_for_status()
    df = pd.read_csv(io.StringIO(r.text)); return dict(zip(df.data_id, pd.to_datetime(df.max_date)))


def fetch_firms(bbox, start, end, key, client=None):
    """All FIRMS rows for [start, end] (inclusive), 5 days per request, both satellites: standard processing up to its last day, near-real-time after.
    Returns (rows, errors); an errored chunk is listed, not skipped silently."""
    import httpx
    client = client or httpx.Client(timeout=120); west, south, east, north = bbox; rows, errors = [], []
    last_sp = min(availability(key, client)[f"{s.rsplit('_', 1)[0]}_SP"] for s in SATELLITES)
    for sat in SATELLITES:
        base = sat.rsplit("_", 1)[0]; day = pd.Timestamp(start)
        while day <= pd.Timestamp(end):
            sp = day <= last_sp; stop = min(day + pd.Timedelta(days=4), pd.Timestamp(end), last_sp if sp else pd.Timestamp(end)); n = (stop - day).days + 1
            src = f"{base}_SP" if sp else f"{base}_NRT"
            r = _get(client, f"{FIRMS}/{key}/{src}/{west},{south},{east},{north}/{n}/{day:%Y-%m-%d}")
            if r.status_code != 200: errors.append((src, f"{day:%Y-%m-%d}", r.status_code))
            else: rows.append(parse_firms(r.text, src))
            day = stop + pd.Timedelta(days=1)
    return (pd.concat(rows, ignore_index=True) if rows else pd.DataFrame(columns=FIRMS_COLS)), errors


def fire_channels(store, cell_ids, day):
    """The 7 fire-history channels for forecast day `day`, in the order of the model: fire_days_7d, _30d, days_since_last_fire, has_history
    (any detection; the dataset names these without a suffix and fills them from cleaned detections) then the forest-only three.
    Returns a dict name -> array over cell_ids. Assumes the store covers 2019-01-01 .. day."""
    n = (pd.Timestamp(day) - D0).days + 1; pos = pd.Series(np.arange(len(cell_ids)), index=np.asarray(cell_ids))
    s = store[(store.cell_id.isin(set(cell_ids))) & (store.date >= D0) & (store.date <= pd.Timestamp(day))]
    d = (s.date - D0).dt.days.values; p = pos[s.cell_id.values].values
    Fa = np.zeros((len(cell_ids), n), bool); Fa[p, d] = True
    Ff = np.zeros_like(Fa); m = s.forest.values; Ff[p[m], d[m]] = True
    a, f = fire_history(Fa), fire_history(Ff)
    out = {k: a[k][:, -1].astype(np.float32) for k in ("fire_days_7d", "fire_days_30d", "days_since_last_fire", "has_history")}
    out.update({f"{k}_f": f[k][:, -1].astype(np.float32) for k in ("fire_days_7d", "fire_days_30d", "days_since_last_fire")})
    return out
