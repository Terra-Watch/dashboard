import uuid

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import UserRole


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    passwordHash: Mapped[str] = mapped_column("password_hash", String, nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role", values_callable=lambda enum_type: [item.value for item in enum_type]), nullable=False)
    assignedBoatId: Mapped[uuid.UUID | None] = mapped_column("assigned_boat_id", UUID(as_uuid=True), ForeignKey("boats.id"), nullable=True)

    assigned_boat = relationship("Boat")
