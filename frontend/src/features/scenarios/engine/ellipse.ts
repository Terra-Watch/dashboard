/**
 * Elliptical fire growth from a point (Anderson 1983 length-to-breadth ratio,
 * Richards ellipse with the ignition point at the REAR focus).
 *
 * DERIVATION
 *   U      = midflame wind speed in metres per second (U = km/h / 3.6).
 *   LB     = 0.936 exp(0.2566 U) + 0.461 exp(-0.1548 U) - 0.397   (>= 1; U=0 -> 1)
 *   UNITS NOTE: Anderson (1983) published 0.936 exp(0.1147 U) + 0.461 exp(-0.0692 U)
 *   - 0.397 with U in mph. Multiplying the exponents by 2.237 (mph per m/s) gives
 *   0.2566 and 0.1548, so the constants quoted in the design brief are the
 *   same curve with U in m/s. Feeding them mph would give LB = 11.9 at 10 mph
 *   (the correct value is 2.78), so this module converts km/h -> m/s.
 *   e      = sqrt(LB^2 - 1) / LB         eccentricity, e = 0 for a circle
 *   head   = R t                         head distance from ignition (R = head ROS km/h)
 *   With the ignition at the rear focus, head = a (1 + e) and back = a (1 - e), so
 *     a    = (head + back) / 2           semi-major axis
 *     back = head (1 - e) / (1 + e)
 *     b    = a sqrt(1 - e^2) = a / LB    semi-minor axis (max half-width)
 *     HB   = head / back = (1 + e)/(1 - e) = (LB + sqrt(LB^2-1)) / (LB - sqrt(LB^2-1))
 *   Distance from the ignition to the ellipse perpendicular to the heading
 *   (semi-latus rectum) is a (1 - e^2) = a / LB^2 = b^2 / a.
 *   Polar form about the focus, phi measured from the head direction:
 *     r(phi) = a (1 - e^2) / (1 - e cos phi)
 *   (phi = 0 gives head, phi = 180 gives back.)
 *   Zero wind: LB = 1, e = 0, a = b = head = R t, a circle of radius R t.
 *
 * The head points downwind: heading = windFrom + 180 (meteorological wind
 * direction is where the wind blows FROM).
 *
 * Not modelled: slope, spotting, crowning, fuel-moisture change, barriers.
 */
import {
  type GeoPolygon,
  type LatLon,
  ScenarioInputError,
  assertLatLon,
  destinationPoint,
  isFiniteNumber,
  kmhToMs,
  normalizeDeg,
  toRad,
} from './units.ts';

/** Inputs for one constant-wind ellipse. All plain units. */
export interface EllipseInput {
  /** Head-fire rate of spread, km/h. REQUIRED, no default. Must be > 0. */
  headRosKmh: number;
  /** Midflame wind speed, km/h, >= 0. */
  midflameWindKmh: number;
  /** Direction the wind blows FROM, degrees 0..360. */
  windFromDeg: number;
  /** Elapsed hours, > 0. */
  hours: number;
  /** Ignition point. */
  start: LatLon;
}

/** Ellipse dimensions (km, degrees) with the ignition at the rear focus. */
export interface EllipseMetrics {
  lb: number;
  hb: number;
  eccentricity: number;
  headKm: number;
  backKm: number;
  /** Semi-minor axis: maximum half-width of the fire. */
  flankKm: number;
  /** Distance from the ignition to the perimeter at 90 degrees to the heading. */
  flankFromIgnitionKm: number;
  semiMajorKm: number;
  /** Direction the head travels (downwind), degrees [0, 360). */
  headingDeg: number;
}

/** Result of growing an ellipse: metrics plus the polygon. */
export interface EllipseResult extends EllipseMetrics {
  polygon: GeoPolygon;
}

/** Throws a typed ScenarioInputError if any ellipse input is unusable. */
export function validateEllipseInput(input: EllipseInput): void {
  if (!isFiniteNumber(input?.headRosKmh) || input.headRosKmh <= 0) {
    throw new ScenarioInputError('invalid_ros', 'headRosKmh');
  }
  if (!isFiniteNumber(input.midflameWindKmh) || input.midflameWindKmh < 0) {
    throw new ScenarioInputError('invalid_wind_speed', 'midflameWindKmh');
  }
  if (!isFiniteNumber(input.windFromDeg) || input.windFromDeg < 0 || input.windFromDeg > 360) {
    throw new ScenarioInputError('invalid_wind_direction', 'windFromDeg');
  }
  if (!isFiniteNumber(input.hours) || input.hours <= 0) {
    throw new ScenarioInputError('invalid_hours', 'hours');
  }
  assertLatLon(input.start, 'start');
}

/**
 * Anderson (1983) length-to-breadth ratio for a wind speed in km/h
 * (converted to m/s internally, see UNITS NOTE). Always >= 1.
 */
export function lengthToBreadth(windKmh: number): number {
  const u = kmhToMs(windKmh);
  const lb = 0.936 * Math.exp(0.2566 * u) + 0.461 * Math.exp(-0.1548 * u) - 0.397;
  return Math.max(1, lb);
}

/** Head/back ratio HB = (LB + sqrt(LB^2-1)) / (LB - sqrt(LB^2-1)). */
export function headBackRatio(lb: number): number {
  const s = Math.sqrt(Math.max(0, lb * lb - 1));
  return (lb + s) / (lb - s);
}

/**
 * Ellipse dimensions for the given inputs (validated). Pure arithmetic, no
 * polygon built.
 */
export function ellipseMetrics(input: EllipseInput): EllipseMetrics {
  validateEllipseInput(input);
  const lb = lengthToBreadth(input.midflameWindKmh);
  const e = Math.sqrt(Math.max(0, lb * lb - 1)) / lb;
  const headKm = input.headRosKmh * input.hours;
  const backKm = (headKm * (1 - e)) / (1 + e);
  const a = (headKm + backKm) / 2;
  return {
    lb,
    hb: headBackRatio(lb),
    eccentricity: e,
    headKm,
    backKm,
    flankKm: a / lb,
    flankFromIgnitionKm: a / (lb * lb),
    semiMajorKm: a,
    headingDeg: normalizeDeg(input.windFromDeg + 180),
  };
}

/**
 * Distance (km) from the ignition (focus) to the perimeter along a compass
 * bearing, for an ellipse whose head points along `m.headingDeg`.
 */
export function ellipseRadiusKm(m: EllipseMetrics, bearing: number): number {
  const phi = toRad(bearing - m.headingDeg);
  const e = m.eccentricity;
  return (m.semiMajorKm * (1 - e * e)) / (1 - e * Math.cos(phi));
}

/**
 * Build a closed GeoJSON polygon from radii (km) given at compass bearings,
 * using great-circle destination points from `start`.
 */
export function polygonFromRadii(start: LatLon, bearings: number[], radiiKm: number[]): GeoPolygon {
  const ring = bearings.map((b, i) => {
    const p = destinationPoint(start, b, radiiKm[i]);
    return [p.lon, p.lat];
  });
  ring.push([ring[0][0], ring[0][1]]);
  return { type: 'Polygon', coordinates: [ring] };
}

/** Check a vertex count (integer >= 8). */
export function assertVertices(n: number): void {
  if (!Number.isInteger(n) || n < 8) throw new ScenarioInputError('invalid_vertices', 'vertices');
}

/**
 * Grow the ellipse: metrics plus a GeoJSON Polygon with `vertices` points
 * (default 72) spaced evenly in bearing starting at the head, so the head
 * (and, for vertices divisible by 4, flank and back) points are exact vertices.
 */
export function growEllipse(input: EllipseInput, vertices = 72): EllipseResult {
  assertVertices(vertices);
  const m = ellipseMetrics(input);
  const bearings: number[] = [];
  const radii: number[] = [];
  for (let k = 0; k < vertices; k++) {
    const b = normalizeDeg(m.headingDeg + (360 * k) / vertices);
    bearings.push(b);
    radii.push(ellipseRadiusKm(m, b));
  }
  return { ...m, polygon: polygonFromRadii(input.start, bearings, radii) };
}
