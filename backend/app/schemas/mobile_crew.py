from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import IncidentStatus, IncidentType
from app.schemas.common import Location


class IncidentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    incidentId: UUID
    clientEventId: UUID
    type: IncidentType
    boat_id: UUID
    sourceLatitude: float | None
    sourceLongitude: float | None
    status: IncidentStatus
    createdAt: datetime
    resolvedAt: datetime | None
    createdOffline: bool


class SosRequest(BaseModel):
    clientEventId: UUID
    location: Location | None = None
    createdOffline: bool = False


class SyncOperation(BaseModel):
    operation: str = Field(pattern="^SOS_CREATE$")
    clientEventId: UUID
    location: Location | None = None
    createdOffline: bool = False


class SyncRequest(BaseModel):
    operations: list[SyncOperation] = Field(max_length=100)


class SyncResult(BaseModel):
    clientEventId: UUID
    accepted: bool
    incident: IncidentResponse | None = None
    error: str | None = None


class SyncResponse(BaseModel):
    results: list[SyncResult]
