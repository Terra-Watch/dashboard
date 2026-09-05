import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_current_user
from app.api.dependencies.database import get_db
from app.core.security import (
    create_access_token,
    verify_password,
)
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserResponse

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
