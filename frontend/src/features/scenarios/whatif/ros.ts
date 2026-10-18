/**
 * Head rate of spread and fire shape for one cell (Rothermel-style structure,
 * UNCALIBRATED coefficients from fuels.ts).
 *
 * UNITS: rates in metres/minute, distances in metres, wind in km/h, angles in
 * degrees at the API and unit vectors (east, north) inside.
 *
 * EQUATIONS
 *   phi_w = k_w (U / 10)^1.2             wind factor, U = midflame wind km/h
 *   phi_s = k_s min(tan(slope), 1.5)^2   slope factor, tan(slope) from the elevation gradient
 *   Vector addition (Rothermel 1972 style): the wind term points downwind
 *   (windFrom + 180), the slope term points uphill (direction of steepest ascent,
 *   gradient of elevation). The effective term is the vector sum
 *       phi_e = phi_w * d_wind + phi_s * d_up        |phi_e| = effective factor
 *   Head direction = direction of phi_e.
 *   R_head = R0 (1 + |phi_e|)            R0 = flat, no-wind rate of the fuel
 *   Effective wind: the wind speed that alone would give |phi_e|:
 *       U_eff = 10 (|phi_e| / k_w)^(1/1.2) km/h
 *   LB = lengthToBreadth(U_eff)          Anderson (1983), from engine/ellipse.ts
 *                                        (takes km/h, converts to m/s inside)
 *   e  = sqrt(LB^2 - 1) / LB
 *   Rate along direction phi from the head, ignition at the REAR focus:
 *       R(phi) = R_head (1 - e) / (1 - e cos phi)
 *   (phi = 0 -> R_head, phi = 180 -> R_head (1-e)/(1+e).)
 */
import { lengthToBreadth } from '../engine/ellipse.ts';
import { FUEL_CLASSES } from './fuels.ts';

export const WIND_REF_KMH = 10;
export const WIND_EXPONENT = 1.2;
export const MAX_TAN_SLOPE = 1.5;

/** Local spread parameters of one cell. */
export interface CellSpread {
  /** Head rate, m/min. */
  headMPerMin: number;
  /** Unit vector of the head direction, east component. */
  headE: number;
  /** Unit vector of the head direction, north component. */
  headN: number;
  /** Eccentricity of the spread ellipse (0 = circle). */
  e: number;
  /** Effective wind speed km/h (for display). */
  effectiveWindKmh: number;
}

/** Wind factor phi_w for fuel class `fuelId` and wind speed km/h. */
export function windFactor(fuelId: number, speedKmh: number): number {
  const f = FUEL_CLASSES[fuelId];
  if (!f || !f.burnable || speedKmh <= 0) return 0;
  return f.windSensitivity * Math.pow(speedKmh / WIND_REF_KMH, WIND_EXPONENT);
}

/** Slope factor phi_s for a tangent of slope angle (>= 0). */
export function slopeFactor(fuelId: number, tanSlope: number): number {
  const f = FUEL_CLASSES[fuelId];
  if (!f || !f.burnable) return 0;
  const t = Math.min(Math.max(tanSlope, 0), MAX_TAN_SLOPE);
  return f.slopeSensitivity * t * t;
}

/**
 * Combine wind and slope into the local spread parameters.
 * @param gradE  elevation gradient, east component (m per m, positive = rises to the east)
 * @param gradN  elevation gradient, north component
 */
export function cellSpread(
  fuelId: number,
  windSpeedKmh: number,
  windFromDeg: number,
  gradE: number,
  gradN: number,
  out: CellSpread,
): CellSpread {
  const f = FUEL_CLASSES[fuelId];
  const pw = windFactor(fuelId, windSpeedKmh);
  const tanS = Math.hypot(gradE, gradN);
  const ps = slopeFactor(fuelId, tanS);
  // Downwind unit vector (east, north); uphill unit vector from the gradient.
  const b = ((windFromDeg + 180) * Math.PI) / 180;
  let vx = pw * Math.sin(b);
  let vy = pw * Math.cos(b);
  if (tanS > 1e-12) {
    vx += (ps * gradE) / tanS;
    vy += (ps * gradN) / tanS;
  }
  const mag = Math.hypot(vx, vy);
  out.headMPerMin = f.r0MPerMin * (1 + mag);
  if (mag > 1e-12) {
    out.headE = vx / mag;
    out.headN = vy / mag;
    const ueff = WIND_REF_KMH * Math.pow(mag / f.windSensitivity, 1 / WIND_EXPONENT);
    const lb = lengthToBreadth(ueff);
    out.e = Math.sqrt(Math.max(0, lb * lb - 1)) / lb;
    out.effectiveWindKmh = ueff;
  } else {
    out.headE = 0;
    out.headN = 1;
    out.e = 0;
    out.effectiveWindKmh = 0;
  }
  return out;
}

export function newCellSpread(): CellSpread {
  return { headMPerMin: 0, headE: 0, headN: 1, e: 0, effectiveWindKmh: 0 };
}

/** R(phi) given cos(phi) between the direction and the head. */
export function rateAlong(headMPerMin: number, e: number, cosPhi: number): number {
  return (headMPerMin * (1 - e)) / (1 - e * cosPhi);
}
