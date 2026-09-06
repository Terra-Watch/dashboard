from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DeviceCreate(BaseModel):
    deviceId: str = Field(min_length=1, max_length=100)
    deviceType: str = Field(default="BOATNODE", min_length=1, max_length=50)
    nodeId: int | None = None


class DeviceUpdate(BaseModel):
    deviceType: str | None = Field(default=None, min_length=1, max_length=50)


class DeviceResponse(BaseModel):
    id: UUID
    deviceId: str
    deviceType: str
    nodeId: int | None
    status: str
    boatId: str | None
    registeredAt: datetime
    associatedAt: datetime | None
    unassociatedAt: datetime | None
    lastSeen: datetime | None


class DeviceAssociationResponse(BaseModel):
    id: UUID
    boatId: str
    status: str
    startedAt: datetime
    endedAt: datetime | None
