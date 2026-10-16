export type IncidentPayload = { client_key: string; source: string; size: string; notes: string; state?: string };
// Older local drafts may predate the state field; keep them readable, but never
// drop state from newly queued reports when syncing.
export type PendingIncident = Omit<IncidentPayload, 'state'> & { state?: string; owner_id?: string };

// Generic offline queue for any POST request
export type QueuedRequest = {
  method: 'POST';
  path: string;
  body: unknown;
  headers?: Record<string, string>;
  timestamp: number;
  owner_id?: string;
  idempotency_key?: string;
};

const QUEUE_KEY = 'resq_pending_incidents';
const LEGACY_KEY = 'resq_pending_incident';
const GENERIC_QUEUE_KEY = 'resq_offline_queue';

/** Read the authenticated actor claim for local queue partitioning only.
 * The server still derives identity from the bearer token, never this metadata.
 */
export function authenticatedActorId(token = localStorage.getItem('resq_token')): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as { sub?: unknown };
    return typeof decoded.sub === 'string' || typeof decoded.sub === 'number' ? String(decoded.sub) : null;
  } catch {
    return null;
  }
}

export function readPendingIncidents(): PendingIncident[] {
  const queued = localStorage.getItem(QUEUE_KEY);
  if (queued) { try { return JSON.parse(queued) as PendingIncident[]; } catch { localStorage.removeItem(QUEUE_KEY); } }
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return [];
  try { return [JSON.parse(legacy) as PendingIncident]; } catch { return []; }
}

export function queueIncident(incident: IncidentPayload, ownerId = authenticatedActorId()) {
  const next = [...readPendingIncidents(), { ...incident, ...(ownerId ? { owner_id: ownerId } : {}) }];
  localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  localStorage.removeItem(LEGACY_KEY);
}

export function savePendingIncidents(incidents: PendingIncident[]) {
  if (incidents.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(incidents));
  else localStorage.removeItem(QUEUE_KEY);
}

/** Submit only records explicitly bound to this actor; retain all others. */
export async function syncPendingIncidents(
  incidents: PendingIncident[],
  actorId: string | null,
  submit: (payload: IncidentPayload) => Promise<unknown>,
): Promise<PendingIncident[]> {
  const remaining: PendingIncident[] = [];
  for (const incident of incidents) {
    // The token may change while an earlier request is in flight. Re-check
    // immediately before calling submit, which reads the current bearer token.
    if (!actorId || authenticatedActorId() !== actorId || incident.owner_id !== actorId) {
      remaining.push(incident);
      continue;
    }
    const { client_key, source, size, notes, state } = incident;
    if (!state) {
      remaining.push(incident);
      continue;
    }
    try { await submit({ client_key, source, size, notes, ...(state ? { state } : {}) }); }
    catch { remaining.push(incident); }
  }
  return remaining;
}

// Generic offline queue management
export function readOfflineQueue(): QueuedRequest[] {
  const queued = localStorage.getItem(GENERIC_QUEUE_KEY);
  if (!queued) return [];
  try { return JSON.parse(queued) as QueuedRequest[]; } catch { localStorage.removeItem(GENERIC_QUEUE_KEY); return []; }
}

export function saveOfflineQueue(queue: QueuedRequest[]) {
  if (queue.length) localStorage.setItem(GENERIC_QUEUE_KEY, JSON.stringify(queue));
  else localStorage.removeItem(GENERIC_QUEUE_KEY);
}

export function queueRequest(request: Omit<QueuedRequest, 'timestamp' | 'owner_id'>) {
  const ownerId = authenticatedActorId();
  const next = [...readOfflineQueue(), { ...request, timestamp: Date.now(), ...(ownerId ? { owner_id: ownerId } : {}) }];
  saveOfflineQueue(next);
}

/** Sync queued requests using the provided fetch function. Returns requests that failed to sync. */
export async function syncQueue(
  fetchFn: (path: string, options: RequestInit) => Promise<Response>,
): Promise<void> {
  const queue = readOfflineQueue();
  if (!queue.length) return;

  const actorId = authenticatedActorId();
  const remaining: QueuedRequest[] = [];
  
  for (const request of queue) {
    // Skip requests from different users
    if (request.owner_id && request.owner_id !== actorId) {
      remaining.push(request);
      continue;
    }

    try {
      const response = await fetchFn(request.path, {
        method: request.method,
        headers: { 'Content-Type': 'application/json', ...request.headers },
        body: JSON.stringify(request.body),
      });
      
      // 409 Conflict means idempotency key collision - treat as success
      if (response.ok || response.status === 409) {
        continue; // Successfully synced
      }
      
      // Other errors: keep in queue
      remaining.push(request);
    } catch {
      // Network error or other exception: keep in queue
      remaining.push(request);
    }
  }

  saveOfflineQueue(remaining);
}
