from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


RELATIONSHIP_TYPES = {"OWNER", "COMMANDER", "CREW", "FAMILY_VIEWER"}


class AssignmentCreate(BaseModel):
    userId: UUID
    relationshipType: str


class AssignmentUpdate(BaseModel):
    relationshipType: str | None = None
    status: str | None = None


class AssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    userId: UUID
    boatId: str
    relationshipType: str
    status: str
    startedAt: datetime | None
    endedAt: datetime | None
