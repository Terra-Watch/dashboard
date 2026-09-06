export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

function authHeaders(): Record<string, string> {
  const token = typeof window !== "undefined" ? localStorage.getItem("jalari_token") : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface Boat {
  id: string;
  boatId: string;
  nodeId: number | null;
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
  lifecycleStatus?: "ACTIVE" | "SUSPENDED" | "INACTIVE" | "ARCHIVED";
}

export interface BoatAssignment {
  userId: string;
  boatId: string;
  relationshipType: "OWNER" | "COMMANDER" | "CREW" | "FAMILY_VIEWER" | string;
  status: "ACTIVE" | "ENDED" | string;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface AuditLogEntry {
  id: string;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details?: Record<string, unknown> | null;
  createdAt: string;
}

export interface Device {
  id: string;
  deviceId: string;
  deviceType: string;
  nodeId?: number | null;
  status: string;
  boatId?: string | null;
  registeredAt: string;
  associatedAt?: string | null;
  unassociatedAt?: string | null;
  lastSeen?: string | null;
}

export interface DeviceAssociationHistory {
  id: string;
  boatId: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
}

export interface FamilyAccessRecord {
  userId: string;
  name: string;
  email: string;
  accountStatus: string;
  boatId: string;
  accessStatus: string;
  startedAt?: string | null;
  endedAt?: string | null;
}

export interface OperatorScopeRecord {
  id: string;
  boatId: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
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
  account_status: "ACTIVE" | "SUSPENDED" | "ARCHIVED" | string;
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
export function fetchAuditLogs(): Promise<AuditLogEntry[]> { return apiRequest<AuditLogEntry[]>("/api/users/audit", { cache: "no-store" }); }
export function fetchBoat(boatId: string): Promise<Boat> { return apiRequest<Boat>(`/api/boats/${encodeURIComponent(boatId)}`, { cache: "no-store" }); }
export function fetchBoatAssignments(boatId: string): Promise<BoatAssignment[]> { return apiRequest<BoatAssignment[]>(`/api/boats/${encodeURIComponent(boatId)}/assignments`, { cache: "no-store" }); }
export function setUserStatus(userId: string, status: "suspend" | "restore" | "archive"): Promise<AdminUser> { return apiRequest<AdminUser>(`/api/users/${encodeURIComponent(userId)}/${status}`, { method: "POST" }); }
export function setBoatLifecycle(boatId: string, action: "suspend" | "restore" | "deactivate" | "archive"): Promise<Boat> { return apiRequest<Boat>(`/api/boats/${encodeURIComponent(boatId)}/${action}`, { method: "POST" }); }
export function createBoatAssignment(boatId: string, payload: { userId: string; relationshipType: string }): Promise<BoatAssignment> { return apiRequest<BoatAssignment>(`/api/boats/${encodeURIComponent(boatId)}/assignments`, { method: "POST", body: JSON.stringify({ userId: payload.userId, relationshipType: payload.relationshipType }) }); }
export function endBoatAssignment(boatId: string, userId: string): Promise<BoatAssignment> { return apiRequest<BoatAssignment>(`/api/boats/${encodeURIComponent(boatId)}/assignments/${encodeURIComponent(userId)}/end`, { method: "POST" }); }
export function fetchDevices(): Promise<Device[]> { return apiRequest<Device[]>("/api/devices", { cache: "no-store" }); }
export function fetchDevice(id: string): Promise<Device> { return apiRequest<Device>(`/api/devices/${encodeURIComponent(id)}`, { cache: "no-store" }); }
export function fetchDeviceHistory(id: string): Promise<DeviceAssociationHistory[]> { return apiRequest<DeviceAssociationHistory[]>(`/api/devices/${encodeURIComponent(id)}/history`, { cache: "no-store" }); }
export function registerDevice(payload: { deviceId: string; deviceType: string; nodeId?: number }): Promise<Device> { return apiRequest<Device>("/api/devices", { method: "POST", body: JSON.stringify(payload) }); }
export function setDeviceLifecycle(id: string, action: "unassociate" | "deactivate" | "restore"): Promise<Device> { return apiRequest<Device>(`/api/devices/${encodeURIComponent(id)}/${action}`, { method: "POST" }); }
export function associateDevice(id: string, boatId: string): Promise<Device> { return apiRequest<Device>(`/api/devices/${encodeURIComponent(id)}/associate`, { method: "POST", body: JSON.stringify({ boatId }) }); }
export function registerBoat(payload: { boatId: string; nodeId?: number; deviceId?: string; ownerUserId?: string; commanderUserId?: string; familyUserIds: string[] }): Promise<Boat> { return apiRequest<Boat>("/api/boats/register", { method: "POST", body: JSON.stringify(payload) }); }
export function fetchFamilyAccess(): Promise<FamilyAccessRecord[]> { return apiRequest<FamilyAccessRecord[]>("/api/family-members", { cache: "no-store" }); }
export function grantFamilyAccess(userId: string, boatId: string): Promise<FamilyAccessRecord> { return apiRequest<FamilyAccessRecord>(`/api/family-members/${encodeURIComponent(userId)}/access`, { method: "POST", body: JSON.stringify({ boatId }) }); }
export function revokeFamilyAccess(userId: string, boatId: string): Promise<FamilyAccessRecord> { return apiRequest<FamilyAccessRecord>(`/api/family-members/${encodeURIComponent(userId)}/access/${encodeURIComponent(boatId)}/revoke`, { method: "POST" }); }
export function fetchOperatorScope(userId: string): Promise<OperatorScopeRecord[]> { return apiRequest<OperatorScopeRecord[]>(`/api/operators/${encodeURIComponent(userId)}/boats`, { cache: "no-store" }); }
export function grantOperatorScope(userId: string, boatId: string): Promise<OperatorScopeRecord> { return apiRequest<OperatorScopeRecord>(`/api/operators/${encodeURIComponent(userId)}/boats`, { method: "POST", body: JSON.stringify({ boatId }) }); }
export function revokeOperatorScope(userId: string, boatId: string): Promise<{ status: string; boatId: string }> { return apiRequest<{ status: string; boatId: string }>(`/api/operators/${encodeURIComponent(userId)}/boats/${encodeURIComponent(boatId)}/revoke`, { method: "POST" }); }

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
    const res = await fetch(`${API_BASE_URL}/api/alerts`, { cache: "no-store", headers: authHeaders() });
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
    const res = await fetch(url.toString(), { cache: "no-store", headers: authHeaders() });
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
