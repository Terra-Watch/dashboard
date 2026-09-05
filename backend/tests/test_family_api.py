from fastapi.testclient import TestClient
import pytest

from app.core.security import create_access_token
from app.models.user import User



def get_token(user: User) -> str:
    return create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "boat_ids": [b.boatId for b in user.boats],
    })


def test_family_boats_returns_only_assigned_boats(client: TestClient, seeded_data):
    token = get_token(seeded_data["family_user"])
    response = client.get("/api/family/boats", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    boats = response.json()
    assert len(boats) == 1
    assert boats[0]["boatId"] == "AP-07-FISH-12"
    # Boat 2 (AP-07-FISH-99) is NOT in the response!
    assert not any(b["boatId"] == "AP-07-FISH-99" for b in boats)


def test_family_access_authorized_boat_detail(client: TestClient, seeded_data):
    token = get_token(seeded_data["family_user"])
    response = client.get("/api/family/boats/AP-07-FISH-12", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json()["boatId"] == "AP-07-FISH-12"
    assert response.json()["safetyStatus"] in ["SAFE", "WARNING", "EMERGENCY"]


def test_family_access_unauthorized_boat_denied(client: TestClient, seeded_data):
    token = get_token(seeded_data["family_user"])
    # Attempt to query boat 2 which belongs to someone else
    response = client.get("/api/family/boats/AP-07-FISH-99", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert "not authorized" in response.json()["detail"].lower()


def test_fisherman_access_family_route_denied(client: TestClient, seeded_data):
    token = get_token(seeded_data["fisherman_user"])
    response = client.get("/api/family/boats", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
    assert "access denied" in response.json()["detail"].lower()


def test_unauthenticated_request_denied(client: TestClient, seeded_data):
    response = client.get("/api/family/boats")
    assert response.status_code == 401


def test_operational_api_requires_backend_role(client: TestClient, seeded_data):
    assert client.get("/api/boats").status_code == 401
    token = get_token(seeded_data["family_user"])
    assert client.get("/api/boats", headers={"Authorization": f"Bearer {token}"}).status_code == 403


def test_family_boat_location_endpoint(client: TestClient, seeded_data):
    token = get_token(seeded_data["family_user"])
    response = client.get("/api/family/boats/AP-07-FISH-12/location", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    loc = response.json()
    assert loc is not None
    assert loc["latitude"] == 16.9823
    assert loc["longitude"] == 82.2541
    assert loc["speedKnots"] is None
    assert loc["headingDeg"] is None


def test_family_boat_trips_endpoint(client: TestClient, seeded_data):
    token = get_token(seeded_data["family_user"])
    response = client.get("/api/family/boats/AP-07-FISH-12/trips", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    trips = response.json()
    assert len(trips) == 1
    assert trips[0]["title"] == "Morning Trawl"


def test_family_boat_incidents_endpoint(client: TestClient, seeded_data):
    token = get_token(seeded_data["family_user"])
    response = client.get("/api/family/boats/AP-07-FISH-12/incidents", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    incidents = response.json()
    assert len(incidents) == 1
    assert incidents[0]["status"] == "ACTIVE"


def test_websocket_unauthenticated_rejected(client: TestClient):
    with pytest.raises(Exception):
        with client.websocket_connect("/api/family/ws") as ws:
            pass


def test_websocket_authenticated_connects_and_pings(client: TestClient, seeded_data):
    token = get_token(seeded_data["family_user"])
    with client.websocket_connect("/api/family/ws", subprotocols=["bearer", token]) as ws:
        ack = ws.receive_json()
        assert ack["type"] == "connection.acknowledged"
        assert "ap-07-fish-12" in ack["authorized_boats"]
        # Test ping pong
        ws.send_json({"action": "ping"})
        pong = ws.receive_json()
        assert pong["action"] == "pong"

