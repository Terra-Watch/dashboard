from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class OperationsMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    messageId: UUID
    clientEventId: UUID
    boatId: str
    sourceUserName: str
    sourceUserEmail: str
    text: str
    status: str
    createdAt: datetime
    dispatchedAt: datetime | None
    receivedAt: datetime | None
