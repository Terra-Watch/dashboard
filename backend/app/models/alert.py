import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import AlertSeverity, AlertStatus, AlertType


class Alert(Base):
    __tablename__ = "alerts"
    __table_args__ = (
        Index("ix_alerts_boat_id", "boat_id"),
        Index("ix_alerts_status", "status"),
        Index("ix_alerts_created_at", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    alertId: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True)
    boat_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("boats.id"), nullable=True)
    type: Mapped[AlertType] = mapped_column(Enum(AlertType, name="alert_type"), nullable=False)
    severity: Mapped[AlertSeverity] = mapped_column(Enum(AlertSeverity, name="alert_severity"), nullable=False)
    status: Mapped[AlertStatus] = mapped_column(Enum(AlertStatus, name="alert_status"), nullable=False)
    message: Mapped[str] = mapped_column(String, nullable=False)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    createdAt: Mapped[datetime] = mapped_column("created_at", DateTime(timezone=True), nullable=False)
    resolvedAt: Mapped[datetime | None] = mapped_column("resolved_at", DateTime(timezone=True), nullable=True)

    boat = relationship("Boat", back_populates="alerts")
