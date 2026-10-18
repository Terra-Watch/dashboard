/**
 * Wind inputs: parsing, validation, hour-by-hour schedules and wind shifts.
 * Wind speed here is the MIDFLAME wind in km/h (what the ellipse model uses);
 * direction is meteorological (the direction the wind blows FROM, degrees).
 */
import { ScenarioInputError, isFiniteNumber, normalizeDeg } from './units.ts';

/** One step of an hour-by-hour wind schedule, valid from `fromHour` until the next entry. */
export interface WindEntry {
  fromHour: number;
  windKmh: number;
  windFromDeg: number;
}

/** A contiguous period of constant wind. */
export interface WindSegment {
  fromHour: number;
  toHour: number;
  windKmh: number;
  windFromDeg: number;
}

/**
 * Parse typed wind values (numbers or numeric strings). Direction 360 is
 * stored as 0. Throws a typed error for empty, non-numeric, negative speed or
 * out-of-range direction.
 */
export function parseWindInput(raw: { windKmh: unknown; windFromDeg: unknown }): {
  windKmh: number;
  windFromDeg: number;
} {
  const num = (v: unknown): number =>
    typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  const windKmh = num(raw?.windKmh);
  const dir = num(raw?.windFromDeg);
  if (!isFiniteNumber(windKmh) || windKmh < 0) throw new ScenarioInputError('invalid_wind_speed', 'windKmh');
  if (!isFiniteNumber(dir) || dir < 0 || dir > 360) throw new ScenarioInputError('invalid_wind_direction', 'windFromDeg');
  return { windKmh, windFromDeg: dir === 360 ? 0 : dir };
}

/**
 * Validate a schedule: non-empty, first entry at hour 0, strictly increasing
 * hours, valid speeds and directions. Returns a copy (input is not mutated).
 */
export function validateWindSchedule(schedule: readonly WindEntry[]): WindEntry[] {
  if (!Array.isArray(schedule) || schedule.length === 0) {
    throw new ScenarioInputError('invalid_schedule', 'schedule', 'empty');
  }
  const out: WindEntry[] = [];
  schedule.forEach((e, i) => {
    if (!isFiniteNumber(e?.fromHour) || e.fromHour < 0) throw new ScenarioInputError('invalid_schedule', `schedule[${i}].fromHour`);
    if (i === 0 && e.fromHour !== 0) throw new ScenarioInputError('invalid_schedule', 'schedule[0].fromHour', 'must be 0');
    if (i > 0 && e.fromHour <= schedule[i - 1].fromHour) throw new ScenarioInputError('invalid_schedule', `schedule[${i}].fromHour`, 'not increasing');
    const p = parseWindInput({ windKmh: e.windKmh, windFromDeg: e.windFromDeg });
    out.push({ fromHour: e.fromHour, ...p });
  });
  return out;
}

/** Wind in force at `hour`: the last entry whose fromHour <= hour. */
export function windAt(schedule: readonly WindEntry[], hour: number): WindEntry {
  const s = validateWindSchedule(schedule);
  if (!isFiniteNumber(hour) || hour < 0) throw new ScenarioInputError('invalid_hours', 'hour');
  let cur = s[0];
  for (const e of s) if (e.fromHour <= hour) cur = e;
  return cur;
}

/**
 * "Wind turns to X at hour h": returns a new schedule with an entry at
 * `atHour` whose direction is `windFromDeg` (the new FROM direction) and
 * speed `windKmh` if given, else the speed in force at that hour. Later
 * entries are kept. An existing entry at the same hour is replaced.
 */
export function windShift(
  schedule: readonly WindEntry[],
  shift: { atHour: number; windFromDeg: number; windKmh?: number },
): WindEntry[] {
  const base = validateWindSchedule(schedule);
  if (!isFiniteNumber(shift.atHour) || shift.atHour < 0) throw new ScenarioInputError('invalid_hours', 'atHour');
  const now = windAt(base, shift.atHour);
  const p = parseWindInput({
    windKmh: shift.windKmh ?? now.windKmh,
    windFromDeg: shift.windFromDeg,
  });
  const next = base.filter((e) => e.fromHour !== shift.atHour);
  next.push({ fromHour: shift.atHour, ...p });
  next.sort((a, b) => a.fromHour - b.fromHour);
  return next;
}

/** Rotate a wind direction by `deltaDeg`, result in [0, 360). */
export function rotateWind(windFromDeg: number, deltaDeg: number): number {
  return normalizeDeg(windFromDeg + deltaDeg);
}

/**
 * Split [0, hours] into constant-wind segments. Adjacent entries with equal
 * speed and direction are merged so a constant wind is one segment.
 */
export function windSegments(schedule: readonly WindEntry[], hours: number): WindSegment[] {
  const s = validateWindSchedule(schedule);
  if (!isFiniteNumber(hours) || hours <= 0) throw new ScenarioInputError('invalid_hours', 'hours');
  const segs: WindSegment[] = [];
  s.forEach((e, i) => {
    if (e.fromHour >= hours) return;
    const to = Math.min(hours, i + 1 < s.length ? s[i + 1].fromHour : hours);
    const last = segs[segs.length - 1];
    if (last && last.windKmh === e.windKmh && last.windFromDeg === e.windFromDeg) last.toHour = to;
    else segs.push({ fromHour: e.fromHour, toHour: to, windKmh: e.windKmh, windFromDeg: e.windFromDeg });
  });
  return segs;
}
