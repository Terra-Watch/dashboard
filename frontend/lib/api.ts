export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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

export interface SystemStatusResponse {
  components: Array<{
    component: string;
    status: "ONLINE" | "OFFLINE" | "DEGRADED" | "UNKNOWN";
  }>;
}

export async function fetchBoats(): Promise<Boat[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/boats`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchHistory(): Promise<HistoricalEvent[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/history`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchSystemStatus(): Promise<SystemStatusResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/system-status`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
