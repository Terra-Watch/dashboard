import uuid
from typing import Callable

import secrets
from fastapi import Depends, Header, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from sqlalchemy import and_, select

from app.api.dependencies.database import get_db
from app.core.config import get_environment, get_gateway_ingestion_key
from app.core.security import decode_access_token
from app.models.boat import Boat
from app.models.user import User, UserRole, user_boats

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    auth_header: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    token_query: str | None = Query(None, alias="token"),
    db: Session = Depends(get_db),
) -> User:
    """Extract and validate JWT token from Bearer header or query parameter."""
    token = None
    if auth_header and auth_header.credentials:
        token = auth_header.credentials
    elif token_query:
        token = token_query

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

    if not user.is_active or user.account_status != "ACTIVE":
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


def require_operations_user(current_user: User = Depends(require_role(UserRole.OPERATOR, UserRole.ADMIN, UserRole.RESCUER))) -> User:
    return current_user


def require_admin_user(current_user: User = Depends(require_role(UserRole.ADMIN))) -> User:
    return current_user


def require_account_manager(current_user: User = Depends(require_role(UserRole.ADMIN, UserRole.OPERATOR))) -> User:
    return current_user


def can_create_role(creator: User, role: UserRole) -> bool:
    if creator.role == UserRole.ADMIN:
        return role in set(UserRole)
    if creator.role == UserRole.OPERATOR:
        return role in {UserRole.FAMILY, UserRole.FISHERMAN, UserRole.CREW}
    return False


def require_gateway_ingestion_key(
    gateway_key: str | None = Header(default=None, alias="X-Gateway-Key"),
) -> None:
    """Authenticate device ingestion when a deployment key is configured.

    Development keeps the existing physical-gateway contract. Production must
    configure JALRI_GATEWAY_INGESTION_KEY rather than exposing a public write.
    """
    expected = get_gateway_ingestion_key()
    if expected is None and get_environment() == "development":
        return
    if expected is None or not gateway_key or not secrets.compare_digest(gateway_key, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Gateway authentication required")


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

    # Only active assignments grant access. Ended assignments remain queryable
    # for audit/history but must not authorize a family request.
    is_authorized = db.scalar(
        select(user_boats.c.user_id).where(
            and_(
                user_boats.c.user_id == user.id,
                user_boats.c.boat_id == boat.id,
                user_boats.c.assignment_status == "ACTIVE",
            )
        )
    ) is not None and boat.lifecycleStatus == "ACTIVE"
    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: You are not authorized to view boat '{boat.boatId}'",
        )

    return boat
