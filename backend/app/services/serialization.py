from datetime import datetime, timezone

from app.models.enums import BoatStatus
from app.schemas.alert import AlertResponse
from app.schemas.boat import BoatResponse
from app.schemas.gateway import GatewayResponse
from app.schemas.history import HistoricalEventResponse
from app.schemas.telemetry import TelemetryResponse


GATEWAY_ONLINE_TIMEOUT_SECONDS = 300  # 5 minutes
BOAT_ONLINE_TIMEOUT_SECONDS = 300     # 5 minutes


def compute_gateway_status(last_seen: datetime | None, timeout_seconds: int = GATEWAY_ONLINE_TIMEOUT_SECONDS) -> BoatStatus:
    if last_seen is None:
        return BoatStatus.OFFLINE
    now = datetime.now(timezone.utc)
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    if (now - last_seen).total_seconds() <= timeout_seconds:
        return BoatStatus.ONLINE
    return BoatStatus.OFFLINE


def compute_boat_status(last_seen: datetime | None, timeout_seconds: int = BOAT_ONLINE_TIMEOUT_SECONDS) -> BoatStatus:
    if last_seen is None:
        return BoatStatus.OFFLINE
    now = datetime.now(timezone.utc)
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    if (now - last_seen).total_seconds() <= timeout_seconds:
        return BoatStatus.ONLINE
    return BoatStatus.OFFLINE


def boat_response(boat) -> BoatResponse:
    data = {key: getattr(boat, key) for key in BoatResponse.model_fields if key not in {"id", "location", "status"}}
    data["id"] = boat.id
    data["status"] = compute_boat_status(boat.lastSeen)
    data["location"] = None if boat.latitude is None or boat.longitude is None else {"latitude": boat.latitude, "longitude": boat.longitude}
    return BoatResponse.model_validate(data)


def gateway_response(gateway) -> GatewayResponse:
    computed_status = compute_gateway_status(gateway.lastSeen)
    data = {
        "id": gateway.id,
        "gatewayId": gateway.gatewayId,
        "status": computed_status,
        "lastSeen": gateway.lastSeen,
        "firmware": gateway.firmware,
        "registeredAt": gateway.registeredAt,
    }
    return GatewayResponse.model_validate(data)


def telemetry_response(telemetry) -> TelemetryResponse:
    data = {key: getattr(telemetry, key) for key in TelemetryResponse.model_fields if key not in {"location"}}
    data["location"] = None if telemetry.latitude is None or telemetry.longitude is None else {"latitude": telemetry.latitude, "longitude": telemetry.longitude}
    return TelemetryResponse.model_validate(data)


def alert_response(alert) -> AlertResponse:
    data = {key: getattr(alert, key) for key in AlertResponse.model_fields if key not in {"location"}}
    data["location"] = None if alert.latitude is None or alert.longitude is None else {"latitude": alert.latitude, "longitude": alert.longitude}
    return AlertResponse.model_validate(data)


def history_response(event) -> HistoricalEventResponse:
    return HistoricalEventResponse.model_validate(event)
