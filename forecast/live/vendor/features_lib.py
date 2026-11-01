"""Derived features that must not see the future (D-13 round 4, replaces the earlier strictly-before version).
Convention: index t is the feature day (end of day t). The label for t is the cell-day positive on t + 1.
Fire history is INCLUSIVE of day t (everything observed through the end of day t) and is measured in fire-days (a fire-day = a day with at least one detection in the cell).
Windows: 7 and 30 days ending at t (days t-6..t and t-29..t). days_since_last_fire = t - last fire-day <= t, capped at 365; has_history says whether any fire-day <= t exists in the record."""
import numpy as np

CAP = 365


def fire_history(fire_day):
    """fire_day: bool or 0/1 array (cells, days). Returns dict of arrays (cells, days)."""
    fd = (np.asarray(fire_day) > 0)
    n_cells, n_days = fd.shape
    cs = np.concatenate([np.zeros((n_cells, 1), dtype=np.int32), np.cumsum(fd, axis=1, dtype=np.int32)], axis=1)   # cs[:, k] = fire-days among days < k
    t = np.arange(n_days)
    out = {}
    for w in (7, 30):
        out[f"fire_days_{w}d"] = (cs[:, t + 1] - cs[:, np.maximum(t + 1 - w, 0)]).astype(np.uint8)
    last = np.maximum.accumulate(np.where(fd, t[None, :], -1), axis=1)                 # last fire-day <= t
    has = last >= 0
    out["days_since_last_fire"] = np.where(has, np.minimum(t[None, :] - last, CAP), CAP).astype(np.int16)
    out["has_history"] = has.astype(np.uint8)
    return out


def calendar(day_of_year):
    """doy_sin, doy_cos of the feature day t (angle 2*pi*doy/365.25). Depends on t only."""
    ang = 2 * np.pi * np.asarray(day_of_year, dtype=float) / 365.25
    return np.sin(ang), np.cos(ang)


def latest_complete_composite(t, window_end_inclusive):
    """Index of the newest composite whose WHOLE window ended on or before day t (D-NDVI rule), or -1.
    window_end_inclusive: sorted array of the last day (as day numbers) of each composite window."""
    ends = np.asarray(window_end_inclusive)
    k = np.searchsorted(ends, t, side="right") - 1
    return int(k)


def new_ignition(y_next, fire_day):
    """new_ignition for feature day t: the label (day t+1) is positive AND there was no fire-day in the 7 days ending at t.
    y_next[:, t] is the label for day t+1; fire_day[:, t] is the fire-day indicator of day t."""
    f = fire_history(fire_day)
    return ((np.asarray(y_next) > 0) & (f["fire_days_7d"] == 0)).astype(np.uint8)
