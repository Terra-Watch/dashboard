export type PendingIncident = { client_key: string; source: string; size: string; notes: string };

const QUEUE_KEY = 'resq_pending_incidents';
const LEGACY_KEY = 'resq_pending_incident';

export function readPendingIncidents(): PendingIncident[] {
  const queued = localStorage.getItem(QUEUE_KEY);
  if (queued) { try { return JSON.parse(queued) as PendingIncident[]; } catch { localStorage.removeItem(QUEUE_KEY); } }
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy) return [];
  try { return [JSON.parse(legacy) as PendingIncident]; } catch { return []; }
}

export function queueIncident(incident: PendingIncident) {
  const next = [...readPendingIncidents(), incident];
  localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
  localStorage.removeItem(LEGACY_KEY);
}

export function savePendingIncidents(incidents: PendingIncident[]) {
  if (incidents.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(incidents));
  else localStorage.removeItem(QUEUE_KEY);
}
