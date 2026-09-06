from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_account_manager
from app.api.dependencies.database import get_db
from app.models.boat import Boat
from app.models.user import User, UserRole, user_boats
from app.schemas.assignments import AssignmentCreate, AssignmentResponse, AssignmentUpdate, RELATIONSHIP_TYPES
from app.services.audit import record_audit

router = APIRouter(prefix="/api/boats", tags=["assignments"])


def _boat(db: Session, boat_id: str) -> Boat:
    boat = db.query(Boat).filter(Boat.boatId == boat_id).first()
    if not boat:
        raise HTTPException(status_code=404, detail="Boat not found")
    return boat


def _row_response(row, boat: Boat) -> AssignmentResponse:
    return AssignmentResponse(userId=row.user_id, boatId=boat.boatId, relationshipType=row.relationship_type, status=row.assignment_status, startedAt=row.started_at, endedAt=row.ended_at)


@router.get("/{boat_id}/assignments", response_model=list[AssignmentResponse])
def list_assignments(boat_id: str, _: User = Depends(require_account_manager), db: Session = Depends(get_db)) -> list[AssignmentResponse]:
    boat = _boat(db, boat_id)
    rows = db.execute(select(user_boats).where(user_boats.c.boat_id == boat.id).order_by(user_boats.c.created_at)).mappings().all()
    return [_row_response(row, boat) for row in rows]


@router.post("/{boat_id}/assignments", response_model=AssignmentResponse, status_code=status.HTTP_201_CREATED)
def create_assignment(boat_id: str, payload: AssignmentCreate, actor: User = Depends(require_account_manager), db: Session = Depends(get_db)) -> AssignmentResponse:
    boat = _boat(db, boat_id)
    if payload.relationshipType not in RELATIONSHIP_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported relationship type")
    user = db.query(User).filter(User.id == payload.userId).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    existing = db.execute(select(user_boats).where(user_boats.c.user_id == user.id, user_boats.c.boat_id == boat.id)).mappings().first()
    if existing and existing["assignment_status"] == "ACTIVE":
        raise HTTPException(status_code=409, detail="An active assignment already exists")
    if existing:
        db.execute(user_boats.delete().where(user_boats.c.user_id == user.id, user_boats.c.boat_id == boat.id))
    now = datetime.now(timezone.utc)
    db.execute(user_boats.insert().values(user_id=user.id, boat_id=boat.id, relationship_type=payload.relationshipType, assignment_status="ACTIVE", started_at=now, ended_at=None, created_at=now))
    record_audit(db, actor.id, "ASSIGNMENT_CREATED", "BOAT", str(boat.id), {"userId": str(user.id), "relationshipType": payload.relationshipType})
    db.commit()
    row = db.execute(select(user_boats).where(user_boats.c.user_id == user.id, user_boats.c.boat_id == boat.id)).mappings().one()
    return _row_response(row, boat)


@router.patch("/{boat_id}/assignments/{user_id}", response_model=AssignmentResponse)
def update_assignment(boat_id: str, user_id: uuid.UUID, payload: AssignmentUpdate, actor: User = Depends(require_account_manager), db: Session = Depends(get_db)) -> AssignmentResponse:
    boat = _boat(db, boat_id)
    values = payload.model_dump(exclude_unset=True)
    if values.get("relationshipType") is not None and values["relationshipType"] not in RELATIONSHIP_TYPES:
        raise HTTPException(status_code=422, detail="Unsupported relationship type")
    if values.get("status") is not None and values["status"] not in {"ACTIVE", "ENDED"}:
        raise HTTPException(status_code=422, detail="Assignment status must be ACTIVE or ENDED")
    if values.get("status") == "ENDED":
        values["assignment_status"] = "ENDED"
        values["ended_at"] = datetime.now(timezone.utc)
        values.pop("status", None)
    elif values.get("status") == "ACTIVE":
        values["assignment_status"] = "ACTIVE"
        values["ended_at"] = None
        values.pop("status", None)
    if "relationshipType" in values:
        values["relationship_type"] = values.pop("relationshipType")
    if not values:
        raise HTTPException(status_code=422, detail="No assignment changes supplied")
    result = db.execute(user_boats.update().where(user_boats.c.user_id == user_id, user_boats.c.boat_id == boat.id).values(**values))
    if result.rowcount != 1:
        raise HTTPException(status_code=404, detail="Assignment not found")
    record_audit(db, actor.id, "ASSIGNMENT_UPDATED", "BOAT", str(boat.id), {"userId": str(user_id), "changes": values})
    db.commit()
    row = db.execute(select(user_boats).where(user_boats.c.user_id == user_id, user_boats.c.boat_id == boat.id)).mappings().one()
    return _row_response(row, boat)


@router.post("/{boat_id}/assignments/{user_id}/end", response_model=AssignmentResponse)
def end_assignment(boat_id: str, user_id: uuid.UUID, actor: User = Depends(require_account_manager), db: Session = Depends(get_db)) -> AssignmentResponse:
    return update_assignment(boat_id, user_id, AssignmentUpdate(status="ENDED"), actor, db)
