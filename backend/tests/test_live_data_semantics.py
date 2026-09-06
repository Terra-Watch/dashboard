from datetime import datetime, timedelta, timezone

from app.models.enums import HistoricalEventType
from app.models.historical_event import HistoricalEvent
from app.repositories.history import HistoricalEventRepository
from app.services.serialization import compute_boat_status


def test_old_boat_heartbeat_is_offline(seeded_data) -> None:
    old = datetime.now(timezone.utc) - timedelta(minutes=6)
    assert compute_boat_status(old).value == "OFFLINE"


def test_recent_boat_heartbeat_is_online(seeded_data) -> None:
    recent = datetime.now(timezone.utc) - timedelta(seconds=30)
    assert compute_boat_status(recent).value == "ONLINE"


def test_history_repository_returns_newest_first(db_session, seeded_data) -> None:
    boat = seeded_data["boat_1"]
    older = HistoricalEvent(
        eventType=HistoricalEventType.HEARTBEAT_RECEIVED,
        boat_id=boat.id,
        timestamp=datetime.now(timezone.utc) - timedelta(minutes=2),
        details={"packetId": 1},
    )
    newer = HistoricalEvent(
        eventType=HistoricalEventType.HEARTBEAT_RECEIVED,
        boat_id=boat.id,
        timestamp=datetime.now(timezone.utc) - timedelta(seconds=5),
        details={"packetId": 2},
    )
    db_session.add_all([older, newer])
    db_session.commit()

    records = HistoricalEventRepository().list(db_session, boat_id=boat.id)
    assert [record.details["packetId"] for record in records[:2]] == [2, 1]
