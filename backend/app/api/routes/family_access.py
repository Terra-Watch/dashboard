from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin_user
from app.api.dependencies.database import get_db
from app.models.boat import Boat
from app.models.user import User, UserRole, user_boats
from app.schemas.family_access import FamilyAccessGrant, FamilyMemberResponse
from app.services.audit import record_audit

router = APIRouter(prefix="/api/family-members", tags=["family-access"])


def _rows(db: Session):
    return db.execute(
        select(User, user_boats, Boat)
        .join(user_boats, user_boats.c.user_id == User.id)
        .join(Boat, Boat.id == user_boats.c.boat_id)
        .where(User.role == UserRole.FAMILY)
        .order_by(User.name, Boat.boatId)
    ).all()


def _response(user: User, relation, boat: Boat) -> FamilyMemberResponse:
    return FamilyMemberResponse(userId=user.id, name=user.name, email=user.email, accountStatus=user.account_status, boatId=boat.boatId, accessStatus=relation.assignment_status, startedAt=relation.started_at.isoformat() if relation.started_at else None, endedAt=relation.ended_at.isoformat() if relation.ended_at else None)


@router.get("", response_model=list[FamilyMemberResponse])
def list_family_access(_: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> list[FamilyMemberResponse]:
    return [_response(user, relation, boat) for user, relation, boat in _rows(db) if relation.relationship_type == "FAMILY_VIEWER"]


@router.post("/{user_id}/access", response_model=FamilyMemberResponse, status_code=status.HTTP_201_CREATED)
def grant_family_access(user_id: uuid.UUID, payload: FamilyAccessGrant, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> FamilyMemberResponse:
    user = db.query(User).filter(User.id == user_id, User.role == UserRole.FAMILY).first()
    boat = db.query(Boat).filter(Boat.boatId == payload.boatId).first()
    if not user or not boat:
        raise HTTPException(status_code=404, detail="Family account or boat not found")
    active = db.execute(select(user_boats).where(user_boats.c.user_id == user.id, user_boats.c.boat_id == boat.id, user_boats.c.assignment_status == "ACTIVE")).mappings().first()
    if active:
        raise HTTPException(status_code=409, detail="Family access already exists")
    now = datetime.now(timezone.utc)
    db.execute(user_boats.insert().values(user_id=user.id, boat_id=boat.id, relationship_type="FAMILY_VIEWER", assignment_status="ACTIVE", started_at=now, ended_at=None, created_at=now))
    record_audit(db, actor.id, "FAMILY_ACCESS_GRANTED", "USER", str(user.id), {"boatId": boat.boatId})
    db.commit()
    relation = db.execute(select(user_boats).where(user_boats.c.user_id == user.id, user_boats.c.boat_id == boat.id).order_by(user_boats.c.started_at.desc())).mappings().first()
    return _response(user, relation, boat)


@router.post("/{user_id}/access/{boat_id}/revoke", response_model=FamilyMemberResponse)
def revoke_family_access(user_id: uuid.UUID, boat_id: str, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> FamilyMemberResponse:
    user = db.query(User).filter(User.id == user_id, User.role == UserRole.FAMILY).first()
    boat = db.query(Boat).filter(Boat.boatId == boat_id).first()
    if not user or not boat:
        raise HTTPException(status_code=404, detail="Family account or boat not found")
    now = datetime.now(timezone.utc)
    result = db.execute(user_boats.update().where(user_boats.c.user_id == user.id, user_boats.c.boat_id == boat.id, user_boats.c.relationship_type == "FAMILY_VIEWER", user_boats.c.assignment_status == "ACTIVE").values(assignment_status="ENDED", ended_at=now))
    if result.rowcount != 1:
        raise HTTPException(status_code=404, detail="Family access not found")
    record_audit(db, actor.id, "FAMILY_ACCESS_REVOKED", "USER", str(user.id), {"boatId": boat.boatId})
    db.commit()
    relation = db.execute(select(user_boats).where(user_boats.c.user_id == user.id, user_boats.c.boat_id == boat.id).order_by(user_boats.c.started_at.desc())).mappings().first()
    return _response(user, relation, boat)
