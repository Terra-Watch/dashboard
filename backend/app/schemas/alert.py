from datetime import datetime
from decimal import Decimal
from uuid import UUID

from app.models.enums import AlertSeverity, AlertStatus, AlertType
from app.schemas.common import ApiModel, Location


class AlertResponse(ApiModel):
    id: UUID
    alertId: UUID
    boat_id: UUID | None
    type: AlertType
    severity: AlertSeverity
    status: AlertStatus
    message: str
    location: Location | None = None
    createdAt: datetime
    resolvedAt: datetime | None

