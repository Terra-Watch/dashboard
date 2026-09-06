export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jalari_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface Boat {
  id: string;
  boatId: string;
  nodeId: number;
  status: "ONLINE" | "OFFLINE";
  sos: boolean;
  battery?: number | null;
  location?: {
    latitude: number;
    longitude: number;
    altitude?: number | null;
  } | null;
  rssi?: number | null;
  snr?: string | number | null;
  rttMs?: number | null;
  heartbeatCount: number;
  lastSeen: string;
  registeredAt: string;
  dataSource: string;
}

export interface HistoricalEvent {
  id: string;
  eventType: string;
  boat_id?: string | null;
  gateway_id?: string | null;
  timestamp: string;
  details?: {
    eventType?: string;
    nodeId?: number;
    packetId?: number;
    destination?: number;
    sequence?: number;
    packetSize?: number;
    rssi?: number;
    snr?: string | number;
    receivedAtMs?: number;
  } | null;
}

export interface Alert {
  id: string;
  alertId: string;
  boat_id?: string | null;
  type: "SOS" | "SYSTEM" | "COMMUNICATION";
  severity: "CRITICAL" | "WARNING" | "INFO";
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
  message: string;
  location?: {
    latitude: number;
    longitude: number;
  } | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface TelemetryRecord {
  id: string;
  boat_id: string;
  battery?: number | null;
  location?: {
    latitude: number;
    longitude: number;
  } | null;
  rssi?: number | null;
  snr?: string | number | null;
  rttMs?: number | null;
  heartbeatCount: number;
  timestamp: string;
}

export interface SystemStatusResponse {
  components: Array<{
    component: string;
    status: "ONLINE" | "OFFLINE" | "DEGRADED" | "UNKNOWN";
  }>;
}

export interface Gateway {
  id: string;
  gatewayId: string;
  status: "ONLINE" | "OFFLINE";
  lastSeen: string;
  firmware?: string | null;
  registeredAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: "FAMILY" | "FISHERMAN" | "OPERATOR" | "ADMIN" | "CREW" | "RESCUER";
  is_active: boolean;
  authorizedBoatIds: string[];
}

async function apiRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers: { "Content-Type": "application/json", ...authHeaders(), ...(options?.headers || {}) } });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail || "Request failed");
  return response.status === 204 ? (undefined as T) : response.json();
}

export function fetchUsers(): Promise<AdminUser[]> { return apiRequest<AdminUser[]>("/api/users", { cache: "no-store" }); }
export function createUser(payload: { email: string; name: string; phone?: string; password: string; role: AdminUser["role"]; assignedBoatIds: string[] }): Promise<AdminUser> { return apiRequest<AdminUser>("/api/users", { method: "POST", body: JSON.stringify(payload) }); }
export function updateUser(id: string, payload: Partial<Pick<AdminUser, "name" | "email" | "phone" | "role" | "is_active" | "authorizedBoatIds">>): Promise<AdminUser> { return apiRequest<AdminUser>(`/api/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ ...payload, assignedBoatIds: payload.authorizedBoatIds }) }); }

export async function fetchGateways(): Promise<Gateway[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/gateways`, { cache: "no-store", headers: authHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchBoats(): Promise<Boat[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/boats`, { cache: "no-store", headers: authHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchAlerts(): Promise<Alert[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/alerts`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchTelemetry(boatId?: string): Promise<TelemetryRecord[]> {
  try {
    const url = new URL(`${API_BASE_URL}/api/telemetry`);
    if (boatId) url.searchParams.set("boatId", boatId);
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchHistory(): Promise<HistoricalEvent[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/history`, { cache: "no-store", headers: authHeaders() });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchSystemStatus(): Promise<SystemStatusResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/system-status`, { cache: "no-store", headers: authHeaders() });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
