import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import can_create_role, require_account_manager, require_admin_user
from app.api.dependencies.database import get_db
from app.core.security import hash_password
from app.models.boat import Boat
from app.models.user import User, UserRole, user_boats
from app.models.security import AuditLog
from app.schemas.auth import AdminUserResponse, UserAdminUpdateRequest, UserCreateRequest
from app.services.audit import record_audit

router = APIRouter(prefix="/api/users", tags=["users"])


def _response(user: User, db: Session) -> AdminUserResponse:
    active_boat_ids = db.execute(
        select(Boat.boatId).join(user_boats, user_boats.c.boat_id == Boat.id).where(
            user_boats.c.user_id == user.id,
            user_boats.c.assignment_status == "ACTIVE",
        )
    ).scalars().all()
    return AdminUserResponse(
        id=user.id, email=user.email, name=user.name, phone=user.phone,
        role=user.role, authorizedBoatIds=active_boat_ids,
        is_active=user.is_active, account_status=user.account_status,
    )


def _assign_boats(user: User, boat_ids: list[str], db: Session) -> None:
    boats = []
    for identifier in boat_ids:
        boat = db.query(Boat).filter(Boat.boatId.ilike(identifier)).first()
        if not boat:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Boat '{identifier}' not found")
        boats.append(boat)
    requested_ids = {boat.id for boat in boats}
    now = datetime.now(timezone.utc)
    if requested_ids:
        db.execute(user_boats.update().where(user_boats.c.user_id == user.id, user_boats.c.assignment_status == "ACTIVE", ~user_boats.c.boat_id.in_(requested_ids)).values(assignment_status="ENDED", ended_at=now))
    else:
        db.execute(user_boats.update().where(user_boats.c.user_id == user.id, user_boats.c.assignment_status == "ACTIVE").values(assignment_status="ENDED", ended_at=now))
    relationship = "FAMILY_VIEWER" if user.role == UserRole.FAMILY else "CREW"
    for boat in boats:
        active = db.execute(select(user_boats.c.id).where(user_boats.c.user_id == user.id, user_boats.c.boat_id == boat.id, user_boats.c.assignment_status == "ACTIVE")).first()
        if not active:
            db.execute(user_boats.insert().values(user_id=user.id, boat_id=boat.id, relationship_type=relationship, assignment_status="ACTIVE", started_at=now, ended_at=None, created_at=now))


@router.get("", response_model=list[AdminUserResponse])
def list_users(_: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> list[AdminUserResponse]:
    return [_response(user, db) for user in db.query(User).order_by(User.created_at.desc()).all()]


@router.get("/audit", dependencies=[Depends(require_admin_user)])
def list_audit_logs(db: Session = Depends(get_db)) -> list[dict[str, object]]:
    return [{"id": str(item.id), "actorId": str(item.actor_id) if item.actor_id else None, "action": item.action, "targetType": item.target_type, "targetId": item.target_id, "details": item.details, "createdAt": item.created_at.isoformat()} for item in db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(200).all()]


@router.post("", response_model=AdminUserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    creator: User = Depends(require_account_manager),
    db: Session = Depends(get_db),
) -> AdminUserResponse:
    if not can_create_role(creator, payload.role):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not allowed to create this role")
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")
    user = User(email=payload.email, name=payload.name.strip(), phone=payload.phone, hashed_password=hash_password(payload.password), role=payload.role)
    db.add(user)
    db.flush()
    if payload.assignedBoatIds:
        if payload.role not in {UserRole.FAMILY, UserRole.FISHERMAN, UserRole.CREW}:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Boat assignments are only valid for vessel-linked roles")
        _assign_boats(user, payload.assignedBoatIds, db)
    record_audit(db, creator.id, "USER_CREATED", "USER", str(user.id), {"role": user.role.value})
    db.commit()
    db.refresh(user)
    return _response(user, db)


def _set_account_status(user_id: uuid.UUID, lifecycle: str, actor: User, db: Session) -> AdminUserResponse:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if lifecycle == "ACTIVE" and user.account_status != "SUSPENDED":
        raise HTTPException(status_code=409, detail="Only suspended accounts can be restored; archived accounts are not directly restorable")
    user.account_status = lifecycle
    user.is_active = lifecycle == "ACTIVE"
    record_audit(db, actor.id, f"USER_{lifecycle}", "USER", str(user.id), {"status": lifecycle})
    db.commit()
    db.refresh(user)
    return _response(user, db)


@router.post("/{user_id}/suspend", response_model=AdminUserResponse)
def suspend_user(user_id: uuid.UUID, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> AdminUserResponse:
    return _set_account_status(user_id, "SUSPENDED", actor, db)


@router.post("/{user_id}/restore", response_model=AdminUserResponse)
def restore_user(user_id: uuid.UUID, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> AdminUserResponse:
    return _set_account_status(user_id, "ACTIVE", actor, db)


@router.post("/{user_id}/archive", response_model=AdminUserResponse)
def archive_user(user_id: uuid.UUID, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> AdminUserResponse:
    return _set_account_status(user_id, "ARCHIVED", actor, db)


@router.patch("/{user_id}", response_model=AdminUserResponse)
def update_user(
    user_id: uuid.UUID,
    payload: UserAdminUpdateRequest,
    _: User = Depends(require_admin_user),
    db: Session = Depends(get_db),
) -> AdminUserResponse:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if payload.email is not None:
        user.email = payload.email.strip().lower()
    if payload.name is not None:
        user.name = payload.name.strip()
    if payload.phone is not None:
        user.phone = payload.phone
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.assignedBoatIds is not None:
        _assign_boats(user, payload.assignedBoatIds, db)
    record_audit(db, _.id, "USER_UPDATED", "USER", str(user.id), {"role": user.role.value, "is_active": user.is_active})
    db.commit()
    db.refresh(user)
    return _response(user, db)
