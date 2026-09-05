import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import IncidentStatus, IncidentType


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (
        Index("ix_incidents_boat_id", "boat_id"),
        Index("ix_incidents_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incidentId: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, default=uuid.uuid4)
    clientEventId: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True)
    type: Mapped[IncidentType] = mapped_column(Enum(IncidentType, name="incident_type"), nullable=False)
    boat_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("boats.id"), nullable=False)
    sourceLatitude: Mapped[Decimal | None] = mapped_column("source_latitude", Numeric(9, 6), nullable=True)
    sourceLongitude: Mapped[Decimal | None] = mapped_column("source_longitude", Numeric(9, 6), nullable=True)
    status: Mapped[IncidentStatus] = mapped_column(
        Enum(IncidentStatus, name="incident_status", values_callable=lambda enum_type: [item.value for item in enum_type]),
        nullable=False,
    )
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime(timezone=True), nullable=False)
    resolvedAt: Mapped[datetime | None] = mapped_column("resolved_at", DateTime(timezone=True), nullable=True)
    createdOffline: Mapped[bool] = mapped_column("created_offline", Boolean, nullable=False, default=False)

    boat = relationship("Boat")
