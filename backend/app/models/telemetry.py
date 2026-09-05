import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class Telemetry(Base):
    __tablename__ = "telemetry"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    boat_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("boats.id"), nullable=False, index=True)
    battery: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    rssi: Mapped[int | None] = mapped_column(Integer, nullable=True)
    snr: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    rttMs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rtcTemperatureC: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    sensorTimestamp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    heartbeatCount: Mapped[int] = mapped_column(Integer, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    boat = relationship("Boat", back_populates="telemetry")
