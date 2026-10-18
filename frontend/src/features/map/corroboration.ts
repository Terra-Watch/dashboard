/**
 * Corroboration aid for the Control Room queue. Groups claims that are close
 * in space AND time as a SUGGESTION. A group never verifies, merges or
 * changes anything: there is no "verified" field, claims are never mutated.
 *
 * Linking rule: two claims are linked when their great-circle distance is
 * <= radiusKm and their times differ by <= windowMinutes. Groups are the
 * connected components of that graph, so chains are transitive.
 */
import { ScenarioInputError, haversineKm } from '../scenarios/engine/units.ts';

/** Kind of claim. */
export type ClaimKind = 'signal' | 'report' | 'incident';

/** A claim to be grouped. */
export interface Claim {
  id: string;
  kind: ClaimKind;
  lat: number;
  lon: number;
  /** ISO 8601 timestamp. */
  at: string;
}

/** Required thresholds, no defaults. */
export interface CorroborationThresholds {
  radiusKm: number;
  windowMinutes: number;
}

/** Counts by kind. */
export interface KindCounts {
  reports: number;
  signals: number;
  incidents: number;
}

/** A suggested group of related claims. */
export interface ClaimGroup {
  /** Member ids ordered by time then id. */
  ids: string[];
  /** Mean position of members (simple mean of lat/lon; fine at local scale). */
  centre: { lat: number; lon: number };
  kinds: Record<ClaimKind, number>;
  /** ISO timestamp of the earliest member. */
  earliest: string;
  /** ISO timestamp of the latest member. */
  latest: string;
  summary: KindCounts;
}

/**
 * Group claims by space-time proximity. Throws ScenarioInputError
 * (`missing_threshold`) if radiusKm or windowMinutes is missing, non-finite or
 * not > 0, and `invalid_claim` for unusable claims. Output is sorted by group
 * size descending, then latest time descending, then first id ascending.
 */
export function groupClaims(claims: readonly Claim[], thresholds: CorroborationThresholds): ClaimGroup[] {
  const { radiusKm, windowMinutes } = thresholds ?? ({} as CorroborationThresholds);
  if (!Number.isFinite(radiusKm) || !(radiusKm > 0)) throw new ScenarioInputError('missing_threshold', 'radiusKm');
  if (!Number.isFinite(windowMinutes) || !(windowMinutes > 0)) throw new ScenarioInputError('missing_threshold', 'windowMinutes');

  const items = claims.map((c) => {
    const t = Date.parse(c.at);
    if (!c.id || !Number.isFinite(t) || !Number.isFinite(c.lat) || !Number.isFinite(c.lon)) {
      throw new ScenarioInputError('invalid_claim', String(c?.id));
    }
    if (c.kind !== 'signal' && c.kind !== 'report' && c.kind !== 'incident') {
      throw new ScenarioInputError('invalid_claim', `${c.id}.kind`);
    }
    return { c, t };
  });

  // union-find
  const parent = items.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const windowMs = windowMinutes * 60000;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (Math.abs(items[i].t - items[j].t) <= windowMs && haversineKm(items[i].c, items[j].c) <= radiusKm) {
        parent[find(i)] = find(j);
      }
    }
  }
  const comps = new Map<number, typeof items>();
  items.forEach((it, i) => {
    const r = find(i);
    const arr = comps.get(r);
    if (arr) arr.push(it);
    else comps.set(r, [it]);
  });

  const groups = [...comps.values()].map((members) => {
    members.sort((a, b) => a.t - b.t || (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0));
    const kinds: Record<ClaimKind, number> = { signal: 0, report: 0, incident: 0 };
    let lat = 0;
    let lon = 0;
    for (const m of members) {
      kinds[m.c.kind]++;
      lat += m.c.lat;
      lon += m.c.lon;
    }
    const first = members[0];
    const last = members[members.length - 1];
    const group: ClaimGroup = {
      ids: members.map((m) => m.c.id),
      centre: { lat: lat / members.length, lon: lon / members.length },
      kinds,
      earliest: first.c.at,
      latest: last.c.at,
      summary: { reports: kinds.report, signals: kinds.signal, incidents: kinds.incident },
    };
    return { group, latestT: last.t };
  });
  groups.sort(
    (a, b) =>
      b.group.ids.length - a.group.ids.length ||
      b.latestT - a.latestT ||
      (a.group.ids[0] < b.group.ids[0] ? -1 : a.group.ids[0] > b.group.ids[0] ? 1 : 0),
  );
  return groups.map((g) => g.group);
}
