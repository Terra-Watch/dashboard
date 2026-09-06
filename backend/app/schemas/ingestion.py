from typing import Literal
from decimal import Decimal

from pydantic import BaseModel, Field


class GatewayHeartbeatEvent(BaseModel):
    eventType: Literal["HEARTBEAT_RECEIVED"]
    nodeId: int = Field(ge=1)
    packetId: int = Field(ge=0, le=4294967295)
    destination: int = Field(ge=0, le=255)
    sequence: int = Field(ge=0, le=4294967295)
    packetSize: int = Field(ge=1, le=255)
    receivedAtMs: int = Field(ge=0)
    rssi: int | None = None
    snr: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)


class GatewayTelemetryEvent(BaseModel):
    eventType: Literal["TELEMETRY_RECEIVED"]
    nodeId: int = Field(ge=1)
    sequence: int = Field(ge=0, le=4294967295)
    packetSize: int = Field(ge=1, le=255)
    receivedAtMs: int = Field(ge=0)
    rssi: int | None = None
    snr: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    rtcValid: bool
    year: int = Field(ge=0, le=2099)
    month: int = Field(ge=0, le=12)
    day: int = Field(ge=0, le=31)
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)
    second: int = Field(ge=0, le=59)
    temperatureC: Decimal = Field(ge=-40, le=85, max_digits=5, decimal_places=2)
    latitude: Decimal | None = Field(default=None, ge=-90, le=90, max_digits=9, decimal_places=6)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180, max_digits=9, decimal_places=6)
