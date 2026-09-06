import asyncio
from datetime import datetime, timezone
import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import get_current_user, require_family_user, verify_boat_authorization
from app.api.dependencies.database import get_db
from app.core.security import decode_access_token
from app.models.alert import Alert
from app.models.boat import Boat
from app.models.trip import Trip
from app.models.user import User, UserRole
from app.models.user import user_boats
from app.schemas.family import (
    FamilyBoatLocation,
    FamilyBoatResponse,
    FamilyIncidentResponse,
    FamilyTripResponse,
)

logger = logging.getLogger("jalri.family")
router = APIRouter(prefix="/api/family", tags=["family"])


def _map_boat_to_family_response(boat: Boat, current_user: User, db: Session) -> FamilyBoatResponse:
    # Compute safety status: if active SOS or CRITICAL alert -> EMERGENCY, else WARNING if alerts -> SAFE
    active_alert = (
        db.query(Alert)
        .filter(Alert.boat_id == boat.id, Alert.status != "RESOLVED")
        .order_by(Alert.createdAt.desc())
        .first()
    )

    safety_status = "SAFE"
    active_incident_id = None
    if boat.sos or (active_alert and active_alert.type.value == "SOS"):
        safety_status = "EMERGENCY"
        active_incident_id = str(active_alert.id) if active_alert else None
    elif active_alert and active_alert.severity.value in ["CRITICAL", "WARNING"]:
        safety_status = "WARNING"
        active_incident_id = str(active_alert.id)

    # Location freshness
    location = None
    if boat.latitude is not None and boat.longitude is not None:
        last_seen_dt = boat.lastSeen
        if last_seen_dt and last_seen_dt.tzinfo is None:
            last_seen_dt = last_seen_dt.replace(tzinfo=timezone.utc)
        diff_sec = (datetime.now(timezone.utc) - last_seen_dt).total_seconds() if last_seen_dt else 9999
        is_live = diff_sec <= 120 and boat.status.value == "ONLINE"
        location = FamilyBoatLocation(
            latitude=float(boat.latitude),
            longitude=float(boat.longitude),
            timestamp=last_seen_dt.isoformat() if last_seen_dt else datetime.now(timezone.utc).isoformat(),
            isLive=is_live,
            speedKnots=None,
            headingDeg=None,
        )

    trip_state = "ON_TRIP" if boat.status.value == "ONLINE" else "AT_PORT"
    connection_status = "CONNECTED" if boat.status.value == "ONLINE" else "OFFLINE"

    return FamilyBoatResponse(
        id=str(boat.id),
        boatId=boat.boatId,
        name=boat.boatId,
        safetyStatus=safety_status,
        tripState=trip_state,
        connectionStatus=connection_status,
        latestLocation=location,
        lastSeen=boat.lastSeen.isoformat() if boat.lastSeen else None,
        activeIncidentId=active_incident_id,
        assignedFamilyUserIds=[str(current_user.id)],
    )


@router.get("/boats", response_model=list[FamilyBoatResponse])
def get_family_boats(
    user: User = Depends(require_family_user),
    db: Session = Depends(get_db),
) -> list[FamilyBoatResponse]:
    """Retrieve only the vessels explicitly assigned to the authenticated family account."""
    boats = (
        db.query(Boat)
        .join(user_boats, user_boats.c.boat_id == Boat.id)
        .filter(user_boats.c.user_id == user.id, user_boats.c.assignment_status == "ACTIVE", Boat.lifecycleStatus == "ACTIVE")
        .all()
    )
    return [_map_boat_to_family_response(boat, user, db) for boat in boats]


@router.get("/boats/{boat_id}", response_model=FamilyBoatResponse)
def get_family_boat(
    boat_id: str,
    user: User = Depends(require_family_user),
    db: Session = Depends(get_db),
) -> FamilyBoatResponse:
    """Retrieve details for an authorized vessel. Returns 403 if user is not linked."""
    boat = verify_boat_authorization(user, boat_id, db)
    return _map_boat_to_family_response(boat, user, db)


@router.get("/boats/{boat_id}/location", response_model=FamilyBoatLocation | None)
def get_family_boat_location(
    boat_id: str,
    user: User = Depends(require_family_user),
    db: Session = Depends(get_db),
) -> FamilyBoatLocation | None:
    """Retrieve current or last-known GPS location for an authorized vessel."""
    boat = verify_boat_authorization(user, boat_id, db)
    if boat.latitude is None or boat.longitude is None:
        return None

    last_seen_dt = boat.lastSeen
    if last_seen_dt and last_seen_dt.tzinfo is None:
        last_seen_dt = last_seen_dt.replace(tzinfo=timezone.utc)
    diff_sec = (datetime.now(timezone.utc) - last_seen_dt).total_seconds() if last_seen_dt else 9999
    is_live = diff_sec <= 120 and boat.status.value == "ONLINE"

    return FamilyBoatLocation(
        latitude=float(boat.latitude),
        longitude=float(boat.longitude),
        timestamp=last_seen_dt.isoformat() if last_seen_dt else datetime.now(timezone.utc).isoformat(),
        isLive=is_live,
        speedKnots=None,
        headingDeg=None,
    )


@router.get("/boats/{boat_id}/trips", response_model=list[FamilyTripResponse])
def get_family_boat_trips(
    boat_id: str,
    user: User = Depends(require_family_user),
    db: Session = Depends(get_db),
) -> list[FamilyTripResponse]:
    """Retrieve logged historical voyages for an authorized vessel."""
    boat = verify_boat_authorization(user, boat_id, db)
    trips = db.query(Trip).filter(Trip.boat_id == boat.id).order_by(Trip.start_time.desc()).all()

    return [
        FamilyTripResponse(
            id=str(t.id),
            boatId=boat.boatId,
            title=t.title,
            departurePort=t.departure_port,
            arrivalPort=t.arrival_port,
            startTime=t.start_time.strftime("%I:%M %p"),
            endTime=t.end_time.strftime("%I:%M %p") if t.end_time else None,
            status=t.status.value,
            distanceNauticalMiles=float(t.distance_nautical_miles) if t.distance_nautical_miles else None,
            waypoints=t.waypoints,
            safetyWarnings=t.safety_warnings,
        )
        for t in trips
    ]


@router.get("/boats/{boat_id}/trips/{trip_id}", response_model=FamilyTripResponse)
def get_family_boat_trip(
    boat_id: str,
    trip_id: str,
    user: User = Depends(require_family_user),
    db: Session = Depends(get_db),
) -> FamilyTripResponse:
    """Retrieve detailed trip overview for an authorized vessel."""
    boat = verify_boat_authorization(user, boat_id, db)
    try:
        t_uuid = uuid.UUID(trip_id)
        trip = db.query(Trip).filter(Trip.id == t_uuid, Trip.boat_id == boat.id).first()
    except ValueError:
        trip = None

    if not trip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip record not found")

    return FamilyTripResponse(
        id=str(trip.id),
        boatId=boat.boatId,
        title=trip.title,
        departurePort=trip.departure_port,
        arrivalPort=trip.arrival_port,
        startTime=trip.start_time.strftime("%I:%M %p"),
        endTime=trip.end_time.strftime("%I:%M %p") if trip.end_time else None,
        status=trip.status.value,
        distanceNauticalMiles=float(trip.distance_nautical_miles) if trip.distance_nautical_miles else None,
        waypoints=trip.waypoints,
        safetyWarnings=trip.safety_warnings,
    )


@router.get("/boats/{boat_id}/incidents", response_model=list[FamilyIncidentResponse])
def get_family_boat_incidents(
    boat_id: str,
    user: User = Depends(require_family_user),
    db: Session = Depends(get_db),
) -> list[FamilyIncidentResponse]:
    """Retrieve distress and warning alerts for an authorized vessel."""
    boat = verify_boat_authorization(user, boat_id, db)
    alerts = db.query(Alert).filter(Alert.boat_id == boat.id).order_by(Alert.createdAt.desc()).all()

    return [
        FamilyIncidentResponse(
            id=str(a.id),
            boatId=boat.boatId,
            boatName=boat.boatId,
            timestamp=a.createdAt.isoformat(),
            status=a.status.value,
            statusLabel="Emergency reported" if a.status.value == "ACTIVE" else "Rescue team notified",
            location=FamilyBoatLocation(latitude=float(a.latitude), longitude=float(a.longitude), timestamp=a.createdAt.isoformat(), isLive=False) if a.latitude is not None and a.longitude is not None else None,
            details=a.message,
            updatedAt=a.createdAt.isoformat(),
        )
        for a in alerts
    ]


@router.get("/incidents/{incident_id}", response_model=FamilyIncidentResponse)
def get_family_incident(
    incident_id: str,
    user: User = Depends(require_family_user),
    db: Session = Depends(get_db),
) -> FamilyIncidentResponse:
    """Retrieve full incident and rescue status for an authorized vessel."""
    try:
        inc_uuid = uuid.UUID(incident_id)
        alert = db.query(Alert).filter(Alert.id == inc_uuid).first()
    except ValueError:
        alert = None

    if not alert or not alert.boat_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found")

    boat = db.query(Boat).filter(Boat.id == alert.boat_id).first()
    if not boat or not db.query(user_boats).filter(user_boats.c.user_id == user.id, user_boats.c.boat_id == boat.id, user_boats.c.assignment_status == "ACTIVE").first():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You are not authorized to view this emergency incident",
        )

    return FamilyIncidentResponse(
        id=str(alert.id),
        boatId=boat.boatId,
        boatName=boat.boatId,
        timestamp=alert.createdAt.isoformat(),
        status=alert.status.value,
        statusLabel="Emergency reported" if alert.status.value == "ACTIVE" else "Rescue team notified",
        location=FamilyBoatLocation(latitude=float(alert.latitude), longitude=float(alert.longitude), timestamp=alert.createdAt.isoformat(), isLive=False) if alert.latitude is not None and alert.longitude is not None else None,
        details=alert.message,
        updatedAt=alert.createdAt.isoformat(),
    )


# In-memory registry of active authenticated family websocket connections
active_family_sockets: set[tuple[WebSocket, set[str]]] = set()


@router.websocket("/ws")
async def family_websocket_stream(websocket: WebSocket, token: str = Query(...), db: Session = Depends(get_db)) -> None:
    """Authenticated WebSocket stream restricted to authorized family vessels."""
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        user_uuid = uuid.UUID(payload["sub"])
        user = db.query(User).filter(User.id == user_uuid).first()
    except Exception:
        user = None

    if not user or user.role != UserRole.FAMILY or not user.is_active:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # Authorized boat set
    authorized_boat_ids = frozenset(
        boat.boatId.lower()
        for boat in db.query(Boat).join(user_boats, user_boats.c.boat_id == Boat.id).filter(
            user_boats.c.user_id == user.id,
            user_boats.c.assignment_status == "ACTIVE",
            Boat.lifecycleStatus == "ACTIVE",
        ).all()
    )
    await websocket.accept()
    conn_info = (websocket, authorized_boat_ids)
    active_family_sockets.add(conn_info)

    try:
        await websocket.send_text(
            json.dumps({
                "type": "connection.acknowledged",
                "message": f"Connected to secure family stream for {len(authorized_boat_ids)} authorized vessel(s)",
                "authorized_boats": list(authorized_boat_ids),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
        )

        while True:
            # Keep-alive heartbeat & ping listener
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("action") == "ping":
                await websocket.send_text(json.dumps({"action": "pong", "timestamp": datetime.now(timezone.utc).isoformat()}))
    except (WebSocketDisconnect, Exception):
        pass
    finally:
        active_family_sockets.discard(conn_info)
