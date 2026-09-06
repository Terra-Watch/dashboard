from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.database import get_db
from app.api.dependencies.auth import require_admin_user, require_operations_user
from app.models.user import User
from app.services.audit import record_audit
from app.schemas.boat import BoatCreate, BoatResponse, BoatUpdate
from app.services.boats import BoatService
from app.services.serialization import boat_response


router = APIRouter(prefix="/api/boats", tags=["boats"])
service = BoatService()


@router.get("", response_model=list[BoatResponse])
def list_boats(search: str | None = Query(default=None), _: object = Depends(require_operations_user), db: Session = Depends(get_db)) -> list[BoatResponse]:
    return [boat_response(boat) for boat in service.list(db, search)]


@router.get("/{boatId}", response_model=BoatResponse)
def get_boat(boatId: str, _: object = Depends(require_operations_user), db: Session = Depends(get_db)) -> BoatResponse:
    return boat_response(service.get(db, boatId))


@router.post("", response_model=BoatResponse, status_code=status.HTTP_201_CREATED)
def create_boat(payload: BoatCreate, _: object = Depends(require_operations_user), db: Session = Depends(get_db)) -> BoatResponse:
    boat = service.create(db, payload)
    db.commit()
    return boat_response(boat)


@router.patch("/{boatId}", response_model=BoatResponse)
def update_boat(boatId: str, payload: BoatUpdate, _: object = Depends(require_operations_user), db: Session = Depends(get_db)) -> BoatResponse:
    boat = service.update(db, boatId, payload)
    db.commit()
    return boat_response(boat)


def _set_lifecycle(boatId: str, lifecycle: str, actor: User, db: Session) -> BoatResponse:
    boat = service.get(db, boatId)
    boat.lifecycleStatus = lifecycle
    record_audit(db, actor.id, f"BOAT_{lifecycle}", "BOAT", str(boat.id), {"boatId": boat.boatId})
    db.commit()
    db.refresh(boat)
    return boat_response(boat)


@router.post("/{boatId}/suspend", response_model=BoatResponse)
def suspend_boat(boatId: str, actor: User = Depends(require_operations_user), db: Session = Depends(get_db)) -> BoatResponse:
    return _set_lifecycle(boatId, "SUSPENDED", actor, db)


@router.post("/{boatId}/restore", response_model=BoatResponse)
def restore_boat(boatId: str, actor: User = Depends(require_operations_user), db: Session = Depends(get_db)) -> BoatResponse:
    return _set_lifecycle(boatId, "ACTIVE", actor, db)


@router.post("/{boatId}/archive", response_model=BoatResponse)
def archive_boat(boatId: str, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> BoatResponse:
    return _set_lifecycle(boatId, "ARCHIVED", actor, db)
