import {
  AuthResponse,
  BoatLocation,
  FamilyBoat,
  FamilyTrip,
  FamilyUser,
  SOSIncident,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_DEMO_SIMULATOR === "true";
}

// ---------------------------------------------------------------------------
// FamilyDataStore — only used by the demo simulator (SimulationControls).
// In production (DEMO_MODE=false) this is still instantiated but only the
// simulator panel actually calls localStore methods.
// ---------------------------------------------------------------------------
import {
  MOCK_BOATS,
  MOCK_FAMILY_USER,
  MOCK_TRIPS,
  MOCK_ACTIVE_INCIDENT,
} from "./mockData";

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

/** Exported for use by SimulationControls (demo mode only). */
export const localStore = new FamilyDataStore();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getAuthHeaders(token?: string): Record<string, string> {
  const t =
    token ||
    (typeof window !== "undefined" ? localStorage.getItem("jalari_token") : null);
  return {
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
  };
}

async function apiFetch<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    let detail = res.statusText || "Request failed";
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") {
        detail = body.detail;
      } else if (Array.isArray(body?.detail)) {
        detail = body.detail
          .map((d: any) => (typeof d === "string" ? d : d.msg || d.message || "Invalid input"))
          .join("; ");
      } else if (typeof body?.message === "string") {
        detail = body.message;
      } else if (body?.detail) {
        detail = JSON.stringify(body.detail);
      }
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Authentication API
// ---------------------------------------------------------------------------

export async function loginFamily(
  identifier: string,
  password?: string
): Promise<AuthResponse> {
  const email = identifier.trim();
  const resp = await apiFetch<any>(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      identifier,
      password: password || "",
    }),
  });

  const token = resp.access_token || resp.token;
  return {
    access_token: token,
    token: token,
    token_type: resp.token_type || "bearer",
    user: resp.user,
  };
}

export async function requestOTP(
  identifier: string
): Promise<{ message: string; expires_in_seconds?: number | string }> {
  return apiFetch<{ message: string; expires_in_seconds?: number | string }>(
    `${API_BASE_URL}/api/auth/otp/request`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: identifier.trim(), purpose: "LOGIN" }),
    }
  );
}

export async function verifyOTP(
  identifier: string,
  code: string
): Promise<AuthResponse> {
  const resp = await apiFetch<any>(`${API_BASE_URL}/api/auth/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: identifier.trim(), code: code.trim() }),
  });

  const token = resp.access_token || resp.token;
  return {
    access_token: token,
    token: token,
    token_type: resp.token_type || "bearer",
    user: resp.user,
  };
}

export async function fetchCurrentUser(): Promise<FamilyUser | null> {
  try {
    return await apiFetch<FamilyUser>(`${API_BASE_URL}/api/auth/me`, {
      headers: getAuthHeaders(),
    });
  } catch {
    // Token may be expired or backend unreachable; return null so callers
    // can redirect to login rather than silently using stale local data.
    return null;
  }
}

export async function updateCurrentUserProfile(payload: { name?: string; email?: string; phone?: string }): Promise<FamilyUser> {
  return apiFetch<FamilyUser>(`${API_BASE_URL}/api/auth/me`, { method: "PATCH", headers: getAuthHeaders(), body: JSON.stringify(payload) });
}

export async function changeCurrentUserPassword(payload: { current_password: string; new_password: string; confirm_password: string }): Promise<void> {
  await apiFetch<void>(`${API_BASE_URL}/api/auth/change-password`, { method: "POST", headers: getAuthHeaders(), body: JSON.stringify(payload) });
}

export async function logoutFamily(): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
  } catch {
    // Ignore network error on logout — we always clear local state below.
  }
  if (typeof window !== "undefined") {
    localStorage.removeItem("jalari_token");
    localStorage.removeItem("jalari_user");
  }
}

// ---------------------------------------------------------------------------
// Family Boats API
// ---------------------------------------------------------------------------

export async function fetchFamilyBoats(): Promise<FamilyBoat[]> {
  if (isDemoMode()) return localStore.getBoats();
  return apiFetch<FamilyBoat[]>(`${API_BASE_URL}/api/family/boats`, {
    headers: getAuthHeaders(),
    cache: "no-store",
  });
}

export async function fetchFamilyBoatById(
  boatId: string
): Promise<FamilyBoat | null> {
  if (isDemoMode()) return localStore.getBoat(boatId) ?? null;
  return apiFetch<FamilyBoat>(
    `${API_BASE_URL}/api/family/boats/${encodeURIComponent(boatId)}`,
    { headers: getAuthHeaders(), cache: "no-store" }
  );
}

// ---------------------------------------------------------------------------
// Location API
// ---------------------------------------------------------------------------

export async function fetchBoatLocation(
  boatId: string
): Promise<BoatLocation | null> {
  if (isDemoMode()) return localStore.getBoat(boatId)?.latestLocation ?? null;
  return apiFetch<BoatLocation>(
    `${API_BASE_URL}/api/family/boats/${encodeURIComponent(boatId)}/location`,
    { headers: getAuthHeaders(), cache: "no-store" }
  );
}

// ---------------------------------------------------------------------------
// Trips API
// ---------------------------------------------------------------------------

export async function fetchBoatTrips(boatId: string): Promise<FamilyTrip[]> {
  if (isDemoMode()) return localStore.getTrips(boatId);
  return apiFetch<FamilyTrip[]>(
    `${API_BASE_URL}/api/family/boats/${encodeURIComponent(boatId)}/trips`,
    { headers: getAuthHeaders(), cache: "no-store" }
  );
}

export async function fetchTripById(
  boatId: string,
  tripId: string
): Promise<FamilyTrip | null> {
  if (isDemoMode()) return localStore.getTrip(tripId) ?? null;
  return apiFetch<FamilyTrip>(
    `${API_BASE_URL}/api/family/boats/${encodeURIComponent(boatId)}/trips/${encodeURIComponent(tripId)}`,
    { headers: getAuthHeaders(), cache: "no-store" }
  );
}

// ---------------------------------------------------------------------------
// Incidents / SOS API
// ---------------------------------------------------------------------------

export async function fetchBoatIncidents(
  boatId: string
): Promise<SOSIncident[]> {
  if (isDemoMode()) return localStore.getIncidents(boatId);
  return apiFetch<SOSIncident[]>(
    `${API_BASE_URL}/api/family/boats/${encodeURIComponent(boatId)}/incidents`,
    { headers: getAuthHeaders(), cache: "no-store" }
  );
}

export async function fetchIncidentById(
  incidentId: string
): Promise<SOSIncident | null> {
  if (isDemoMode()) return localStore.getIncident(incidentId) ?? null;
  return apiFetch<SOSIncident>(
    `${API_BASE_URL}/api/family/incidents/${encodeURIComponent(incidentId)}`,
    { headers: getAuthHeaders(), cache: "no-store" }
  );
}
