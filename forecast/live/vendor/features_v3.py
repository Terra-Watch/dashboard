"""Round 8 weather features (pure numpy; tested in tests/test_features_v3.py). All values of day t use days <= t only (UTC day, end of day t).
Inputs are daily ERA5-Land values in K, m s-1, m (tp = daily sum), m3 m-3. Formulas are also written into config.yaml.
  e_s(T) = 6.1094 * exp(17.625 * T / (T + 243.04))   hPa, T in degrees C (August-Roche-Magnus)
  rh_min_proxy [%]   = 100 * e_s(Td_mean) / e_s(Tmax)        clipped to 0..100; the lowest humidity of the day is near Tmax, Td_mean is the daily mean dewpoint
  vpd_max_proxy [kPa] = (e_s(Tmax) - e_s(Td_mean)) / 10      clipped at 0
  wind_speed_meanvec [m s-1] = sqrt(mean_u^2 + mean_v^2)    speed of the daily mean wind vector; <= the mean of hourly speeds
  precip_day [mm] = max(tp, 0) * 1000                        negative values (numerical noise) are clamped and counted
  precip_7d, 14d, 30d [mm] = sum of precip_day over the w days ending at t (inclusive); NaN until a full window exists
  days_since_rain [days] = t - last day <= t with precip_day >= 1 mm, capped at 30 (30 also when no rain day in the 30 days ending at t); NaN until the first 30 days of record exist (index 29)"""
import numpy as np

RAIN_MM = 1.0
CAP = 30


def es_hpa(t_c):
    return 6.1094 * np.exp(17.625 * t_c / (t_c + 243.04))


def humidity(tmax_k, td_k):
    e_max, e_d = es_hpa(tmax_k - 273.15), es_hpa(td_k - 273.15)
    rh = np.clip(100.0 * e_d / e_max, 0.0, 100.0)
    vpd = np.maximum(e_max - e_d, 0.0) / 10.0
    return rh.astype(np.float32), vpd.astype(np.float32)


def wind_speed(u, v):
    return np.sqrt(u.astype(np.float64) ** 2 + v.astype(np.float64) ** 2).astype(np.float32)


def precip_day(tp_m):
    """returns (mm array with negatives set to 0, number of negative values clamped)"""
    neg = int((tp_m < 0).sum())
    return (np.maximum(tp_m, 0) * 1000.0).astype(np.float32), neg


def rolling_sums(p, windows=(7, 14, 30)):
    """p: (days, ...) precipitation in mm. window w at index t = sum p[t-w+1..t]; NaN where t < w - 1 (no full window)."""
    cs = np.concatenate([np.zeros((1,) + p.shape[1:], dtype=np.float64), np.cumsum(p, axis=0, dtype=np.float64)], axis=0)
    out = {}
    n = p.shape[0]
    for w in windows:
        s = np.full(p.shape, np.nan, dtype=np.float32)
        if n >= w:
            s[w - 1:] = (cs[w:] - cs[:n - w + 1]).astype(np.float32)
        out[w] = s
    return out


def days_since_rain(p_mm):
    """p_mm: (days, ...). Days since the last day <= t with p >= 1 mm, capped at 30; NaN while fewer than 30 days of history exist and no rain day was seen."""
    n = p_mm.shape[0]
    t = np.arange(n).reshape((n,) + (1,) * (p_mm.ndim - 1))
    rain = p_mm >= RAIN_MM
    last = np.maximum.accumulate(np.where(rain, t, -10 ** 6), axis=0)
    ds = (t - last).astype(np.float32)
    ds[last < 0] = np.inf
    out = np.minimum(ds, CAP)
    short = (t < CAP - 1) & ~np.isfinite(ds)      # no rain seen yet and fewer than 30 days of history (index t has t + 1 days): unknown; at t = 29 the 30 days 0..29 are complete
    out = np.where(short, np.nan, out).astype(np.float32)
    return out
