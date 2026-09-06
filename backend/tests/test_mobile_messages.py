from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import update

from app.models.user import user_boats


def _auth(client: TestClient, db_session, seeded_data) -> dict[str, str]:
    db_session.execute(update(user_boats).where(user_boats.c.user_id == seeded_data["fisherman_user"].id).values(relationship_type="CREW"))
    db_session.commit()
    response = client.post("/api/auth/login", json={"email": "fisherman@jalari.in", "password": "FishermanPass123!"})
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def test_crew_message_is_persisted_and_idempotent(client: TestClient, db_session, seeded_data):
    headers = _auth(client, db_session, seeded_data)
    client_event_id = str(uuid4())
    payload = {"clientEventId": client_event_id, "text": "HELLO BOAT"}

    first = client.post("/api/mobile/crew/messages", json=payload, headers=headers)
    second = client.post("/api/mobile/crew/messages", json=payload, headers=headers)

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["messageId"] == second.json()["messageId"]
    assert [item["clientEventId"] for item in client.get("/api/mobile/crew/messages", headers=headers).json()] == [client_event_id]


def test_crew_message_cannot_be_reused_with_different_text(client: TestClient, db_session, seeded_data):
    headers = _auth(client, db_session, seeded_data)
    client_event_id = str(uuid4())
    assert client.post("/api/mobile/crew/messages", json={"clientEventId": client_event_id, "text": "ONE"}, headers=headers).status_code == 201
    response = client.post("/api/mobile/crew/messages", json={"clientEventId": client_event_id, "text": "TWO"}, headers=headers)
    assert response.status_code == 409


def test_crew_message_rejects_unauthenticated_request(client: TestClient, seeded_data):
    response = client.post("/api/mobile/crew/messages", json={"clientEventId": str(uuid4()), "text": "HELLO"})
    assert response.status_code == 401


def test_gateway_receipt_advances_dispatch_and_is_idempotent(client: TestClient, db_session, seeded_data):
    headers = _auth(client, db_session, seeded_data)
    client_event_id = str(uuid4())
    created = client.post("/api/mobile/crew/messages", json={"clientEventId": client_event_id, "text": "RECEIPT"}, headers=headers)
    assert created.status_code == 201
    receipt = {"clientEventId": client_event_id, "nodeId": 1, "sequence": 7, "boatNodeReceived": True}
    first = client.post("/api/ingest/gateway/messages/receipt", json=receipt)
    second = client.post("/api/ingest/gateway/messages/receipt", json=receipt)
    assert first.status_code == 202
    assert second.status_code == 202
    assert client.get("/api/mobile/crew/messages", headers=headers).json()[0]["status"] == "BOATNODE_RECEIVED"
