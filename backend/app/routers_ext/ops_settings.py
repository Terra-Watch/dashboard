"""Operational thresholds the Control Room screens need. They come only from configuration: unset means the feature is off, never a guessed number."""
import os

from fastapi import APIRouter, Depends, HTTPException

from ..core.security import current_redesign_user

router = APIRouter(prefix='/api/ops', tags=['ops'])
STAFF = {'admin', 'control_room_operator', 'incident_commander'}


def _positive_float(name: str) -> float | None:
    try:
        value = float(os.environ[name])
    except (KeyError, ValueError):
        return None
    return value if value > 0 else None


def _radii() -> list[float] | None:
    raw = os.environ.get('EXPOSURE_RADII_KM', '')
    try:
        values = sorted({float(part) for part in raw.split(',') if part.strip()})
    except ValueError:
        return None
    return values if values and all(v > 0 for v in values) else None


@router.get('/settings')
def settings(user: dict = Depends(current_redesign_user)) -> dict:
    if user.get('role') not in STAFF:
        raise HTTPException(status_code=403, detail='Control Room access required')
    radius, window = _positive_float('CORROBORATION_RADIUS_KM'), _positive_float('CORROBORATION_WINDOW_MINUTES')
    
    # Risk forecast settings
    risk_forecast_enabled = os.environ.get('RISK_FORECAST_ENABLED', '').lower() == 'true'
    risk_forecast_date = os.environ.get('RISK_FORECAST_DATE', '').strip() or None
    
    return {
        'corroboration': {'radius_km': radius, 'window_minutes': window} if radius and window else None,
        'exposure_radii_km': _radii(),
        'feed_stale_minutes': _positive_float('FEED_STALE_MINUTES'),
        'scenario_enabled': os.environ.get('SCENARIO_PLANNER_ENABLED', '').lower() == 'true',
        'risk_forecast_enabled': risk_forecast_enabled,
        'risk_forecast_date': risk_forecast_date if risk_forecast_enabled else None,
    }
