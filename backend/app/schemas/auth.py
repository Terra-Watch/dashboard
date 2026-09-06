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


class ProfileUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = None
    phone: str | None = Field(default=None, max_length=40)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, v: str | None) -> str | None:
        if v is None:
            return None
        clean = v.strip().lower()
        if not re.match(EMAIL_REGEX, clean):
            raise ValueError("Email must be valid")
        return clean


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=8)
    new_password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v: str, info):
        if info.data.get("new_password") and v != info.data["new_password"]:
            raise ValueError("Passwords do not match")
        return v


class PasswordResetRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def normalize_reset_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if not re.match(EMAIL_REGEX, clean):
            raise ValueError("Email must be valid")
        return clean


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(..., min_length=32)
    new_password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)

    @field_validator("confirm_password")
    @classmethod
    def reset_passwords_match(cls, v: str, info):
        if info.data.get("new_password") and v != info.data["new_password"]:
            raise ValueError("Passwords do not match")
        return v


class UserCreateRequest(BaseModel):
    email: str
    name: str = Field(..., min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    password: str = Field(..., min_length=8)
    role: UserRole
    assignedBoatIds: list[str] = Field(default_factory=list)

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        clean = v.strip().lower()
        if not re.match(EMAIL_REGEX, clean):
            raise ValueError("Email must be valid")
        return clean


class UserAdminUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = None
    phone: str | None = Field(default=None, max_length=40)
    role: UserRole | None = None
    is_active: bool | None = None
    assignedBoatIds: list[str] | None = None


class AdminUserResponse(UserResponse):
    is_active: bool
    account_status: str
