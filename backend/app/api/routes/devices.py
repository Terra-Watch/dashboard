from datetime import datetime, timezone
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_admin_user
from app.api.dependencies.database import get_db
from app.models.boat import Boat
from app.models.device import BoatDevice, DeviceAssociation
from app.models.user import User
from app.schemas.device import DeviceAssociationResponse, DeviceCreate, DeviceResponse, DeviceUpdate
from app.services.audit import record_audit

router = APIRouter(prefix="/api/devices", tags=["devices"])


def _response(device: BoatDevice) -> DeviceResponse:
    return DeviceResponse(id=device.id, deviceId=device.device_id, deviceType=device.device_type, nodeId=device.node_id, status=device.status, boatId=device.boat.boatId if device.boat else None, registeredAt=device.registered_at, associatedAt=device.associated_at, unassociatedAt=device.unassociated_at, lastSeen=device.last_seen)


def _get(db: Session, device_id: uuid.UUID) -> BoatDevice:
    device = db.query(BoatDevice).filter(BoatDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.get("", response_model=list[DeviceResponse])
def list_devices(_: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> list[DeviceResponse]:
    return [_response(device) for device in db.query(BoatDevice).order_by(BoatDevice.registered_at.desc()).all()]


@router.post("", response_model=DeviceResponse, status_code=status.HTTP_201_CREATED)
def register_device(payload: DeviceCreate, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> DeviceResponse:
    if db.query(BoatDevice).filter(BoatDevice.device_id == payload.deviceId.strip()).first():
        raise HTTPException(status_code=409, detail="Device ID is already registered")
    device = BoatDevice(device_id=payload.deviceId.strip(), device_type=payload.deviceType.strip(), node_id=payload.nodeId, status="UNASSOCIATED")
    db.add(device)
    db.flush()
    record_audit(db, actor.id, "DEVICE_REGISTERED", "DEVICE", str(device.id), {"deviceId": device.device_id})
    db.commit()
    db.refresh(device)
    return _response(device)


@router.get("/{device_id}", response_model=DeviceResponse)
def get_device(device_id: uuid.UUID, _: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> DeviceResponse:
    return _response(_get(db, device_id))


@router.get("/{device_id}/history", response_model=list[DeviceAssociationResponse])
def device_history(device_id: uuid.UUID, _: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> list[DeviceAssociationResponse]:
    _get(db, device_id)
    rows = db.query(DeviceAssociation).filter(DeviceAssociation.device_id == device_id).order_by(DeviceAssociation.started_at.desc()).all()
    return [DeviceAssociationResponse(id=row.id, boatId=row.boat.boatId, status=row.status, startedAt=row.started_at, endedAt=row.ended_at) for row in rows]


@router.patch("/{device_id}", response_model=DeviceResponse)
def update_device(device_id: uuid.UUID, payload: DeviceUpdate, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> DeviceResponse:
    device = _get(db, device_id)
    if payload.deviceType is not None:
        device.device_type = payload.deviceType.strip()
    record_audit(db, actor.id, "DEVICE_UPDATED", "DEVICE", str(device.id))
    db.commit()
    db.refresh(device)
    return _response(device)


def _associate(device: BoatDevice, boat: Boat, actor: User, db: Session) -> DeviceResponse:
    if device.status in {"INACTIVE", "RETIRED"}:
        raise HTTPException(status_code=409, detail="Inactive or retired devices cannot be associated")
    if device.node_id is None:
        raise HTTPException(status_code=422, detail="A node ID is required before association")
    conflict = db.query(BoatDevice).filter(BoatDevice.node_id == device.node_id, BoatDevice.status == "ACTIVE", BoatDevice.id != device.id).first()
    if conflict:
        raise HTTPException(status_code=409, detail="Node ID is already associated with another device")
    now = datetime.now(timezone.utc)
    previous = db.query(BoatDevice).filter(BoatDevice.boat_id == boat.id, BoatDevice.status == "ACTIVE", BoatDevice.id != device.id).all()
    for old in previous:
        old.status = "UNASSOCIATED"
        old.unassociated_at = now
        active_history = db.query(DeviceAssociation).filter(DeviceAssociation.device_id == old.id, DeviceAssociation.status == "ACTIVE", DeviceAssociation.ended_at.is_(None)).first()
        if active_history:
            active_history.status = "ENDED"
            active_history.ended_at = now
    boat.nodeId = device.node_id
    device.boat_id = boat.id
    device.status = "ACTIVE"
    device.associated_at = now
    device.unassociated_at = None
    db.add(DeviceAssociation(device_id=device.id, boat_id=boat.id, status="ACTIVE", started_at=now))
    record_audit(db, actor.id, "DEVICE_ASSOCIATED", "DEVICE", str(device.id), {"boatId": boat.boatId})
    db.commit()
    db.refresh(device)
    return _response(device)


@router.post("/{device_id}/associate", response_model=DeviceResponse)
def associate_device(device_id: uuid.UUID, payload: dict[str, str], actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> DeviceResponse:
    boat = db.query(Boat).filter(Boat.boatId == payload.get("boatId")).first()
    if not boat:
        raise HTTPException(status_code=404, detail="Boat not found")
    return _associate(_get(db, device_id), boat, actor, db)


@router.post("/{device_id}/unassociate", response_model=DeviceResponse)
def unassociate_device(device_id: uuid.UUID, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> DeviceResponse:
    device = _get(db, device_id)
    now = datetime.now(timezone.utc)
    if device.boat and device.boat.nodeId == device.node_id:
        device.boat.nodeId = None
    device.boat_id = None
    device.status = "UNASSOCIATED"
    device.unassociated_at = now
    active_history = db.query(DeviceAssociation).filter(DeviceAssociation.device_id == device.id, DeviceAssociation.status == "ACTIVE", DeviceAssociation.ended_at.is_(None)).first()
    if active_history:
        active_history.status = "ENDED"
        active_history.ended_at = now
    record_audit(db, actor.id, "DEVICE_UNASSOCIATED", "DEVICE", str(device.id))
    db.commit()
    db.refresh(device)
    return _response(device)


@router.post("/{device_id}/deactivate", response_model=DeviceResponse)
def deactivate_device(device_id: uuid.UUID, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> DeviceResponse:
    device = _get(db, device_id)
    now = datetime.now(timezone.utc)
    if device.boat and device.boat.nodeId == device.node_id:
        device.boat.nodeId = None
    device.boat_id = None
    device.status = "INACTIVE"
    device.unassociated_at = now
    active_history = db.query(DeviceAssociation).filter(DeviceAssociation.device_id == device.id, DeviceAssociation.status == "ACTIVE", DeviceAssociation.ended_at.is_(None)).first()
    if active_history:
        active_history.status = "ENDED"
        active_history.ended_at = now
    record_audit(db, actor.id, "DEVICE_DEACTIVATED", "DEVICE", str(device.id))
    db.commit()
    db.refresh(device)
    return _response(device)


@router.post("/{device_id}/restore", response_model=DeviceResponse)
def restore_device(device_id: uuid.UUID, actor: User = Depends(require_admin_user), db: Session = Depends(get_db)) -> DeviceResponse:
    device = _get(db, device_id)
    if device.status != "INACTIVE":
        raise HTTPException(status_code=409, detail="Only inactive devices can be restored")
    device.status = "UNASSOCIATED"
    record_audit(db, actor.id, "DEVICE_RESTORED", "DEVICE", str(device.id))
    db.commit()
    db.refresh(device)
    return _response(device)
