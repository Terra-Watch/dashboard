import os
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete

from app.core.database import get_engine, get_db
from app.main import app
from app.models import Boat


pytestmark = pytest.mark.skipif(not os.getenv("DATABASE_URL"), reason="DATABASE_URL is required for API integration tests")
client = TestClient(app)


def cleanup() -> None:
    session = next(get_db())
    try:
        session.execute(delete(Boat).where(Boat.boatId.like("API-TEST-%")))
        session.commit()
    finally:
        session.close()


@pytest.fixture(autouse=True)
def clean_database() -> None:
    cleanup()
    yield
    cleanup()


def boat_payload(boat_id: str = "API-TEST-1", node_id: int = 9001) -> dict:
    timestamp = datetime.now(timezone.utc).isoformat()
    return {
        "boatId": boat_id,
        "nodeId": node_id,
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


def test_health_and_empty_collections() -> None:
    assert client.get("/health").json() == {"status": "healthy"}
    assert client.get("/api/boats").json() == []
    assert client.get("/api/gateways").json() == []
    assert client.get("/api/telemetry").json() == []
    assert client.get("/api/alerts").json() == []
    assert client.get("/api/history").json() == []


def test_boat_create_retrieve_update_and_conflicts() -> None:
    payload = boat_payload()
    created = client.post("/api/boats", json=payload)
    assert created.status_code == 201
    assert created.json()["boatId"] == payload["boatId"]
    assert client.get("/api/boats/API-TEST-1").status_code == 200
    assert client.patch("/api/boats/API-TEST-1", json={"sos": True}).status_code == 200
    assert client.post("/api/boats", json=payload).status_code == 409
    assert client.post("/api/boats", json=boat_payload("API-TEST-2", 9001)).status_code == 409
    assert client.get("/api/boats/missing").status_code == 404


def test_boat_telemetry_query_and_system_status() -> None:
    created = client.post("/api/boats", json=boat_payload())
    boat_id = created.json()["boatId"]
    assert client.get(f"/api/boats/{boat_id}/telemetry").status_code == 200
    assert client.get(f"/api/boats/{boat_id}/telemetry").json() == []
    response = client.get("/api/system-status")
    assert response.status_code == 200
    assert {item["component"] for item in response.json()["components"]} == {"BACKEND", "DATABASE", "GATEWAY"}

