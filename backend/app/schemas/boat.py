from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import Field

from app.models.enums import BoatStatus, DataSource
from app.schemas.common import ApiModel, Location


class BoatCreate(ApiModel):
    boatId: str
    nodeId: int
    status: BoatStatus
    sos: bool
    battery: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    location: Location | None = None
    rssi: int | None = None
    snr: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    rttMs: int | None = None
    heartbeatCount: int = 0
    lastSeen: datetime
    firmware: str | None = None
    registeredAt: datetime
    dataSource: DataSource


class BoatUpdate(ApiModel):
    status: BoatStatus | None = None
    sos: bool | None = None
    battery: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    location: Location | None = None
    rssi: int | None = None
    snr: Decimal | None = Field(default=None, max_digits=5, decimal_places=2)
    rttMs: int | None = None
    heartbeatCount: int | None = None
    lastSeen: datetime | None = None
    firmware: str | None = None
    dataSource: DataSource | None = None


class BoatResponse(BoatCreate):
    id: UUID

