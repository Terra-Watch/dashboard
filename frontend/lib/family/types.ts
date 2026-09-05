export type BoatSafetyStatus = "SAFE" | "WARNING" | "EMERGENCY";

export type TripState = "AT_PORT" | "ON_TRIP" | "COMPLETED";

export type LocationFreshness = "LIVE" | "RECENT" | "STALE" | "OFFLINE" | "LAST_KNOWN" | "UNAVAILABLE";

export type RescueStatus = 
  | "ACTIVE" 
  | "ACKNOWLEDGED" 
  | "DISPATCHED" 
  | "RESCUED" 
  | "RESOLVED";

export interface BoatLocation {
  latitude: number;
  longitude: number;
  timestamp: string; // ISO 8601
  isLive: boolean;
  speedKnots?: number;
  headingDeg?: number;
  accuracyMeters?: number;
}

export interface FamilyBoat {
  id: string;
  boatId: string; // e.g. "AP-07-FISH-12"
  name: string; // e.g. "Matsya Ratna"
  registrationNumber: string;
  homePort: string; // e.g. "Visakhapatnam Fishing Harbour"
  safetyStatus: BoatSafetyStatus;
  tripState: TripState;
  latestLocation: BoatLocation | null;
  lastSeen: string; // ISO 8601
  activeIncidentId?: string | null;
  connectionStatus: "CONNECTED" | "NO_RECENT_UPDATE" | "OFFLINE";
  captainName?: string;
  crewCount?: number;
}

export interface FamilyUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: "FAMILY" | "OPERATOR" | "ADMIN" | "FISHERMAN";
  assignedBoatIds: string[];
}

export interface Waypoint {
  latitude: number;
  longitude: number;
  timestamp: string;
}

export interface FamilyTrip {
  id: string;
  boatId: string;
  title: string;
  date: string;
  startTime: string;
  endTime?: string | null;
  status: "ACTIVE" | "COMPLETED" | "INTERRUPTED";
  departurePort: string;
  arrivalPort?: string;
  startLocation: { latitude: number; longitude: number; name?: string };
  endLocation?: { latitude: number; longitude: number; name?: string } | null;
  waypoints?: Waypoint[];
  distanceNauticalMiles?: number;
  durationFormatted?: string;
  safetyWarnings?: string[];
  emergencyEvents?: string[];
}

export interface SOSIncident {
  id: string;
  boatId: string;
  boatName: string;
  timestamp: string;
  status: RescueStatus;
  statusLabel: string; // e.g. "Rescue team notified"
  location: BoatLocation;
  details?: string;
  updatedAt: string;
  rescueContact?: string;
  acknowledgedAt?: string;
  dispatchedAt?: string;
  rescuedAt?: string;
  resolvedAt?: string;
}

export interface AuthResponse {
  access_token: string;
  token: string;
  token_type?: string;
  user: FamilyUser;
}

// WebSocket Event Types (Section 19)
export type FamilyWebSocketEvent =
  | {
      type: "boat.location.updated";
      boatId: string;
      latitude: number;
      longitude: number;
      timestamp: string;
      speedKnots?: number;
      headingDeg?: number;
    }
  | {
      type: "boat.status.updated";
      boatId: string;
      status: BoatSafetyStatus;
      tripState?: TripState;
      timestamp: string;
    }
  | {
      type: "boat.warning.created";
      boatId: string;
      warning: string;
      timestamp: string;
    }
  | {
      type: "sos.created";
      incidentId: string;
      boatId: string;
      latitude: number;
      longitude: number;
      timestamp: string;
      status: "ACTIVE";
      details?: string;
    }
  | {
      type: "sos.acknowledged";
      incidentId: string;
      boatId: string;
      timestamp: string;
      status: "ACKNOWLEDGED";
    }
  | {
      type: "sos.dispatched";
      incidentId: string;
      boatId: string;
      timestamp: string;
      status: "DISPATCHED";
    }
  | {
      type: "sos.rescued";
      incidentId: string;
      boatId: string;
      timestamp: string;
      status: "RESCUED";
    }
  | {
      type: "sos.resolved";
      incidentId: string;
      boatId: string;
      timestamp: string;
      status: "RESOLVED";
    }
  | {
      type: "trip.started";
      boatId: string;
      tripId: string;
      startTime: string;
      departurePort: string;
    }
  | {
      type: "trip.completed";
      boatId: string;
      tripId: string;
      endTime: string;
    };
