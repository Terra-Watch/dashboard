import uuid
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import DateTime, Enum as SQLEnum, ForeignKey, Index, JSON, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class TripStatus(str, Enum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    INTERRUPTED = "INTERRUPTED"


class Trip(Base):
    __tablename__ = "trips"
    __table_args__ = (
        Index("ix_trips_boat_id", "boat_id"),
        Index("ix_trips_status", "status"),
        Index("ix_trips_start_time", "start_time"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    boat_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("boats.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    departure_port: Mapped[str] = mapped_column(String, nullable=False)
    arrival_port: Mapped[str | None] = mapped_column(String, nullable=True)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[TripStatus] = mapped_column(SQLEnum(TripStatus, name="trip_status"), nullable=False, default=TripStatus.ACTIVE)
    distance_nautical_miles: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    waypoints: Mapped[list | None] = mapped_column(JSON, nullable=True)
    safety_warnings: Mapped[list | None] = mapped_column(JSON, nullable=True)

    boat = relationship("Boat", backref="trips")
