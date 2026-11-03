/**
 * The Field page as a roster, built from the open assignments, the officers in scope and the incident list. Pure functions (tested in unit/field.unit.ts).
 * What the operator needs is who is out, who has stopped answering and who is free, so the list is by officer and the rows that need action come first.
 */
import { ASSIGN_WAIT_MIN, firstLine } from './queueModel.ts';

/** Minutes without a word from an officer who accepted, after which the row is marked. */
export const QUIET_MIN = 60;

export type FAssignment = { id: number; incident_id: number; ranger_id: number; ranger_name: string; status: string; created_at: string; updated_at: string; observations: number; community_slug?: string | null; state?: string | null; incident_status?: string };
export type FRanger = { id: number; name: string; home_state: string | null; community?: string | null };
export type FIncident = { id: number; notes: string | null; community?: string | null; state?: string | null };
export type FieldRow = { key: string; officerId: number; officer: string; incidentId: number; place: string; community: string | null; status: 'assigned' | 'accepted' | 'in_progress'; ageMin: number; observations: number; late: boolean };
export type FreeRow = { key: string; officerId: number; officer: string; where: string | null };
export type Roster = { silent: FieldRow[]; ground: FieldRow[]; free: FreeRow[] };

const minutesSince = (iso: string, now: number) => { const then = Date.parse(iso); return Number.isFinite(then) ? Math.max(0, Math.round((now - then) / 60_000)) : 0; };

export function buildRoster(input: { assignments: FAssignment[]; rangers: FRanger[]; incidents: FIncident[]; now?: number; region?: string; regionName?: string | null }): Roster {
  const now = input.now ?? Date.now();
  const place = new Map(input.incidents.map(item => [item.id, item]));
  const open = input.assignments.filter(a => ['assigned', 'accepted', 'in_progress'].includes(a.status) && (!input.region || a.community_slug === input.region));
  const busy = new Set(input.assignments.filter(a => ['assigned', 'accepted', 'in_progress'].includes(a.status)).map(a => a.ranger_id));
  const silent: FieldRow[] = []; const ground: FieldRow[] = [];
  for (const a of open) {
    const incident = place.get(a.incident_id);
    const status = a.status as FieldRow['status'];
    const base = { key: `a${a.id}`, officerId: a.ranger_id, officer: a.ranger_name, incidentId: a.incident_id, place: firstLine(incident?.notes, 70) || incident?.community || `#${a.incident_id}`, community: incident?.community ?? null, status, observations: a.observations };
    if (status === 'assigned') {
      const wait = minutesSince(a.created_at, now);
      (wait >= ASSIGN_WAIT_MIN ? silent : ground).push({ ...base, ageMin: wait, late: wait >= ASSIGN_WAIT_MIN * 2 });
    } else {
      const quiet = minutesSince(a.updated_at, now);
      ground.push({ ...base, ageMin: quiet, late: quiet >= QUIET_MIN });
    }
  }
  const order = (a: FieldRow, b: FieldRow) => Number(b.late) - Number(a.late) || b.ageMin - a.ageMin || a.key.localeCompare(b.key);
  silent.sort(order); ground.sort(order);
  const free = input.rangers.filter(r => !busy.has(r.id) && (!input.regionName || r.community === input.regionName)).sort((a, b) => a.name.localeCompare(b.name))
    .map(r => ({ key: `r${r.id}`, officerId: r.id, officer: r.name, where: r.community ?? r.home_state }));
  return { silent, ground, free };
}
