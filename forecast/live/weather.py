"""Weather channels from Open-Meteo, built with the dataset's own formulas (vendor/features_v3.py).

Settled days (older than SETTLE_DAYS) come from the archive API (ERA5-Land temperature, dewpoint, soil moisture; ERA5 wind and
precipitation, because era5_land returns neither). The newest days come from the forecast API's analysis hours (past_days), which is
what is available on the day. See docs/12-open-meteo-weather-gap-check.md for how close these are to the training weather.
"""
import os, sys, time
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); sys.path[:0] = [HERE, os.path.join(HERE, "vendor")]  # vendor/ holds the dataset feature code the model was trained with
import features_v3 as fx  # noqa: E402

NAMES = ["t2m_max", "t2m_mean", "rh_min_proxy", "vpd_max_proxy", "wind_speed_meanvec", "precip_day", "precip_7d", "precip_14d", "precip_30d", "days_since_rain", "soil_moisture"]
URLS = {"archive": "https://archive-api.open-meteo.com/v1/archive", "historical_forecast": "https://historical-forecast-api.open-meteo.com/v1/forecast", "forecast": "https://api.open-meteo.com/v1/forecast"}
HOURLY = ["temperature_2m", "dewpoint_2m", "wind_speed_10m", "wind_direction_10m", "precipitation", "soil_moisture_0_to_7cm"]
SETTLE_DAYS = 6          # ERA5 is complete about 5 days behind; older days use the archive
HISTORY_DAYS = 30        # the 30-day rain window needs 30 days ending at the forecast day


class Throttled(Exception):
    pass


def get(url, params, deadline_s=7200):
    """One GET that is retried again and again (connection errors, throttling, server errors) until it works or the deadline passes."""
    import httpx
    from retry import retry

    def once():
        r = httpx.get(url, params=params, timeout=120)
        if r.status_code == 200: return r.json()
        if r.status_code == 429 or r.status_code >= 500: raise Throttled(f"weather feed returned {r.status_code}")
        raise RuntimeError(f"weather feed returned {r.status_code}")  # a 4xx other than 429 is our mistake: do not retry
    return retry(once, deadline_s=deadline_s, retry_on=(httpx.TransportError, Throttled))


def hourly(src, lats, lons, start, end, vars_, model=None):
    p = dict(latitude=",".join(map(str, lats)), longitude=",".join(map(str, lons)), hourly=",".join(vars_), timezone="GMT", wind_speed_unit="ms")
    p.update(start_date=start, end_date=end)
    if model: p["models"] = model
    out = get(URLS[src], p)
    return out if isinstance(out, list) else [out]


def to_frame(h):
    return pd.DataFrame({k: v for k, v in h["hourly"].items() if k != "time"}, index=pd.to_datetime(h["hourly"]["time"]))


def fetch_batch(src, lats, lons, start, end):
    """Hourly frames, one per point, for [start, end] (strings YYYY-MM-DD). src: archive | historical_forecast | forecast."""
    if src == "archive":
        a = hourly(src, lats, lons, start, end, ["temperature_2m", "dewpoint_2m", "soil_moisture_0_to_7cm"], "era5_land")
        b = hourly(src, lats, lons, start, end, ["wind_speed_10m", "wind_direction_10m", "precipitation"], "era5")
        return [pd.concat([to_frame(x), to_frame(y)], axis=1) for x, y in zip(a, b)]
    return [to_frame(x) for x in hourly(src, lats, lons, start, end, HOURLY)]


def daily(df):
    """Hourly frame -> daily table of the 8 ERA5-Land-style inputs (K, m/s components, mm, m3/m3)."""
    g = df.groupby(df.index.floor("D")); day = df.index.floor("D")
    ang = np.deg2rad(df.wind_direction_10m)
    return pd.DataFrame({"t2m": g.temperature_2m.mean() + 273.15, "tmax": g.temperature_2m.max() + 273.15, "td": g.dewpoint_2m.mean() + 273.15,
                         "u": (-df.wind_speed_10m * np.sin(ang)).groupby(day).mean(), "v": (-df.wind_speed_10m * np.cos(ang)).groupby(day).mean(),
                         "tp": g.precipitation.sum(min_count=1), "soil": g.soil_moisture_0_to_7cm.mean()})


def channels(d):
    """d: daily table for consecutive days ending at the forecast day (needs HISTORY_DAYS+ rows). Returns array (days, 11) in NAMES order."""
    rh, vpd = fx.humidity(d.tmax.values, d.td.values); pm = np.maximum(d.tp.fillna(0).values, 0).astype(np.float32)
    roll = fx.rolling_sums(pm); dsr = fx.days_since_rain(pm)
    return np.stack([d.tmax.values, d.t2m.values, rh, vpd, fx.wind_speed(d.u.values, d.v.values), pm, roll[7], roll[14], roll[30], dsr, d.soil.values], axis=-1)
