import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Enum as SQLEnum, ForeignKey, Index, String, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import UserRole


# Association table linking Users to Boats (Many-to-Many)
user_boats = Table(
    "user_boats",
    Base.metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("boat_id", UUID(as_uuid=True), ForeignKey("boats.id", ondelete="CASCADE"), nullable=False),
    Column("relationship_type", String, nullable=False, default="FAMILY_VIEWER", server_default="FAMILY_VIEWER"),
    Column("assignment_status", String, nullable=False, default="ACTIVE"),
    Column("started_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
    Column("ended_at", DateTime(timezone=True), nullable=True),
    Column("created_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)),
)

operator_boat_access = Table(
    "operator_boat_access",
    Base.metadata,
    Column("id", UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    Column("user_id", UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    Column("boat_id", UUID(as_uuid=True), ForeignKey("boats.id", ondelete="CASCADE"), nullable=False),
    Column("status", String, nullable=False, default="ACTIVE", server_default="ACTIVE"),
    Column("started_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False),
    Column("ended_at", DateTime(timezone=True), nullable=True),
    Column("created_at", DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False),
)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        Index("ix_users_email", "email"),
        Index("ix_users_role", "role"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[UserRole] = mapped_column(SQLEnum(UserRole, name="user_role"), nullable=False, default=UserRole.FAMILY)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    account_status: Mapped[str] = mapped_column(String, nullable=False, default="ACTIVE", server_default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    boats = relationship("Boat", secondary=user_boats, backref="users", lazy="joined")
