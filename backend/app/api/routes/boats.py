from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.database import get_db
from app.api.dependencies.auth import require_operations_user
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

