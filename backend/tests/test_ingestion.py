import os
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError

from app.api.dependencies.database import get_db
from app.core.database import get_db as database_session
from app.main import app
from app.models import Boat, HistoricalEvent


pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="DATABASE_URL is required for API integration tests")
client = TestClient(app)


def cleanup() -> None:
    session = next(database_session())
    try:
        boats = list(session.scalars(select(Boat).where(Boat.boatId.like("INGEST-TEST-%"))))
        for boat in boats:
            session.execute(delete(HistoricalEvent).where(HistoricalEvent.boat_id == boat.id))
        session.execute(delete(Boat).where(Boat.boatId.like("INGEST-TEST-%")))
        session.commit()
    finally:
        session.close()


@pytest.fixture(autouse=True)
def clean_database() -> None:
    cleanup()
    yield
    cleanup()


def boat_payload() -> dict:
    timestamp = datetime.now(timezone.utc).isoformat()
    return {
        "boatId": "INGEST-TEST-1",
        "nodeId": 9101,
        "status": "ONLINE",
        "sos": False,
        "battery": None,
        "location": None,
        "rssi": None,
        "snr": None,
        "rttMs": None,
        "heartbeatCount": 0,
        "lastSeen": timestamp,
        "firmware": None,
        "registeredAt": timestamp,
        "dataSource": "gateway",
    }


def heartbeat_payload(packet_id: int = 1234) -> dict:
    return {
        "eventType": "HEARTBEAT_RECEIVED",
        "nodeId": 9101,
        "packetId": packet_id,
        "destination": 0,
        "sequence": 7,
        "packetSize": 24,
        "receivedAtMs": 456789,
        "rssi": -87,
        "snr": 7.25,
    }


def register_boat() -> None:
    response = client.post("/api/boats", json=boat_payload())
    assert response.status_code == 201


def test_registered_heartbeat_updates_boat_and_history() -> None:
    register_boat()
    response = client.post("/api/ingest/gateway", json=heartbeat_payload())
    assert response.status_code == 202
    assert response.json() == {"accepted": True, "duplicate": False, "condition": "HEARTBEAT_PROCESSED"}

    session = next(database_session())
    try:
        boat = session.scalar(select(Boat).where(Boat.nodeId == 9101))
        assert boat is not None
        assert boat.heartbeatCount == 1
        assert boat.rssi == -87
        assert str(boat.snr) == "7.25"
        events = list(session.scalars(select(HistoricalEvent).where(HistoricalEvent.boat_id == boat.id)))
        assert len(events) == 1
        assert events[0].eventType.value == "HEARTBEAT_RECEIVED"
        assert events[0].details["packetId"] == 1234
    finally:
        session.close()


def test_duplicate_heartbeat_is_idempotent() -> None:
    register_boat()
    assert client.post("/api/ingest/gateway", json=heartbeat_payload()).status_code == 202
    response = client.post("/api/ingest/gateway", json=heartbeat_payload())
    assert response.status_code == 202
    assert response.json()["duplicate"] is True

    session = next(database_session())
    try:
        boat = session.scalar(select(Boat).where(Boat.nodeId == 9101))
        assert boat is not None and boat.heartbeatCount == 1
        assert len(list(session.scalars(select(HistoricalEvent).where(HistoricalEvent.boat_id == boat.id)))) == 1
    finally:
        session.close()


def test_unknown_node_does_not_create_boat() -> None:
    payload = heartbeat_payload()
    payload["nodeId"] = 99991
    response = client.post("/api/ingest/gateway", json=payload)
    assert response.status_code == 422
    assert response.json() == {"detail": "UNREGISTERED_NODE"}


@pytest.mark.parametrize("payload", [
    {**heartbeat_payload(), "eventType": "TELEMETRY_RECEIVED"},
    {**heartbeat_payload(), "packetId": -1},
    {key: value for key, value in heartbeat_payload().items() if key != "nodeId"},
])
def test_invalid_or_unsupported_events_are_rejected(payload: dict) -> None:
    response = client.post("/api/ingest/gateway", json=payload)
    assert response.status_code == 422


def test_database_failure_is_not_reported_as_success() -> None:
    class BrokenSession:
        def scalar(self, statement):
            raise SQLAlchemyError("database unavailable")

        def close(self):
            pass

    def broken_db():
        yield BrokenSession()

    app.dependency_overrides[get_db] = broken_db
    try:
        response = client.post("/api/ingest/gateway", json=heartbeat_payload())
        assert response.status_code != 202
    finally:
        app.dependency_overrides.clear()
