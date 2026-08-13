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

