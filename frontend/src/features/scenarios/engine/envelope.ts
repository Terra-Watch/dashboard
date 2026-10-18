/**
 * Nested spread envelopes over a wind schedule.
 *
 * METHOD (deliberately simple, see README): every ellipse has the ignition
 * point as its rear focus, so each is star-shaped about the ignition and the
 * union of several is exactly the maximum of their radii along each bearing.
 * For a schedule, the envelope at hour H is the union over its constant-wind
 * segments of the ellipse grown FROM THE IGNITION POINT under that segment's
 * wind for the time elapsed up to the end of the segment (clipped to H).
 * With a constant wind this is exactly the single Richards ellipse. With a
 * shifting wind it is an UPPER BOUND on reach under each wind in the
 * schedule, not a fire track: it is not re-seeded from the previous
 * perimeter, and the head ROS is the one value typed by the planner.
 */
import {
  type EllipseInput,
  assertVertices,
  ellipseMetrics,
  ellipseRadiusKm,
  polygonFromRadii,
} from './ellipse.ts';
import {
  type GeoPolygon,
  type LatLon,
  ScenarioInputError,
  assertLatLon,
  isFiniteNumber,
  normalizeDeg,
} from './units.ts';
import { type WindEntry, validateWindSchedule, windSegments } from './wind.ts';

/** Scenario inputs: ignition, typed head ROS (no default) and a wind schedule. */
export interface ScenarioInputs {
  start: LatLon;
  /** Head-fire rate of spread, km/h, > 0. */
  headRosKmh: number;
  schedule: WindEntry[];
}

/** Multipliers/offsets applied to every schedule entry (used by uncertainty bands). */
export interface Perturbation {
  /** Multiplies wind speed. */
  speedFactor: number;
  /** Added to wind direction, degrees. */
  dirOffsetDeg: number;
  /** Multiplies head ROS. */
  rosFactor: number;
}

/** No perturbation. */
export const NO_PERTURBATION: Perturbation = { speedFactor: 1, dirOffsetDeg: 0, rosFactor: 1 };

/** Default hours at which nested envelopes are requested. */
export const DEFAULT_ENVELOPE_HOURS: readonly number[] = [1, 3, 6, 12, 24];

/** Evenly spaced absolute compass bearings starting at north. */
export function bearingGrid(vertices: number): number[] {
  assertVertices(vertices);
  return Array.from({ length: vertices }, (_, k) => (360 * k) / vertices);
}

/** Validate scenario inputs (typed errors). */
export function validateScenarioInputs(inputs: ScenarioInputs): WindEntry[] {
  assertLatLon(inputs?.start, 'start');
  if (!isFiniteNumber(inputs.headRosKmh) || inputs.headRosKmh <= 0) {
    throw new ScenarioInputError('invalid_ros', 'headRosKmh');
  }
  return validateWindSchedule(inputs.schedule);
}

/**
 * Perimeter radii (km) at the absolute bearing grid at `hour` (max over wind
 * segments, see module comment). Exposed so bands can take unions/maxima.
 */
export function envelopeRadiiKm(
  inputs: ScenarioInputs,
  hour: number,
  vertices: number,
  p: Perturbation = NO_PERTURBATION,
): number[] {
  const sched = validateScenarioInputs(inputs);
  const grid = bearingGrid(vertices);
  const radii = grid.map(() => 0);
  for (const seg of windSegments(sched, hour)) {
    const e: EllipseInput = {
      headRosKmh: inputs.headRosKmh * p.rosFactor,
      midflameWindKmh: seg.windKmh * p.speedFactor,
      windFromDeg: normalizeDeg(seg.windFromDeg + p.dirOffsetDeg),
      hours: seg.toHour,
      start: inputs.start,
    };
    const m = ellipseMetrics(e);
    grid.forEach((b, i) => {
      radii[i] = Math.max(radii[i], ellipseRadiusKm(m, b));
    });
  }
  return radii;
}

/** Envelope polygon at one hour. */
export function envelopeAt(
  inputs: ScenarioInputs,
  hour: number,
  vertices = 72,
  p: Perturbation = NO_PERTURBATION,
): GeoPolygon {
  return polygonFromRadii(inputs.start, bearingGrid(vertices), envelopeRadiiKm(inputs, hour, vertices, p));
}

/** One nested envelope. */
export interface HourlyEnvelope {
  hour: number;
  polygon: GeoPolygon;
}

/**
 * Nested envelopes at the requested hours (default 1, 3, 6, 12, 24), in the
 * order given, which must be strictly increasing and positive.
 */
export function nestedEnvelopes(
  inputs: ScenarioInputs,
  hours: readonly number[] = DEFAULT_ENVELOPE_HOURS,
  vertices = 72,
): HourlyEnvelope[] {
  checkHours(hours);
  return hours.map((hour) => ({ hour, polygon: envelopeAt(inputs, hour, vertices) }));
}

/** Throws unless hours are finite, > 0 and strictly increasing. */
export function checkHours(hours: readonly number[]): void {
  if (!Array.isArray(hours) || hours.length === 0) throw new ScenarioInputError('invalid_hours', 'hours');
  hours.forEach((h, i) => {
    if (!isFiniteNumber(h) || h <= 0 || (i > 0 && h <= hours[i - 1])) {
      throw new ScenarioInputError('invalid_hours', `hours[${i}]`);
    }
  });
}
