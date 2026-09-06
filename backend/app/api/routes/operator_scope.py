from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin_user
from app.api.dependencies.database import get_db
from app.models.boat import Boat
from app.models.user import User, UserRole, operator_boat_access
from app.services.audit import record_audit

router = APIRouter(prefix="/api/operators", tags=["operator-scope"])


def _operator(db: Session, user_id: uuid.UUID) -> User:
    user = db.query(User).filter(User.id == user_id, User.role == UserRole.OPERATOR).first()
    if not user:
        raise HTTPException(status_code=404, detail="Operator not found")
    return user


def _result(row, boat: Boat) -> dict[str, object]:
    return {"id": str(row.id), "boatId": boat.boatId, "status": row.status, "startedAt": row.started_at.isoformat(), "endedAt": row.ended_at.isoformat() if row.ended_at else None}


@router.get("/{user_id}/boats")
def list_operator_scope(user_id: uuid.UUID, _: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> list[dict[str, object]]:
    operator = _operator(db, user_id)
    rows = db.execute(select(operator_boat_access).where(operator_boat_access.c.user_id == operator.id).order_by(operator_boat_access.c.started_at)).mappings().all()
    boats = {boat.id: boat for boat in db.query(Boat).all()}
    return [_result(row, boats[row.boat_id]) for row in rows if row.boat_id in boats]


@router.post("/{user_id}/boats", status_code=status.HTTP_201_CREATED)
def grant_operator_scope(user_id: uuid.UUID, payload: dict[str, str], actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> dict[str, object]:
    operator = _operator(db, user_id)
    boat = db.query(Boat).filter(Boat.boatId == payload.get("boatId")).first()
    if not boat:
        raise HTTPException(status_code=404, detail="Boat not found")
    active = db.execute(select(operator_boat_access).where(operator_boat_access.c.user_id == operator.id, operator_boat_access.c.boat_id == boat.id, operator_boat_access.c.status == "ACTIVE")).mappings().first()
    if active:
        raise HTTPException(status_code=409, detail="Operator already has access to this boat")
    now = datetime.now(timezone.utc)
    db.execute(operator_boat_access.insert().values(user_id=operator.id, boat_id=boat.id, status="ACTIVE", started_at=now, ended_at=None, created_at=now))
    record_audit(db, actor.id, "OPERATOR_SCOPE_GRANTED", "USER", str(operator.id), {"boatId": boat.boatId})
    db.commit()
    row = db.execute(select(operator_boat_access).where(operator_boat_access.c.user_id == operator.id, operator_boat_access.c.boat_id == boat.id, operator_boat_access.c.status == "ACTIVE")).mappings().one()
    return _result(row, boat)


@router.post("/{user_id}/boats/{boat_id}/revoke")
def revoke_operator_scope(user_id: uuid.UUID, boat_id: str, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> dict[str, object]:
    operator = _operator(db, user_id)
    boat = db.query(Boat).filter(Boat.boatId == boat_id).first()
    if not boat:
        raise HTTPException(status_code=404, detail="Boat not found")
    now = datetime.now(timezone.utc)
    result = db.execute(operator_boat_access.update().where(operator_boat_access.c.user_id == operator.id, operator_boat_access.c.boat_id == boat.id, operator_boat_access.c.status == "ACTIVE").values(status="ENDED", ended_at=now))
    if result.rowcount != 1:
        raise HTTPException(status_code=404, detail="Operator scope not found")
    record_audit(db, actor.id, "OPERATOR_SCOPE_REVOKED", "USER", str(operator.id), {"boatId": boat.boatId})
    db.commit()
    return {"status": "ENDED", "boatId": boat.boatId}
