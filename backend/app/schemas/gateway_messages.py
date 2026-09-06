from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class GatewayMessage(BaseModel):
    messageId: UUID
    clientEventId: UUID
    nodeId: int = Field(ge=1, le=255)
    text: str = Field(min_length=1, max_length=240)
    createdAt: datetime


class GatewayMessageReceipt(BaseModel):
    messageId: UUID | None = None
    clientEventId: UUID | None = None
    nodeId: int = Field(ge=1, le=255)
    sequence: int = Field(ge=0, le=65535)
    boatNodeReceived: bool = False
