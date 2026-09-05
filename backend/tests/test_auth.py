from fastapi.testclient import TestClient
import pytest


def test_family_successful_login(client: TestClient, seeded_data):
    response = client.post(
        "/api/auth/login",
        json={"email": "family@jalari.in", "password": "FamilyPass123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "family@jalari.in"
    assert data["user"]["role"] == "FAMILY"
    assert "AP-07-FISH-12" in data["user"]["authorizedBoatIds"]


def test_fisherman_successful_login(client: TestClient, seeded_data):
    response = client.post(
        "/api/auth/login",
        json={"email": "fisherman@jalari.in", "password": "FishermanPass123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["role"] == "FISHERMAN"


def test_invalid_password_returns_generic_error(client: TestClient, seeded_data):
    response = client.post(
        "/api/auth/login",
        json={"email": "family@jalari.in", "password": "WrongPassword999!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_nonexistent_user_returns_generic_error(client: TestClient, seeded_data):
    response = client.post(
        "/api/auth/login",
        json={"email": "nobody@jalari.in", "password": "SomePassword123!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"


def test_password_too_short_validation(client: TestClient):
    response = client.post(
        "/api/auth/login",
        json={"email": "family@jalari.in", "password": "short"},
    )
    assert response.status_code == 422


def test_get_current_user_profile(client: TestClient, seeded_data):
    login_res = client.post(
        "/api/auth/login",
        json={"email": "family@jalari.in", "password": "FamilyPass123!"},
    )
    token = login_res.json()["access_token"]

    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == "family@jalari.in"
    assert me_res.json()["role"] == "FAMILY"
