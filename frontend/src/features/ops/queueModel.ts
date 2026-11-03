/**
 * The Control Room queue, built from what the server already knows. Pure functions, no React (tested in unit/queue.unit.ts).
 *
 * The queue is grouped by the action each event asks of the operator, not by database status:
 *   decide   a report nobody has checked, strongest evidence first
 *   send     verified, but no officer on it, or the officer has not answered
 *   back     the officer has written since the last staff change: the operator's call
 *   signals  a satellite cluster or a station alert that nobody has reported
 *   watch    in progress; flagged when quiet for too long
 * Nothing here verifies, merges or closes anything. Ranking is a written rule, never a hidden score.
 */
import { clusterDetections, type Detection } from './hotspotClusters.ts';
import { groupClaims, type Claim } from '../map/corroboration.ts';
import { haversineKm } from '../scenarios/engine/units.ts';

export type Section = 'decide' | 'send' | 'back' | 'signals' | 'watch';
export const SECTIONS: readonly Section[] = ['decide', 'send', 'back', 'signals', 'watch'];

/** Minutes. After this long the row is marked "running late". */
export const LATE_MIN = { decide: 30, send: 30, watch: 60 } as const;
/** An officer who has not answered after this long is treated as not there. */
export const ASSIGN_WAIT_MIN = 15;
/** A station alert or hotspot cluster this close to an open incident is already explained by it. */
export const DEFAULT_RADIUS_KM = 5;
/** Reports from these sources are first-hand and rank higher. */
export const FIRST_HAND_SOURCES: readonly string[] = ['patrol'];

export type QIncident = {
  id: number; source: string; notes: string | null; status: string; state: string | null; community?: string | null; community_slug?: string | null;
  latitude: number | null; longitude: number | null; observed_at: string | null; created_at: string; updated_at: string; image_assessment_status?: string | null; image_media_integrity_status?: string | null;
};
export type QAssignment = { id: number; incident_id: number; community_slug?: string | null; ranger_id: number; ranger_name: string; status: string; created_at: string; updated_at: string; observations: number };
export type QStation = {
  id: number; name: string; latitude: number; longitude: number; state: string; status: string; community_slug?: string | null;
  age_s?: number | null; last_sound: { kind: string; confidence: number; age_s: number } | null; pm25: number | null; pm25_vs_normal: number | null;
};
export type QueueInput = {
  incidents: QIncident[]; assignments: QAssignment[]; stations: QStation[]; detections: Detection[];
  corroboration: { radius_km: number; window_minutes: number } | null;
  muted?: ReadonlySet<string>; now?: number;
};

export type Facts = {
  firstHand?: boolean; reports?: number; satellite?: number; hasPhoto?: boolean; assessment?: string | null; mediaIntegrity?: string | null;
  officer?: string; officerWaitMin?: number; quietMin?: number; note?: string;
  sound?: { kind: string; confidence: number }; pmRatio?: number; pm25?: number; detections?: number; nearIncident?: number; stationName?: string;
};
export type QueueEvent = {
  key: string; kind: 'incident' | 'station' | 'cluster'; section: Section; incidentId?: number; stationId?: number;
  place: string; community: string | null; rung: 'report' | 'verified' | 'responding' | 'contained' | 'signal'; ageMin: number; late: boolean;
  lat: number | null; lon: number | null; facts: Facts; assignmentId?: number; links: number[];
};

const minutesSince = (iso: string | null | undefined, now: number): number => {
  const then = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(then) ? Math.max(0, Math.round((now - then) / 60_000)) : 0;
};
/** The big number and unit shown for a time waiting: minutes, then hours, then days. */
export function ageParts(minutes: number): [number, 'min' | 'h' | 'd'] {
  return minutes < 60 ? [minutes, 'min'] : minutes < 1440 ? [Math.round(minutes / 60), 'h'] : [Math.round(minutes / 1440), 'd'];
}
export const firstLine = (text: string | null | undefined, max = 90): string => {
  const line = (text ?? '').split('\n')[0].trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};
const rungOf = (status: string): QueueEvent['rung'] => (status === 'verified' ? 'verified' : status === 'responding' ? 'responding' : status === 'contained' ? 'contained' : 'report');

export function buildQueue(input: QueueInput): Record<Section, QueueEvent[]> {
  const now = input.now ?? Date.now();
  const open = input.incidents.filter(item => item.status !== 'closed');
  const radius = input.corroboration?.radius_km ?? DEFAULT_RADIUS_KM;

  // Corroboration: other reports and satellite detections close in space and time to each unchecked report.
  const located = open.filter(item => item.latitude != null && item.longitude != null);
  const linked = new Map<number, { reports: number; satellite: number; links: number[] }>();
  if (input.corroboration) {
    const claims: Claim[] = [
      ...located.map(item => ({ id: `i${item.id}`, kind: (item.status === 'reported' ? 'report' : 'incident') as Claim['kind'], lat: item.latitude!, lon: item.longitude!, at: item.observed_at ?? item.created_at })),
      ...input.detections.map(item => ({ id: `s${item.id}`, kind: 'signal' as const, lat: item.latitude, lon: item.longitude, at: item.acq_datetime })),
    ];
    for (const group of groupClaims(claims, { radiusKm: input.corroboration.radius_km, windowMinutes: input.corroboration.window_minutes })) {
      const ids = group.ids.filter(id => id.startsWith('i')).map(id => Number(id.slice(1)));
      for (const id of ids) linked.set(id, { reports: group.summary.reports + group.summary.incidents - 1, satellite: group.summary.signals, links: ids.filter(other => other !== id) });
    }
  }

  const activeBy = new Map<number, QAssignment>();
  for (const a of input.assignments) if (['assigned', 'accepted', 'in_progress'].includes(a.status)) activeBy.set(a.incident_id, a);

  const out: Record<Section, QueueEvent[]> = { decide: [], send: [], back: [], signals: [], watch: [] };
  const place = (item: QIncident) => firstLine(item.notes) || item.community || item.state || `#${item.id}`;
  for (const item of open) {
    const base = { key: `i${item.id}`, kind: 'incident' as const, incidentId: item.id, place: place(item), community: item.community ?? null, lat: item.latitude, lon: item.longitude, rung: rungOf(item.status) };
    const near = linked.get(item.id);
    const facts: Facts = { firstHand: FIRST_HAND_SOURCES.includes(item.source), reports: near?.reports ?? 0, satellite: near?.satellite ?? 0, hasPhoto: Boolean(item.image_assessment_status), assessment: item.image_assessment_status ?? null, mediaIntegrity: item.image_media_integrity_status ?? null };
    const links = near?.links ?? [];
    const active = activeBy.get(item.id);
    if (item.status === 'reported') {
      const ageMin = minutesSince(item.created_at, now);
      out.decide.push({ ...base, section: 'decide', ageMin, late: ageMin >= LATE_MIN.decide, facts, links });
      continue;
    }
    const changed = minutesSince(item.updated_at, now);
    if (!active && item.status !== 'contained') { out.send.push({ ...base, section: 'send', ageMin: changed, late: changed >= LATE_MIN.send, facts, links }); continue; }
    if (active && active.status === 'assigned' && minutesSince(active.created_at, now) >= ASSIGN_WAIT_MIN) {
      const wait = minutesSince(active.created_at, now);
      out.send.push({ ...base, section: 'send', ageMin: wait, late: wait >= LATE_MIN.send, facts: { ...facts, officer: active.ranger_name, officerWaitMin: wait }, assignmentId: active.id, links });
      continue;
    }
    if (active && active.observations > 0 && Date.parse(active.updated_at) > Date.parse(item.updated_at)) {
      out.back.push({ ...base, section: 'back', ageMin: minutesSince(active.updated_at, now), late: false, facts: { ...facts, officer: active.ranger_name }, assignmentId: active.id, links });
      continue;
    }
    const quiet = minutesSince(active && Date.parse(active.updated_at) > Date.parse(item.updated_at) ? active.updated_at : item.updated_at, now);
    out.watch.push({ ...base, section: 'watch', ageMin: quiet, late: item.status === 'responding' && quiet >= LATE_MIN.watch, facts: { ...facts, officer: active?.ranger_name, quietMin: quiet }, assignmentId: active?.id, links });
  }

  // Signals nobody has reported: station sound alerts and air-quality spikes, and satellite clusters, each unless an open incident already explains it.
  const nearestIncident = (lat: number, lon: number): number | undefined => {
    let best: { id: number; km: number } | undefined;
    for (const item of located) { const km = haversineKm({ lat, lon }, { lat: item.latitude!, lon: item.longitude! }); if (km <= radius && (!best || km < best.km)) best = { id: item.id, km }; }
    return best?.id;
  };
  for (const s of input.stations) {
    if (s.status === 'offline' || s.status === 'never') continue;
    const sound = s.last_sound; const spike = s.pm25_vs_normal !== null && s.pm25_vs_normal >= 2 && s.status === 'online';
    if (!sound && !spike) continue;
    const key = sound ? `t${s.id}:${sound.kind}` : `t${s.id}:pm`;
    if (input.muted?.has(key)) continue;
    out.signals.push({ key, kind: 'station', stationId: s.id, section: 'signals', place: s.name, community: s.community_slug ?? null, rung: 'signal', ageMin: Math.round((sound ? sound.age_s : s.age_s ?? 0) / 60), late: false, lat: s.latitude, lon: s.longitude, links: [],
      facts: { stationName: s.name, sound: sound ? { kind: sound.kind, confidence: sound.confidence } : undefined, pmRatio: spike ? s.pm25_vs_normal! : undefined, pm25: s.pm25 ?? undefined, nearIncident: nearestIncident(s.latitude, s.longitude) } });
  }
  for (const c of clusterDetections(input.detections.filter(d => d.forest_state))) {
    const key = `h${c.key}`;
    if (input.muted?.has(key) || nearestIncident(c.lat, c.lon) !== undefined) continue;
    out.signals.push({ key, kind: 'cluster', section: 'signals', place: c.state ?? 'Forest', community: null, rung: 'signal', ageMin: minutesSince(c.latest, now), late: false, lat: c.lat, lon: c.lon, links: [], facts: { detections: c.count } });
  }

  // Order. Decide: first-hand, then the most corroboration, then a photo, then the longest waiting. The rest: the longest waiting first.
  const score = (e: QueueEvent) => (e.facts.reports ?? 0) + (e.facts.satellite ?? 0);
  out.decide.sort((a, b) => Number(b.facts.firstHand) - Number(a.facts.firstHand) || score(b) - score(a) || Number(b.facts.hasPhoto) - Number(a.facts.hasPhoto) || b.ageMin - a.ageMin || (a.incidentId ?? 0) - (b.incidentId ?? 0));
  for (const section of ['send', 'back', 'signals', 'watch'] as const) out[section].sort((a, b) => Number(b.late) - Number(a.late) || b.ageMin - a.ageMin || a.key.localeCompare(b.key));
  return out;
}

export const needsYou = (queue: Record<Section, QueueEvent[]>): number => queue.decide.length + queue.send.length + queue.back.length + queue.signals.length;
export const lateCount = (queue: Record<Section, QueueEvent[]>): number => SECTIONS.reduce((n, section) => n + queue[section].filter(event => event.late).length, 0);

/** The close reasons offered next to "Not confirmed", mapped onto the reasons the server knows. The words go into the note. */
export const NOT_CONFIRMED: ReadonlyArray<{ id: string; reason: 'false_alarm' | 'duplicate' | 'unable_to_verify'; note: string }> = [
  { id: 'controlled_burn', reason: 'false_alarm', note: 'Controlled burn' },
  { id: 'cooking_fire', reason: 'false_alarm', note: 'Cooking or waste fire' },
  { id: 'cloud', reason: 'false_alarm', note: 'Cloud or mist' },
  { id: 'not_forest', reason: 'unable_to_verify', note: 'Not forest' },
  { id: 'duplicate', reason: 'duplicate', note: '' },
];
