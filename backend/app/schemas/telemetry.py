from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel, Location


class TelemetryResponse(ApiModel):
    id: UUID
    boat_id: UUID
    battery: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    location: Location | None = None
    rssi: int | None
    snr: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    rttMs: int | None
    rtcTemperatureC: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    sensorTimestamp: datetime | None = None
    heartbeatCount: int
    timestamp: datetime
