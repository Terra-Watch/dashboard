from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import active_boats_for_user, get_current_user
from app.api.dependencies.database import get_db
from app.core.config import get_environment, get_secret_key
from app.core.security import (
    create_access_token,
    generate_otp,
    hash_otp,
    verify_otp_hash,
    verify_password,
    hash_password,
)
from app.models.otp import OTPVerification
from app.models.security import PasswordResetToken
from app.models.user import User, user_boats
from sqlalchemy import select
from app.schemas.auth import ChangePasswordRequest, LoginRequest, OTPRequest, OTPVerifyRequest, PasswordResetConfirmRequest, PasswordResetRequest, ProfileUpdateRequest, TokenResponse, UserResponse
from app.services.audit import record_audit

logger = logging.getLogger("jalri.auth")
router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Authenticate with email/identifier and password. Returns signed JWT."""
    normalized_email = payload.email.strip().lower()
    user = db.query(User).filter((User.email == normalized_email) | (User.phone == normalized_email)).first()

    # Constant-time-like generic error to prevent user enumeration
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active or user.account_status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is suspended or deactivated",
        )

    boat_ids = [b.boatId for b in active_boats_for_user(user, db)]
    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "boat_ids": boat_ids,
    })

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            phone=user.phone,
            role=user.role,
            authorizedBoatIds=boat_ids,
        ),
    )


@router.post("/otp/request")
def request_otp(payload: OTPRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    """Request a short-lived, single-use 6-digit OTP."""
    identifier = payload.identifier.strip().lower()

    # Invalidate existing active OTPs for this identifier
    db.query(OTPVerification).filter(
        OTPVerification.identifier == identifier,
        OTPVerification.is_used.is_(False),
    ).update({"is_used": True})

    # Generate new OTP (5-minute expiry)
    is_dev = get_environment() == "development"
    code = "123456" if is_dev else generate_otp(6)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)

    otp_record = OTPVerification(
        identifier=identifier,
        code_hash=hash_otp(code),
        purpose=payload.purpose,
        expires_at=expires_at,
        attempts=0,
        max_attempts=3,
        is_used=False,
    )
    db.add(otp_record)
    db.commit()

    logger.info("OTP generated for %s (purpose: %s)", identifier, payload.purpose)
    return {
        "message": "If an account matches this identifier, a verification code has been dispatched.",
        "expires_in_seconds": "300",
    }


@router.post("/otp/verify", response_model=TokenResponse)
def verify_otp(payload: OTPVerifyRequest, db: Session = Depends(get_db)) -> TokenResponse:
    """Verify 6-digit OTP and issue JWT access token."""
    identifier = payload.identifier.strip().lower()
    now = datetime.now(timezone.utc)

    record = (
        db.query(OTPVerification)
        .filter(
            OTPVerification.identifier == identifier,
            OTPVerification.is_used.is_(False),
            OTPVerification.expires_at > now,
        )
        .order_by(OTPVerification.created_at.desc())
        .first()
    )

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code is invalid or has expired",
        )

    if record.attempts >= record.max_attempts:
        record.is_used = True
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Maximum verification attempts exceeded. Please request a new code.",
        )

    # Check code
    record.attempts += 1
    if not verify_otp_hash(payload.code, record.code_hash):
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect verification code",
        )

    # Mark used
    record.is_used = True
    db.commit()

    # Fetch user
    user = db.query(User).filter((User.email == identifier) | (User.phone == identifier)).first()
    if not user or not user.is_active or user.account_status != "ACTIVE":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user associated with verified identifier",
        )

    boat_ids = [b.boatId for b in active_boats_for_user(user, db)]
    token = create_access_token({
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
        "boat_ids": boat_ids,
    })

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            phone=user.phone,
            role=user.role,
            authorizedBoatIds=boat_ids,
        ),
    )


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserResponse:
    """Retrieve authenticated user identity and authorized boats."""
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        phone=user.phone,
        role=user.role,
        authorizedBoatIds=[b.boatId for b in active_boats_for_user(user, db)],
    )


@router.patch("/me", response_model=UserResponse)
def update_current_user_profile(payload: ProfileUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserResponse:
    if payload.email is not None and payload.email != user.email:
        duplicate = db.query(User).filter(User.email == payload.email, User.id != user.id).first()
        if duplicate:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")
        user.email = payload.email
    if payload.name is not None:
        user.name = payload.name.strip()
    if payload.phone is not None:
        user.phone = payload.phone
    db.commit()
    db.refresh(user)
    return UserResponse(id=user.id, email=user.email, name=user.name, phone=user.phone, role=user.role, authorizedBoatIds=[b.boatId for b in active_boats_for_user(user, db)])


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(payload: ChangePasswordRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="New password must be different")
    user.hashed_password = hash_password(payload.new_password)
    record_audit(db, user.id, "PASSWORD_CHANGED", "USER", str(user.id))
    db.commit()


def _reset_hash(token: str) -> str:
    return hashlib.sha256(f"{get_secret_key()}:{token}".encode("utf-8")).hexdigest()


@router.post("/password-reset/request")
def request_password_reset(payload: PasswordResetRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    """Create a single-use reset token without revealing account existence.

    Production delivery is intentionally not claimed until an email/SMS provider
    is configured. Development returns the token for local testing only.
    """
    user = db.query(User).filter(User.email == payload.email).first()
    response = {"message": "If an account matches that email, reset instructions will be sent."}
    if not user or not user.is_active or user.account_status != "ACTIVE":
        return response
    now = datetime.now(timezone.utc)
    db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id, PasswordResetToken.used.is_(False)).update({"used": True})
    raw_token = secrets.token_urlsafe(32)
    db.add(PasswordResetToken(user_id=user.id, token_hash=_reset_hash(raw_token), expires_at=now + timedelta(minutes=15), used=False))
    record_audit(db, None, "PASSWORD_RESET_REQUESTED", "USER", str(user.id))
    db.commit()
    if get_environment() == "development":
        response["development_token"] = raw_token
    return response


@router.post("/password-reset/confirm", status_code=status.HTTP_204_NO_CONTENT)
def confirm_password_reset(payload: PasswordResetConfirmRequest, db: Session = Depends(get_db)) -> None:
    now = datetime.now(timezone.utc)
    record = db.query(PasswordResetToken).filter(PasswordResetToken.token_hash == _reset_hash(payload.token), PasswordResetToken.used.is_(False), PasswordResetToken.expires_at > now).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token is invalid or expired")
    user = db.query(User).filter(User.id == record.user_id, User.is_active.is_(True), User.account_status == "ACTIVE").first()
    if not user:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token is invalid or expired")
    user.hashed_password = hash_password(payload.new_password)
    record.used = True
    record_audit(db, None, "PASSWORD_RESET_COMPLETED", "USER", str(user.id))
    db.commit()
