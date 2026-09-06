from typing import Any
from pydantic import BaseModel


class FamilyBoatLocation(BaseModel):
    latitude: float
    longitude: float
    timestamp: str
    isLive: bool
    speedKnots: float | None = None
    headingDeg: float | None = None


class FamilyBoatResponse(BaseModel):
    id: str
    boatId: str
    name: str
    safetyStatus: str  # SAFE, WARNING, EMERGENCY
    tripState: str  # ON_TRIP, AT_PORT, COMPLETED
    connectionStatus: str  # CONNECTED, DISCONNECTED, DEGRADED
    latestLocation: FamilyBoatLocation | None = None
    lastSeen: str | None = None
    activeIncidentId: str | None = None
    assignedFamilyUserIds: list[str] = []


class FamilyTripResponse(BaseModel):
    id: str
    boatId: str
    title: str
    departurePort: str
    arrivalPort: str | None = None
    startTime: str
    endTime: str | None = None
    status: str  # ACTIVE, COMPLETED, INTERRUPTED
    distanceNauticalMiles: float | None = None
    waypoints: list[dict[str, Any]] | None = None
    safetyWarnings: list[str] | None = None


class FamilyIncidentResponse(BaseModel):
    id: str
    boatId: str
    boatName: str
    timestamp: str
    status: str  # ACTIVE, ACKNOWLEDGED, DISPATCHED, RESCUED, RESOLVED
    statusLabel: str
    location: FamilyBoatLocation | None = None
    details: str | None = None
    updatedAt: str | None = None
