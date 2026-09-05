from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.models.enums import UserRole


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    username: str
    role: UserRole
    assignedBoatId: UUID | None


class LoginResponse(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    user: UserResponse
