from app.core.security import create_access_token


def token_for(user) -> str:
    return create_access_token({"sub": str(user.id), "role": user.role.value})


def test_family_cannot_list_admin_users(client, seeded_data):
    response = client.get("/api/users", headers={"Authorization": f"Bearer {token_for(seeded_data['family_user'])}"})
    assert response.status_code == 403


def test_admin_can_create_family_user(client, seeded_data):
    response = client.post(
        "/api/users",
        headers={"Authorization": f"Bearer {token_for(seeded_data['admin_user'])}"},
        json={"email": "new-family@jalari.in", "name": "New Family", "password": "NewFamily123!", "role": "FAMILY", "assignedBoatIds": ["AP-07-FISH-12"]},
    )
    assert response.status_code == 201
    assert response.json()["role"] == "FAMILY"
    assert response.json()["authorizedBoatIds"] == ["AP-07-FISH-12"]


def test_operator_cannot_create_admin(client, seeded_data, db_session):
    from app.models.user import User, UserRole

    operator = User(email="operator@jalari.in", name="Operator", hashed_password="unused", role=UserRole.OPERATOR, is_active=True)
    db_session.add(operator)
    db_session.commit()
    db_session.refresh(operator)
    operator_token = token_for(operator)
    response = client.post(
        "/api/users",
        headers={"Authorization": f"Bearer {operator_token}"},
        json={"email": "new-admin@jalari.in", "name": "New Admin", "password": "NewAdmin123!", "role": "ADMIN"},
    )
    assert response.status_code == 403


def test_authenticated_user_can_change_password(client, seeded_data):
    token = token_for(seeded_data["family_user"])
    response = client.post(
        "/api/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": "FamilyPass123!", "new_password": "FamilyPass456!", "confirm_password": "FamilyPass456!"},
    )
    assert response.status_code == 204


def test_password_reset_is_single_use_in_development(client, seeded_data):
    request = client.post("/api/auth/password-reset/request", json={"email": "family@jalari.in"})
    assert request.status_code == 200
    token = request.json().get("development_token")
    assert token
    confirm = client.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "ResetPass123!", "confirm_password": "ResetPass123!"})
    assert confirm.status_code == 204
    reused = client.post("/api/auth/password-reset/confirm", json={"token": token, "new_password": "ResetPass456!", "confirm_password": "ResetPass456!"})
    assert reused.status_code == 400


def test_audit_log_is_admin_only(client, seeded_data):
    family = client.get("/api/users/audit", headers={"Authorization": f"Bearer {token_for(seeded_data['family_user'])}"})
    assert family.status_code == 403
    admin = client.get("/api/users/audit", headers={"Authorization": f"Bearer {token_for(seeded_data['admin_user'])}"})
    assert admin.status_code == 200
