import type { Wind, WindSchedule } from './types.ts';

export const WIND_MAX_KMH = 60;
/** Above this speed the page asks the engine for 32 neighbours (ENGINE.md: 16 neighbours cut the tip of a strongly wind-driven fire). */
export const STRONG_WIND_KMH = 10;

export interface WindShift { afterH: number; speedKmh: number; fromDeg: number }
export interface WindCase {
  speedKmh: number;
  fromDeg: number;
  shift: WindShift | null;
}

export const CASE_IDS = ['A', 'B', 'C'] as const;
export type CaseId = (typeof CASE_IDS)[number];

export const clampSpeed = (v: number): number => (Number.isFinite(v) ? Math.min(WIND_MAX_KMH, Math.max(0, v)) : 0);

/** Degrees into [0, 360). */
export function normaliseDeg(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const m = v % 360;
  return m < 0 ? m + 360 : m;
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'] as const;
/** 16-point compass name of a bearing. */
export function compassName(deg: number): string {
  return POINTS[Math.round(normaliseDeg(deg) / 22.5) % 16];
}

/** The fire head moves toward the direction opposite to where the wind comes from. */
export const headBearing = (fromDeg: number): number => normaliseDeg(fromDeg + 180);

/** Engine wind input for one case: constant, or a two-step schedule when a shift is set and falls inside the run. */
export function windInputFor(c: WindCase, maxHours: number): Wind | WindSchedule {
  const first: Wind = { speedKmh: clampSpeed(c.speedKmh), fromDeg: normaliseDeg(c.fromDeg) };
  const s = c.shift;
  if (!s || !(s.afterH > 0) || s.afterH >= maxHours) return first;
  return { steps: [{ atHour: 0, wind: first }, { atHour: s.afterH, wind: { speedKmh: clampSpeed(s.speedKmh), fromDeg: normaliseDeg(s.fromDeg) } }] };
}

/** 32 neighbours when any wind in the case is strong, else 16. */
export function neighboursFor(c: WindCase, maxHours: number = Infinity): 16 | 32 {
  const strong = c.speedKmh > STRONG_WIND_KMH || (c.shift !== null && c.shift.afterH > 0 && c.shift.afterH < maxHours && c.shift.speedKmh > STRONG_WIND_KMH);
  return strong ? 32 : 16;
}

export function describeWind(c: WindCase): string {
  const base = `${round1(c.speedKmh)} km/h from ${Math.round(normaliseDeg(c.fromDeg))} degrees (${compassName(c.fromDeg)})`;
  if (!c.shift) return base;
  return `${base}, then ${round1(c.shift.speedKmh)} km/h from ${Math.round(normaliseDeg(c.shift.fromDeg))} degrees (${compassName(c.shift.fromDeg)}) after ${round1(c.shift.afterH)} h`;
}

export const round1 = (v: number): number => Math.round(v * 10) / 10;
