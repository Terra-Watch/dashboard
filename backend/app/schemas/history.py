from datetime import datetime
from typing import Any
from uuid import UUID

from app.models.enums import HistoricalEventType
from app.schemas.common import ApiModel


class HistoricalEventResponse(ApiModel):
    id: UUID
    eventType: HistoricalEventType
    boat_id: UUID | None
    gateway_id: UUID | None
    timestamp: datetime
    details: dict[str, Any]

