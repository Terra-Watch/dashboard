from uuid import UUID
from pydantic import BaseModel


class FamilyAccessGrant(BaseModel):
    boatId: str


class FamilyMemberResponse(BaseModel):
    userId: UUID
    name: str
    email: str
    accountStatus: str
    boatId: str
    accessStatus: str
    startedAt: str | None
    endedAt: str | None
