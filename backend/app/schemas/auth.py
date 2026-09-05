import re
import uuid
from pydantic import BaseModel, Field, field_validator

from app.models.user import UserRole


EMAIL_REGEX = r"^[\w\.\+\-]+@[\w\.\-]+\.[a-zA-Z]{2,}$"


class LoginRequest(BaseModel):
    email: str = Field(..., description="User email address or registered identifier")
    password: str = Field(..., min_length=8, description="Password (min 8 characters)")

    @field_validator("email")
    @classmethod
    def validate_and_normalize_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if not re.match(EMAIL_REGEX, clean) and not clean.replace("-", "").isalnum():
            raise ValueError("Identifier must be a valid email format or alphanumeric user ID")
        return clean


class OTPRequest(BaseModel):
    identifier: str = Field(..., description="Email or mobile number for OTP delivery")
    purpose: str = Field("LOGIN", description="Purpose of OTP: LOGIN, DEVICE_VERIFICATION")

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, v: str) -> str:
        return v.strip().lower()


class OTPVerifyRequest(BaseModel):
    identifier: str = Field(..., description="Email or mobile number")
    code: str = Field(..., min_length=6, max_length=6, description="6-digit verification code")

    @field_validator("identifier")
    @classmethod
    def normalize_identifier(cls, v: str) -> str:
        return v.strip().lower()

    @field_validator("code")
    @classmethod
    def validate_code_digits(cls, v: str) -> str:
        clean = v.strip()
        if not clean.isdigit() or len(clean) != 6:
            raise ValueError("OTP code must be exactly 6 numeric digits")
        return clean


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    name: str
    phone: str | None = None
    role: UserRole
    authorizedBoatIds: list[str] = []

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
