import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class CrewMessage(Base):
    __tablename__ = "crew_messages"
    __table_args__ = (
        UniqueConstraint("messageId", name="uq_crew_messages_message_id"),
        UniqueConstraint("clientEventId", name="uq_crew_messages_client_event_id"),
        Index("ix_crew_messages_boat_id", "boat_id"),
        Index("ix_crew_messages_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    messageId: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, default=uuid.uuid4)
    clientEventId: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True)
    boat_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("boats.id"), nullable=False)
    source_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="QUEUED", server_default="QUEUED")
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime(timezone=True), nullable=False)
    dispatchedAt: Mapped[datetime | None] = mapped_column("dispatched_at", DateTime(timezone=True), nullable=True)
    receivedAt: Mapped[datetime | None] = mapped_column("received_at", DateTime(timezone=True), nullable=True)

    boat = relationship("Boat")
    source_user = relationship("User")
