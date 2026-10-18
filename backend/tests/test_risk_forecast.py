"""Tests for risk forecast layer endpoints with role-based access and server-side gating."""
import os
from datetime import date

from tests.test_fire_evidence_routes import actor


def test_risk_geojson_requires_enabled_switch(monkeypatch):
    """Risk forecast endpoint returns 403 when RISK_FORECAST_ENABLED is false."""
    monkeypatch.setenv("RISK_FORECAST_ENABLED", "false")
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    r = ops.get("/api/risk/geojson?target=2024-03-10", headers=oh)
    assert r.status_code == 403
    assert "not enabled" in r.json()["detail"].lower()


def test_risk_geojson_gated_to_control_room_roles(monkeypatch):
    """Citizen cannot access risk forecast even when enabled."""
    monkeypatch.setenv("RISK_FORECAST_ENABLED", "true")
    citizen, ch, _ = actor("citizen")
    r = citizen.get("/api/risk/geojson?target=2024-03-10", headers=ch)
    assert r.status_code == 403


def test_risk_geojson_returns_geojson_when_enabled(monkeypatch):
    """Control Room operator receives GeoJSON when feature is enabled."""
    monkeypatch.setenv("RISK_FORECAST_ENABLED", "true")
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    r = ops.get("/api/risk/geojson?target=2024-03-10", headers=oh)
    assert r.status_code == 200
    data = r.json()
    assert data["type"] == "FeatureCollection"
    assert isinstance(data["features"], list)


def test_risk_geojson_scoped_to_user_states(monkeypatch):
    """Scoped operator sees only features from states in their scope."""
    monkeypatch.setenv("RISK_FORECAST_ENABLED", "true")
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    r = ops.get("/api/risk/geojson?target=2024-03-10", headers=oh)
    assert r.status_code == 200
    data = r.json()
    if data["features"]:
        states = {f["properties"]["state"] for f in data["features"]}
        assert states <= {"OD"}, "Scoped user received out-of-scope states"


def test_risk_geojson_high_filter(monkeypatch):
    """risk_band=high parameter filters to Very high and High bands only."""
    monkeypatch.setenv("RISK_FORECAST_ENABLED", "true")
    ops, oh, _ = actor("control_room_operator", scopes=["OD", "CG", "TS", "MP", "MH", "JH"])
    r = ops.get("/api/risk/geojson?target=2024-03-10&risk_band=high", headers=oh)
    assert r.status_code == 200
    data = r.json()
    if data["features"]:
        bands = {f["properties"]["band"] for f in data["features"]}
        assert bands <= {"Very high", "High"}, f"High filter returned {bands}"


def test_risk_geojson_returns_empty_for_missing_date(monkeypatch):
    """Returns empty FeatureCollection for dates with no data."""
    monkeypatch.setenv("RISK_FORECAST_ENABLED", "true")
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    r = ops.get("/api/risk/geojson?target=2020-01-01", headers=oh)
    assert r.status_code == 200
    data = r.json()
    assert data == {"type": "FeatureCollection", "features": []}


def test_ops_settings_includes_risk_forecast_when_enabled(monkeypatch):
    """Ops settings endpoint exposes risk_forecast_enabled and risk_forecast_date."""
    monkeypatch.setenv("RISK_FORECAST_ENABLED", "true")
    monkeypatch.setenv("RISK_FORECAST_DATE", "2024-03-10")
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    r = ops.get("/api/ops/settings", headers=oh)
    assert r.status_code == 200
    data = r.json()
    assert data["risk_forecast_enabled"] is True
    assert data["risk_forecast_date"] == "2024-03-10"


def test_ops_settings_risk_forecast_off_by_default(monkeypatch):
    """When RISK_FORECAST_ENABLED is unset, ops settings show it as disabled."""
    monkeypatch.delenv("RISK_FORECAST_ENABLED", raising=False)
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    r = ops.get("/api/ops/settings", headers=oh)
    assert r.status_code == 200
    data = r.json()
    assert data.get("risk_forecast_enabled") is False
    assert data.get("risk_forecast_date") is None
