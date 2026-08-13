import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, Index, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import HistoricalEventType


class HistoricalEvent(Base):
    __tablename__ = "historical_events"
    __table_args__ = (
        Index("ix_historical_events_boat_id", "boat_id"),
        Index("ix_historical_events_gateway_id", "gateway_id"),
        Index("ix_historical_events_timestamp", "timestamp"),
        Index("ix_historical_events_event_type", "event_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    eventType: Mapped[HistoricalEventType] = mapped_column("event_type", Enum(HistoricalEventType, name="historical_event_type"), nullable=False)
    boat_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("boats.id"), nullable=True)
    gateway_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("gateways.id"), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)

    boat = relationship("Boat", back_populates="historical_events")
    gateway = relationship("Gateway", back_populates="historical_events")
