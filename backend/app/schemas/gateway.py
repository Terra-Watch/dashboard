from datetime import datetime
from uuid import UUID

from app.models.enums import BoatStatus
from app.schemas.common import ApiModel


class GatewayResponse(ApiModel):
    id: UUID
    gatewayId: str
    status: BoatStatus
    lastSeen: datetime
    firmware: str | None
    registeredAt: datetime

