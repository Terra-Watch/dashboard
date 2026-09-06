import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import BoatStatus, DataSource


class Boat(Base):
    __tablename__ = "boats"
    __table_args__ = (
        UniqueConstraint("boatId", name="uq_boats_boat_id"),
        UniqueConstraint("nodeId", name="uq_boats_node_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    boatId: Mapped[str] = mapped_column(String, nullable=False)
    nodeId: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[BoatStatus] = mapped_column(Enum(BoatStatus, name="boat_status"), nullable=False)
    sos: Mapped[bool] = mapped_column(Boolean, nullable=False)
    battery: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6), nullable=True)
    rssi: Mapped[int | None] = mapped_column(Integer, nullable=True)
    snr: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    rttMs: Mapped[int | None] = mapped_column(Integer, nullable=True)
    heartbeatCount: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lastSeen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    firmware: Mapped[str | None] = mapped_column(String, nullable=True)
    registeredAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    dataSource: Mapped[DataSource] = mapped_column(
        Enum(DataSource, name="data_source", values_callable=lambda enum_type: [item.value for item in enum_type]),
        nullable=False,
    )
    lifecycleStatus: Mapped[str] = mapped_column(String, nullable=False, default="ACTIVE", server_default="ACTIVE")

    telemetry = relationship("Telemetry", back_populates="boat")
    alerts = relationship("Alert", back_populates="boat")
    historical_events = relationship("HistoricalEvent", back_populates="boat")
