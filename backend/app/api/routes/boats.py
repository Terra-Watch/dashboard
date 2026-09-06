from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies.database import get_db
from app.api.dependencies.auth import operation_boats_for_user, require_admin_user, require_operation_boat, require_operations_user
from app.models.user import User, UserRole, user_boats
from app.models.device import BoatDevice
from app.services.audit import record_audit
from app.schemas.boat import BoatCreate, BoatRegistrationRequest, BoatResponse, BoatUpdate
from app.models.enums import BoatStatus, DataSource
from app.services.boats import BoatService
from app.services.serialization import boat_response


router = APIRouter(prefix="/api/boats", tags=["boats"])
service = BoatService()


@router.post("/register", response_model=BoatResponse, status_code=status.HTTP_201_CREATED)
def register_boat(payload: BoatRegistrationRequest, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> BoatResponse:
    if service.repository.get(db, payload.boatId):
        raise HTTPException(status_code=409, detail="Boat ID is already registered")
    device = None
    if payload.deviceId:
        device = db.query(BoatDevice).filter(BoatDevice.device_id == payload.deviceId, BoatDevice.status == "UNASSOCIATED").first()
        if not device:
            raise HTTPException(status_code=422, detail="Device must be registered and unassociated")
        if payload.nodeId is not None and device.node_id != payload.nodeId:
            raise HTTPException(status_code=422, detail="Boat node ID does not match the selected device")
    node_id = device.node_id if device else payload.nodeId
    now = datetime.now(timezone.utc)
    boat = service.create(db, BoatCreate(boatId=payload.boatId, nodeId=node_id, status=BoatStatus.OFFLINE, sos=False, lastSeen=now, registeredAt=now, dataSource=DataSource.GATEWAY))
    assignments = [(payload.ownerUserId, "OWNER"), (payload.commanderUserId, "COMMANDER"), *[(user_id, "FAMILY_VIEWER") for user_id in payload.familyUserIds]]
    for user_id, relationship in assignments:
        if user_id is None:
            continue
        user = db.query(User).filter(User.id == user_id).first()
        if not user or (relationship == "FAMILY_VIEWER" and user.role != UserRole.FAMILY) or (relationship in {"OWNER", "COMMANDER"} and user.role not in {UserRole.FISHERMAN, UserRole.CREW}):
            db.rollback()
            raise HTTPException(status_code=422, detail=f"Invalid user for {relationship} relationship")
        db.execute(user_boats.insert().values(user_id=user.id, boat_id=boat.id, relationship_type=relationship, assignment_status="ACTIVE", started_at=now, ended_at=None, created_at=now))
    if device:
        device.boat_id = boat.id
        device.status = "ACTIVE"
        device.associated_at = now
        record_audit(db, actor.id, "DEVICE_ASSOCIATED", "DEVICE", str(device.id), {"boatId": boat.boatId})
    record_audit(db, actor.id, "BOAT_REGISTERED", "BOAT", str(boat.id), {"boatId": boat.boatId})
    db.commit()
    db.refresh(boat)
    return boat_response(boat)


@router.get("", response_model=list[BoatResponse])
def list_boats(search: str | None = Query(default=None), actor: User = Depends(require_operations_user), db: Session = Depends(get_db)) -> list[BoatResponse]:
    boats = operation_boats_for_user(actor, db)
    if search:
        boats = [boat for boat in boats if search.lower() in boat.boatId.lower()]
    return [boat_response(boat) for boat in boats]


@router.get("/{boatId}", response_model=BoatResponse)
def get_boat(boatId: str, actor: User = Depends(require_operations_user), db: Session = Depends(get_db)) -> BoatResponse:
    boat = service.get(db, boatId)
    require_operation_boat(actor, boat, db)
    return boat_response(boat)


@router.post("", response_model=BoatResponse, status_code=status.HTTP_201_CREATED)
def create_boat(payload: BoatCreate, _: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> BoatResponse:
    boat = service.create(db, payload)
    db.commit()
    return boat_response(boat)


@router.patch("/{boatId}", response_model=BoatResponse)
def update_boat(boatId: str, payload: BoatUpdate, actor: User = Depends(require_operations_user), db: Session = Depends(get_db)) -> BoatResponse:
    boat = service.get(db, boatId)
    require_operation_boat(actor, boat, db)
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
    require_operation_boat(actor, service.get(db, boatId), db)
    return _set_lifecycle(boatId, "SUSPENDED", actor, db)


@router.post("/{boatId}/restore", response_model=BoatResponse)
def restore_boat(boatId: str, actor: User = Depends(require_operations_user), db: Session = Depends(get_db)) -> BoatResponse:
    require_operation_boat(actor, service.get(db, boatId), db)
    return _set_lifecycle(boatId, "ACTIVE", actor, db)


@router.post("/{boatId}/deactivate", response_model=BoatResponse)
def deactivate_boat(boatId: str, actor: User = Depends(require_operations_user), db: Session = Depends(get_db)) -> BoatResponse:
    require_operation_boat(actor, service.get(db, boatId), db)
    return _set_lifecycle(boatId, "INACTIVE", actor, db)


@router.post("/{boatId}/archive", response_model=BoatResponse)
def archive_boat(boatId: str, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> BoatResponse:
    return _set_lifecycle(boatId, "ARCHIVED", actor, db)
