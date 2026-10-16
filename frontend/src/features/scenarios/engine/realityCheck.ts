/**
 * Reality check: observations versus the outer uncertainty band at the
 * current elapsed hour. Returns codes only; the UI words the message.
 */
import { type GeoPolygon, ScenarioInputError, assertLatLon, pointInPolygon } from './units.ts';

/** Kind of observation. */
export type ObservationKind = 'signal' | 'field' | 'report';

/** One observation to compare against the band. */
export interface Observation {
  lat: number;
  lon: number;
  observedAt: string;
  kind: ObservationKind;
}

/** Outcome: `unreliable` means the scenario is contradicted by observation. */
export interface RealityCheckResult {
  outside: Observation[];
  status: 'consistent' | 'unreliable';
  /** Counts of outside observations by kind. */
  outsideByKind: Record<ObservationKind, number>;
}

/**
 * Compare observations with the outer band. Any observation of a kind in
 * `unreliableKinds` (default only 'field', as specified) outside the band
 * makes the status 'unreliable'. Signals and reports outside are still listed
 * in `outside`. Input is not mutated; order of `outside` follows input order.
 */
export function realityCheck(
  outerBand: GeoPolygon,
  observations: readonly Observation[],
  unreliableKinds: readonly ObservationKind[] = ['field'],
): RealityCheckResult {
  const outside: Observation[] = [];
  const counts: Record<ObservationKind, number> = { signal: 0, field: 0, report: 0 };
  for (const o of observations) {
    assertLatLon(o, 'observation');
    if (o.kind !== 'signal' && o.kind !== 'field' && o.kind !== 'report') {
      throw new ScenarioInputError('invalid_observation', 'kind');
    }
    if (!pointInPolygon(o, outerBand)) {
      outside.push(o);
      counts[o.kind]++;
    }
  }
  const unreliable = outside.some((o) => unreliableKinds.includes(o.kind));
  return { outside, status: unreliable ? 'unreliable' : 'consistent', outsideByKind: counts };
}
