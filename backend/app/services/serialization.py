from app.schemas.alert import AlertResponse
from app.schemas.boat import BoatResponse
from app.schemas.gateway import GatewayResponse
from app.schemas.history import HistoricalEventResponse
from app.schemas.telemetry import TelemetryResponse


def boat_response(boat) -> BoatResponse:
    data = {key: getattr(boat, key) for key in BoatResponse.model_fields if key not in {"id", "location"}}
    data["id"] = boat.id
    data["location"] = None if boat.latitude is None or boat.longitude is None else {"latitude": boat.latitude, "longitude": boat.longitude}
    return BoatResponse.model_validate(data)


def gateway_response(gateway) -> GatewayResponse:
    return GatewayResponse.model_validate(gateway)


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
