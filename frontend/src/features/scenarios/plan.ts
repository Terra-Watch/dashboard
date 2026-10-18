import { bandsAtHours, DEFAULT_ENVELOPE_HOURS, haversineKm, type BandSet, type GeoPolygon, type LatLon, type ScenarioInputs, type Uncertainty } from './engine/index.ts';

/** What the planner types. Every field starts empty: nothing here has a default, so no invented number can enter a plan. */
export type PlanForm = { ros: string; windKmh: string; windFrom: string; hours: string; speedPct: string; dirDeg: string; rosPct: string };
export const EMPTY_FORM: PlanForm = { ros: '', windKmh: '', windFrom: '', hours: '', speedPct: '', dirDeg: '', rosPct: '' };
export type PlanErrors = Partial<Record<keyof PlanForm, string>>;
export type ParsedPlan = { inputs: ScenarioInputs; uncertainty: Uncertainty; hours: number[] };

const num = (raw: string): number => (raw.trim() === '' ? NaN : Number(raw));

/** Turn the typed values into engine inputs, or say in words what is wrong. Percent values are typed as 0–99 and become fractions. */
export function parsePlan(form: PlanForm, start: LatLon): { ok: true; plan: ParsedPlan } | { ok: false; errors: PlanErrors } {
  const errors: PlanErrors = {};
  const ros = num(form.ros), wind = num(form.windKmh), from = num(form.windFrom), hours = num(form.hours);
  const sp = num(form.speedPct), dd = num(form.dirDeg), rp = num(form.rosPct);
  if (!(ros > 0)) errors.ros = 'Type the head-fire rate of spread in km/h. It must be above zero.';
  if (!(wind >= 0)) errors.windKmh = 'Type the wind speed in km/h (0 or more).';
  if (!(from >= 0 && from <= 360)) errors.windFrom = 'Type the direction the wind blows from, 0 to 360 degrees.';
  if (!DEFAULT_ENVELOPE_HOURS.includes(hours)) errors.hours = 'Choose how many hours to show.';
  if (!(sp >= 0 && sp < 100)) errors.speedPct = 'Type how uncertain the wind speed is, 0 to 99 per cent.';
  if (!(dd >= 0 && dd <= 180)) errors.dirDeg = 'Type how uncertain the wind direction is, 0 to 180 degrees.';
  if (!(rp >= 0 && rp < 100)) errors.rosPct = 'Type how uncertain the rate of spread is, 0 to 99 per cent.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    plan: {
      inputs: { start, headRosKmh: ros, schedule: [{ fromHour: 0, windKmh: wind, windFromDeg: from === 360 ? 0 : from }] },
      uncertainty: { windSpeedPct: sp / 100, windDirDeg: dd, rosPct: rp / 100 },
      hours: DEFAULT_ENVELOPE_HOURS.filter(h => h <= hours),
    },
  };
}

export const runPlan = (plan: ParsedPlan): BandSet[] => bandsAtHours(plan.inputs, plan.uncertainty, plan.hours);

const reach = (start: LatLon, polygon: GeoPolygon): number => Math.max(...polygon.coordinates[0].map(([lon, lat]) => haversineKm(start, { lat, lon })));

export type ReachRow = { hour: number; innerKm: number; nominalKm: number; outerKm: number };
/** Farthest distance from the ignition point at each hour, for the inner band, the typed inputs and the outer band. */
export const reachTable = (start: LatLon, bands: readonly BandSet[]): ReachRow[] =>
  bands.map(b => ({ hour: b.hour, innerKm: reach(start, b.inner), nominalKm: reach(start, b.nominal), outerKm: reach(start, b.outer) }));

/** A run is outdated when anything typed has changed since, or its wind is older than the limit (in minutes) when the wind came from a reading. */
export const sameInputs = (a: PlanForm, b: PlanForm): boolean => (Object.keys(a) as Array<keyof PlanForm>).every(k => a[k].trim() === b[k].trim());
export function isOutdated(ran: { form: PlanForm; windAt?: string | null } | null, current: PlanForm, staleMinutes: number | null, now: number = Date.now()): boolean {
  if (!ran) return false;
  if (!sameInputs(ran.form, current)) return true;
  if (ran.windAt && staleMinutes) { const at = Date.parse(ran.windAt); if (Number.isFinite(at) && now - at > staleMinutes * 60_000) return true; }
  return false;
}

export const msToKmh = (ms: number): number => Math.round(ms * 3.6 * 10) / 10;
