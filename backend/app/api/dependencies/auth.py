import uuid
from typing import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.api.dependencies.database import get_db
from app.core.security import decode_access_token
from app.models.boat import Boat
from app.models.user import User, UserRole

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    auth_header: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Extract and validate a JALARI JWT from the Bearer header."""
    token = auth_header.credentials if auth_header and auth_header.credentials else None

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id_str = payload["sub"]
    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed token identity",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated",
        )

    return user


def require_role(*roles: UserRole) -> Callable:
    """Enforce that the authenticated user possesses one of the specified roles."""
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied: required role in {[r.value for r in roles]}, user has {current_user.role.value}",
            )
        return current_user

    return role_checker


def require_family_user(current_user: User = Depends(require_role(UserRole.FAMILY))) -> User:
    return current_user


def require_fisherman_user(current_user: User = Depends(require_role(UserRole.FISHERMAN))) -> User:
    return current_user


def require_operations_user(current_user: User = Depends(require_role(UserRole.OPERATOR, UserRole.ADMIN))) -> User:
    return current_user


def verify_boat_authorization(user: User, boat_identifier: str, db: Session) -> Boat:
    """Verify that the user is authorized to access the requested boat."""
    # Find boat by boatId (e.g. AP-07-FISH-12) or UUID
    boat_query = db.query(Boat).filter(Boat.boatId.ilike(boat_identifier))
    try:
        boat_uuid = uuid.UUID(boat_identifier)
        boat_query = db.query(Boat).filter((Boat.id == boat_uuid) | (Boat.boatId.ilike(boat_identifier)))
    except ValueError:
        pass

    boat = boat_query.first()
    if not boat:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Boat '{boat_identifier}' not found",
        )

    # Check RBAC ownership/link
    is_authorized = any(b.id == boat.id for b in user.boats)
    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: You are not authorized to view boat '{boat.boatId}'",
        )

    return boat
