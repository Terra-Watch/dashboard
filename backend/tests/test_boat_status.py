from datetime import datetime, timedelta, timezone

from app.models.enums import BoatStatus
from app.services.serialization import compute_boat_status


def test_compute_boat_status_none_is_offline() -> None:
    assert compute_boat_status(None) == BoatStatus.OFFLINE


def test_compute_boat_status_recent_is_online() -> None:
    recent = datetime.now(timezone.utc) - timedelta(seconds=30)
    assert compute_boat_status(recent) == BoatStatus.ONLINE


def test_compute_boat_status_stale_is_offline() -> None:
    stale = datetime.now(timezone.utc) - timedelta(minutes=6)
    assert compute_boat_status(stale) == BoatStatus.OFFLINE
