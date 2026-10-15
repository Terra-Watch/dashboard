"""Predeclared, development-only spatial baseline controls for RESQ-6.

These functions are deliberately outside the serving engine. Coordinates are
east/north metres relative to the nominal ignition; jitter offsets are metres.
"""
from __future__ import annotations

import numpy as np

from engine import baseline as frozen


def _validated_xy(dx_east_m, dy_north_m, horizon_h: float):
    dx = np.asarray(dx_east_m, dtype=float)
    dy = np.asarray(dy_north_m, dtype=float)
    if not np.isfinite(horizon_h) or horizon_h <= 0:
        raise ValueError("horizon_h must be finite and positive")
    if not np.isfinite(dx).all() or not np.isfinite(dy).all():
        raise ValueError("spatial offsets must be finite")
    return np.broadcast_arrays(dx, dy)


def wind_to_bearing_deg(wind_from_deg: float) -> float:
    """Convert meteorological clockwise-from-north FROM bearing to TO bearing."""
    if not np.isfinite(wind_from_deg):
        raise ValueError("wind bearing must be finite")
    return float((wind_from_deg + 180.0) % 360.0)


def _jitter_arrays(jitter_east_m, jitter_north_m):
    jx = np.asarray(jitter_east_m, dtype=float).reshape(-1)
    jy = np.asarray(jitter_north_m, dtype=float).reshape(-1)
    if not len(jx) or len(jx) != len(jy) or not np.isfinite(jx).all() or not np.isfinite(jy).all():
        raise ValueError("jitter offsets must be non-empty, finite arrays of equal length")
    return jx, jy


def time_only_map(dx_east_m, dy_north_m, horizon_h, jitter_east_m, jitter_north_m):
    """Frozen proximity kernel scaled by h/12; no wind information is used."""
    dx, dy = _validated_xy(dx_east_m, dy_north_m, horizon_h)
    jx, jy = _jitter_arrays(jitter_east_m, jitter_north_m)
    radius_m = frozen.BASE_RADIUS_M * (float(horizon_h) / frozen.REFERENCE_HORIZON_H)
    result = np.zeros(dx.shape, dtype=float)
    for east, north in zip(jx, jy):
        result += np.exp(-np.hypot(dx - east, dy - north) / radius_m)
    return np.clip(result / len(jx), 0.0, 1.0)


def time_wind_map(
    dx_east_m,
    dy_north_m,
    horizon_h,
    jitter_east_m,
    jitter_north_m,
    wind_speed_ms: float | None,
    wind_from_deg: float | None,
):
    """Time-scaled directional kernel with explicit upwind/downwind asymmetry.

    Downwind scale uses the frozen coefficient from Baseline B:
    ``L * (1 + 1.0 per m/s * mean_speed)``. Upwind and crosswind scales are
    ``L``. Unlike the frozen centered ellipse, this one-sided kernel can
    distinguish a wind bearing from its opposite. Calm or missing wind falls
    back to the time-only map. This is a diagnostic control, not calibrated.
    """
    dx, dy = _validated_xy(dx_east_m, dy_north_m, horizon_h)
    jx, jy = _jitter_arrays(jitter_east_m, jitter_north_m)
    if wind_speed_ms is None or wind_from_deg is None:
        return time_only_map(dx, dy, horizon_h, jx, jy), "time_only_missing_wind"
    if not np.isfinite(wind_speed_ms) or wind_speed_ms < 0:
        raise ValueError("wind_speed_ms must be finite and non-negative")
    if not np.isfinite(wind_from_deg):
        raise ValueError("wind_from_deg must be finite")
    if wind_speed_ms == 0:
        return time_only_map(dx, dy, horizon_h, jx, jy), "time_only_calm_wind"

    bearing = wind_to_bearing_deg(wind_from_deg)
    base_scale_m = frozen.BASE_RADIUS_M * (float(horizon_h) / frozen.REFERENCE_HORIZON_H)
    down_scale_m = base_scale_m * (1.0 + frozen.ELONGATION_PER_MS * wind_speed_ms)
    result = np.zeros(dx.shape, dtype=float)
    for east, north in zip(jx, jy):
        d_down, d_cross = frozen.downwind_crosswind_offsets(dx - east, dy - north, bearing)
        signed_down_scale = np.where(d_down >= 0, down_scale_m, base_scale_m)
        radius = np.hypot(d_down / signed_down_scale, d_cross / base_scale_m)
        result += np.exp(-radius)
    return np.clip(result / len(jx), 0.0, 1.0), "time_wind_directional_asymmetric"


def frozen_wind_map(dx_east_m, dy_north_m, horizon_h, jitter_east_m, jitter_north_m, wind_speed_ms, wind_to_bearing_deg):
    """Re-evaluate frozen Baseline B, retained as an explicit parity arm."""
    dx, dy = _validated_xy(dx_east_m, dy_north_m, horizon_h)
    jx, jy = _jitter_arrays(jitter_east_m, jitter_north_m)
    if not np.isfinite(wind_speed_ms) or wind_speed_ms < 0 or not np.isfinite(wind_to_bearing_deg):
        raise ValueError("frozen wind baseline requires finite speed and TO bearing")
    result = np.zeros(dx.shape, dtype=float)
    for east, north in zip(jx, jy):
        d_down, d_cross = frozen.downwind_crosswind_offsets(dx - east, dy - north, wind_to_bearing_deg)
        result += frozen.wind_elongated_proximity(d_down, d_cross, horizon_h, wind_speed_ms)
    return np.clip(result / len(jx), 0.0, 1.0)
