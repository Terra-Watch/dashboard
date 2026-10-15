export type IncidentPayload = { client_key: string; source: string; size: string; notes: string; state?: string };
// Older local drafts may predate the state field; keep them readable, but never
// drop state from newly queued reports when syncing.
export type PendingIncident = Omit<IncidentPayload, 'state'> & { state?: string; owner_id?: string };

const QUEUE_KEY = 'resq_pending_incidents';
const LEGACY_KEY = 'resq_pending_incident';

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
