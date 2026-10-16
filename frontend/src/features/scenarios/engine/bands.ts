/**
 * Uncertainty bands. Fractions, not percentages: 0.2 means plus/minus 20 %.
 *
 * - nominal: the typed inputs.
 * - inner:   ALL-MINUS corner (wind speed x(1-f), direction -d, ROS x(1-f)).
 * - outer:   union (radial maximum, exact because every ellipse is star-shaped
 *            about the ignition) of the 8 corners of {+,-} x {+,-} x {+,-}
 *            for speed, direction and ROS, together with the nominal.
 *
 * Caveat: ROS is typed as a head rate, so a lower wind speed widens the
 * flanks (LB falls) while the head distance is unchanged. "All-minus" is
 * therefore the smallest HEAD reach, not a strict geometric subset of the
 * nominal polygon. The outer band always contains the nominal and the inner.
 */
import { type Perturbation, type ScenarioInputs, bearingGrid, checkHours, envelopeRadiiKm } from './envelope.ts';
import { polygonFromRadii } from './ellipse.ts';
import { type GeoPolygon, ScenarioInputError, isFiniteNumber } from './units.ts';

/** Uncertainty as fractions (speed, ROS) and degrees (direction). */
export interface Uncertainty {
  /** Wind speed fraction in [0, 1). */
  windSpeedPct: number;
  /** Wind direction, degrees in [0, 180]. */
  windDirDeg: number;
  /** ROS fraction in [0, 1). */
  rosPct: number;
}

/** Nominal, inner and outer polygons at one hour. */
export interface BandSet {
  hour: number;
  nominal: GeoPolygon;
  inner: GeoPolygon;
  outer: GeoPolygon;
}

/** Throws a typed error unless the uncertainty values are in range. */
export function validateUncertainty(u: Uncertainty): void {
  const frac = (v: number) => isFiniteNumber(v) && v >= 0 && v < 1;
  if (!frac(u?.windSpeedPct)) throw new ScenarioInputError('invalid_uncertainty', 'windSpeedPct');
  if (!frac(u.rosPct)) throw new ScenarioInputError('invalid_uncertainty', 'rosPct');
  if (!isFiniteNumber(u.windDirDeg) || u.windDirDeg < 0 || u.windDirDeg > 180) {
    throw new ScenarioInputError('invalid_uncertainty', 'windDirDeg');
  }
}

/** The 8 plus/minus corner perturbations. */
export function cornerPerturbations(u: Uncertainty): Perturbation[] {
  const out: Perturbation[] = [];
  for (const s of [-1, 1]) for (const d of [-1, 1]) for (const r of [-1, 1]) {
    out.push({
      speedFactor: 1 + s * u.windSpeedPct,
      dirOffsetDeg: d * u.windDirDeg,
      rosFactor: 1 + r * u.rosPct,
    });
  }
  return out;
}

/** Inner / outer / nominal polygons at one hour. */
export function bandsAtHour(inputs: ScenarioInputs, u: Uncertainty, hour: number, vertices = 72): BandSet {
  validateUncertainty(u);
  const grid = bearingGrid(vertices);
  const nominalR = envelopeRadiiKm(inputs, hour, vertices);
  const innerR = envelopeRadiiKm(inputs, hour, vertices, {
    speedFactor: 1 - u.windSpeedPct,
    dirOffsetDeg: -u.windDirDeg,
    rosFactor: 1 - u.rosPct,
  });
  const outerR = nominalR.slice();
  for (const p of cornerPerturbations(u)) {
    envelopeRadiiKm(inputs, hour, vertices, p).forEach((r, i) => {
      if (r > outerR[i]) outerR[i] = r;
    });
  }
  const mk = (r: number[]) => polygonFromRadii(inputs.start, grid, r);
  return { hour, nominal: mk(nominalR), inner: mk(innerR), outer: mk(outerR) };
}

/** Band sets at each requested hour (strictly increasing, positive). */
export function bandsAtHours(inputs: ScenarioInputs, u: Uncertainty, hours: readonly number[], vertices = 72): BandSet[] {
  checkHours(hours);
  return hours.map((h) => bandsAtHour(inputs, u, h, vertices));
}
