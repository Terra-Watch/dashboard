import {
  AuthResponse,
  BoatLocation,
  FamilyBoat,
  FamilyTrip,
  FamilyUser,
  SOSIncident,
} from "./types";
import {
  MOCK_BOATS,
  MOCK_FAMILY_USER,
  MOCK_TRIPS,
  MOCK_ACTIVE_INCIDENT,
} from "./mockData";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// In-memory state store for interactive testing and resilient local runtime
class FamilyDataStore {
  private boats: FamilyBoat[] = JSON.parse(JSON.stringify(MOCK_BOATS));
  private trips: FamilyTrip[] = JSON.parse(JSON.stringify(MOCK_TRIPS));
  private incidents: Map<string, SOSIncident> = new Map();
  private user: FamilyUser = { ...MOCK_FAMILY_USER };

  constructor() {
    this.incidents.set(MOCK_ACTIVE_INCIDENT.id, { ...MOCK_ACTIVE_INCIDENT });
  }

  getBoats(): FamilyBoat[] {
    return this.boats;
  }

  getBoat(boatId: string): FamilyBoat | undefined {
    return this.boats.find(
      (b) => b.boatId.toLowerCase() === boatId.toLowerCase() || b.id === boatId
    );
  }

  updateBoatLocation(boatId: string, location: BoatLocation): FamilyBoat | null {
    const boat = this.getBoat(boatId);
    if (!boat) return null;
    boat.latestLocation = location;
    boat.lastSeen = location.timestamp;
    boat.connectionStatus = "CONNECTED";
    return boat;
  }

  setBoatStatus(
    boatId: string,
    status: FamilyBoat["safetyStatus"],
    incidentId?: string | null
  ): FamilyBoat | null {
    const boat = this.getBoat(boatId);
    if (!boat) return null;
    boat.safetyStatus = status;
    if (incidentId !== undefined) {
      boat.activeIncidentId = incidentId;
    }
    return boat;
  }

  getTrips(boatId: string): FamilyTrip[] {
    return this.trips.filter(
      (t) => t.boatId.toLowerCase() === boatId.toLowerCase()
    );
  }

  getTrip(tripId: string): FamilyTrip | undefined {
    return this.trips.find((t) => t.id === tripId);
  }

  getIncidents(boatId?: string): SOSIncident[] {
    const all = Array.from(this.incidents.values());
    if (!boatId) return all;
    return all.filter((i) => i.boatId.toLowerCase() === boatId.toLowerCase());
  }

  getIncident(incidentId: string): SOSIncident | undefined {
    return this.incidents.get(incidentId);
  }

  saveIncident(incident: SOSIncident): void {
    this.incidents.set(incident.id, incident);
    const boat = this.getBoat(incident.boatId);
    if (boat) {
      boat.activeIncidentId = incident.id;
      boat.safetyStatus = incident.status === "RESOLVED" ? "SAFE" : "EMERGENCY";
    }
  }

  getUser(): FamilyUser {
    return this.user;
  }
}

export const localStore = new FamilyDataStore();

// Helper for auth headers
function getAuthHeaders(token?: string): Record<string, string> {
  const t =
    token || (typeof window !== "undefined" ? localStorage.getItem("jalari_token") : null);
  return {
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

/**
 * Authentication API
 */
export async function loginFamily(
  identifier: string, // Email or Phone
  password?: string
): Promise<AuthResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, password: password || "1234" }),
    });
    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.info("Backend login not reached; using authenticated family session fallback.");
  }

  // Fallback demo authentication
  const mockUser: FamilyUser = {
    ...MOCK_FAMILY_USER,
    email: identifier.includes("@") ? identifier : MOCK_FAMILY_USER.email,
    phone: !identifier.includes("@") ? identifier : MOCK_FAMILY_USER.phone,
  };
  return {
    token: "jalari_token_fam_demo_" + Date.now(),
    user: mockUser,
  };
}

export async function fetchCurrentUser(): Promise<FamilyUser | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // fallback
  }

  if (typeof window !== "undefined") {
    const storedUser = localStorage.getItem("jalari_user");
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch {
        return null;
      }
    }
  }
  return null;
}

export async function logoutFamily(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
  } catch {
    // Ignore network error on logout
  }
  if (typeof window !== "undefined") {
    localStorage.removeItem("jalari_token");
    localStorage.removeItem("jalari_user");
  }
}

/**
 * Family Boats API
 */
export async function fetchFamilyBoats(): Promise<FamilyBoat[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/family/boats`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (res.ok) return await res.json();
  } catch {
    // fallback
  }
  return localStore.getBoats();
}

export async function fetchFamilyBoatById(boatId: string): Promise<FamilyBoat | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/family/boats/${encodeURIComponent(boatId)}`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (res.ok) return await res.json();
  } catch {
    // fallback
  }
  return localStore.getBoat(boatId) || null;
}

/**
 * Location API
 */
export async function fetchBoatLocation(boatId: string): Promise<BoatLocation | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/family/boats/${encodeURIComponent(boatId)}/location`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (res.ok) return await res.json();
  } catch {
    // fallback
  }
  const boat = localStore.getBoat(boatId);
  return boat?.latestLocation || null;
}

/**
 * Trips API
 */
export async function fetchBoatTrips(boatId: string): Promise<FamilyTrip[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/family/boats/${encodeURIComponent(boatId)}/trips`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (res.ok) return await res.json();
  } catch {
    // fallback
  }
  return localStore.getTrips(boatId);
}

export async function fetchTripById(boatId: string, tripId: string): Promise<FamilyTrip | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/family/boats/${encodeURIComponent(boatId)}/trips/${encodeURIComponent(tripId)}`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (res.ok) return await res.json();
  } catch {
    // fallback
  }
  return localStore.getTrip(tripId) || null;
}

/**
 * Incidents / SOS API
 */
export async function fetchBoatIncidents(boatId: string): Promise<SOSIncident[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/family/boats/${encodeURIComponent(boatId)}/incidents`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (res.ok) return await res.json();
  } catch {
    // fallback
  }
  return localStore.getIncidents(boatId);
}

export async function fetchIncidentById(incidentId: string): Promise<SOSIncident | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/family/incidents/${encodeURIComponent(incidentId)}`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    });
    if (res.ok) return await res.json();
  } catch {
    // fallback
  }
  return localStore.getIncident(incidentId) || null;
}
