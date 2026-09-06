from datetime import datetime, timezone
from sqlalchemy import select

from app.core.security import create_access_token, hash_password
from app.models.device import BoatDevice, DeviceAssociation
from app.models.telemetry import Telemetry
from app.models.user import User, UserRole, operator_boat_access, user_boats


def token_for(user: User) -> str:
    return create_access_token({"sub": str(user.id), "role": user.role.value})


def test_assignment_end_preserves_history_and_user(client, seeded_data, db_session):
    admin_token = token_for(seeded_data["admin_user"])
    boat = seeded_data["boat_1"]
    fisherman = User(email="history@jalari.in", name="History Fisherman", hashed_password=hash_password("HistoryPass123!"), role=UserRole.FISHERMAN, is_active=True)
    db_session.add(fisherman)
    db_session.commit()
    created = client.post(
        f"/api/boats/{boat.boatId}/assignments",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"userId": str(fisherman.id), "relationshipType": "COMMANDER"},
    )
    assert created.status_code == 201
    ended = client.post(
        f"/api/boats/{boat.boatId}/assignments/{fisherman.id}/end",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert ended.status_code == 200
    db_session.expire_all()
    rows = db_session.execute(
        select(user_boats).where(
            user_boats.c.user_id == fisherman.id,
            user_boats.c.boat_id == boat.id,
        )
    ).mappings().all()
    assert len(rows) == 1
    assert sum(row["assignment_status"] == "ACTIVE" for row in rows) == 0
    assert db_session.get(User, fisherman.id) is not None


def test_operator_scope_denies_unassigned_boat(client, seeded_data, db_session):
    operator = User(email="scoped@jalari.in", name="Scoped Operator", hashed_password=hash_password("ScopedPass123!"), role=UserRole.OPERATOR, is_active=True)
    db_session.add(operator)
    db_session.flush()
    db_session.execute(operator_boat_access.insert().values(user_id=operator.id, boat_id=seeded_data["boat_1"].id, status="ACTIVE", started_at=datetime.now(timezone.utc), ended_at=None, created_at=datetime.now(timezone.utc)))
    db_session.commit()
    headers = {"Authorization": f"Bearer {token_for(operator)}"}
    assert client.get("/api/boats", headers=headers).json()[0]["boatId"] == seeded_data["boat_1"].boatId
    assert client.get(f"/api/boats/{seeded_data['boat_2'].boatId}", headers=headers).status_code == 403


def test_device_replacement_preserves_association_and_telemetry_identity(client, seeded_data, db_session):
    admin_headers = {"Authorization": f"Bearer {token_for(seeded_data['admin_user'])}"}
    first = client.post("/api/devices", headers=admin_headers, json={"deviceId": "node-02", "deviceType": "BOATNODE", "nodeId": 2002})
    second = client.post("/api/devices", headers=admin_headers, json={"deviceId": "node-05", "deviceType": "BOATNODE", "nodeId": 2005})
    assert first.status_code == 201 and second.status_code == 201
    boat_id = seeded_data["boat_1"].boatId
    assert client.post(f"/api/devices/{first.json()['id']}/associate", headers=admin_headers, json={"boatId": boat_id}).status_code == 200
    db_session.expire_all()
    old = db_session.query(BoatDevice).filter(BoatDevice.device_id == "node-02").one()
    db_session.add(Telemetry(boat_id=seeded_data["boat_1"].id, device_id=old.id, heartbeatCount=1, timestamp=datetime.now(timezone.utc)))
    db_session.commit()
    assert client.post(f"/api/devices/{second.json()['id']}/associate", headers=admin_headers, json={"boatId": boat_id}).status_code == 200
    db_session.expire_all()
    old = db_session.query(BoatDevice).filter(BoatDevice.device_id == "node-02").one()
    new = db_session.query(BoatDevice).filter(BoatDevice.device_id == "node-05").one()
    assert old.status == "UNASSOCIATED"
    assert new.status == "ACTIVE"
    assert db_session.query(DeviceAssociation).filter(DeviceAssociation.device_id == old.id, DeviceAssociation.status == "ENDED").count() == 1
    assert db_session.query(Telemetry).filter(Telemetry.device_id == old.id).count() == 1


def test_archived_user_cannot_use_normal_restore(client, seeded_data):
    headers = {"Authorization": f"Bearer {token_for(seeded_data['admin_user'])}"}
    user_id = seeded_data["family_user"].id
    assert client.post(f"/api/users/{user_id}/archive", headers=headers).status_code == 200
    restored = client.post(f"/api/users/{user_id}/restore", headers=headers)
    assert restored.status_code == 409


def test_boat_can_be_marked_inactive_and_restored(client, seeded_data):
    headers = {"Authorization": f"Bearer {token_for(seeded_data['admin_user'])}"}
    boat_id = seeded_data["boat_1"].boatId
    assert client.post(f"/api/boats/{boat_id}/deactivate", headers=headers).json()["lifecycleStatus"] == "INACTIVE"
    assert client.post(f"/api/boats/{boat_id}/restore", headers=headers).json()["lifecycleStatus"] == "ACTIVE"
