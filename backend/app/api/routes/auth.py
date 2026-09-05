from datetime import datetime, timedelta, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.database import get_db
from app.core.config import get_environment
from app.core.security import (
    create_access_token,
    generate_otp,
    hash_otp,
    verify_otp_hash,
    verify_password,
)
from app.models.otp import OTPVerification
from app.models.user import User
from app.schemas.auth import LoginRequest, OTPRequest, OTPVerifyRequest, TokenResponse, UserResponse

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

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is suspended or deactivated",
        )

    boat_ids = [b.boatId for b in user.boats]
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
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user associated with verified identifier",
        )

    boat_ids = [b.boatId for b in user.boats]
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
def get_current_user_profile(user: User = Depends(get_current_user)) -> UserResponse:
    """Retrieve authenticated user identity and authorized boats."""
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        phone=user.phone,
        role=user.role,
        authorizedBoatIds=[b.boatId for b in user.boats],
    )
