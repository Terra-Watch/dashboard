/** Area forecast: the shapes the API returns and the small pure helpers both pages share (tested in unit/forecast.unit.ts).
 *  A level comes from the calibrated chance that a fire is detected in the area tomorrow. It is not a ranking of areas against each other. */
import type { MapPolygon } from '../map/geojson';

export type LevelId = 'none' | 'moderate' | 'high' | 'extreme';
export const LEVELS: readonly LevelId[] = ['extreme', 'high', 'moderate', 'none'];
export type Place = { name: string; kind: string; km: number; from_place: string | null } | null;
export type Look = { cell_id: number; lat: number; lon: number; chance: number; place: Place };
export type Area = {
  id: number; name: string; state: string; lat: number; lon: number; bbox: [number, number, number, number]; cells: number;
  chance: number; expected_fires: number; usual_fires: number | null; usual_chance: number | null; level: LevelId; reliable: boolean;
  change?: number; look?: Look[]; fire_detected?: boolean; burning_now?: { likely?: number; known_source?: number; unconfirmed?: number };
};
export type Action = { id: string; min_chance: number; text: string };
export type Yesterday = { date: string; areas_with_fire: number; in_high_or_extreme: number; areas_rated_high_or_extreme: number; of_those_with_fire: number };
export type Outcome = Omit<Yesterday, 'date'>;
export type Forecast = {
  date: string; mode: 'live' | 'replay'; issued_at: string; levels: Array<{ id: LevelId; min_chance: number }>; actions: Action[]; label: string; model: Record<string, unknown>;
  week_of_year: number; areas: Area[]; summary: Record<LevelId, number>; areas_scored: number; scope: 'all' | 'community' | 'state'; note: string; yesterday?: Yesterday; outcome?: Outcome;
};

type T = (key: string, fallback: string, opts?: Record<string, unknown>) => string;

export const levelRank = (l: LevelId): number => LEVELS.length - 1 - LEVELS.indexOf(l);
export const isActive = (a: Area): boolean => a.level !== 'none';

export function levelName(l: LevelId, t: T): string {
  return l === 'extreme' ? t('forecast.level_extreme', 'Extreme') : l === 'high' ? t('forecast.level_high', 'High') : l === 'moderate' ? t('forecast.level_moderate', 'Moderate') : t('forecast.level_none', 'No rating');
}

/** The chance in plain words, rounded so it does not claim more than the model knows. */
export function chanceWords(c: number, t: T): string {
  if (c < 0.05) return t('forecast.chance_under5', 'less than 1 in 20');
  if (c < 0.1) return t('forecast.chance_under10', 'less than 1 in 10');
  if (c >= 0.9) return t('forecast.chance_over90', 'more than 9 in 10');
  const n = Math.round(c * 10);
  return t('forecast.chance_in_ten', 'about {{n}} in 10', { n });
}

/** Against what is usual for this week of the year (2019 to 2023). null when we have no usual for the area. */
export function vsUsual(expected: number, usual: number | null): 'below' | 'usual' | 'above' | 'far_above' | null {
  if (usual === null || usual === undefined || usual <= 0) return null;
  const r = expected / usual;
  return r < 0.7 ? 'below' : r <= 1.4 ? 'usual' : r <= 2.5 ? 'above' : 'far_above';
}

export function usualWords(a: Area, t: T): string | null {
  const v = vsUsual(a.expected_fires, a.usual_fires);
  if (!v) return null;
  const word = v === 'below' ? t('forecast.vs_below', 'below usual') : v === 'usual' ? t('forecast.vs_usual', 'about usual') : v === 'above' ? t('forecast.vs_above', 'above usual') : t('forecast.vs_far_above', 'far above usual');
  return t('forecast.usual_line', '{{word}} for this week (usual: {{u}})', { word, u: (a.usual_fires as number).toFixed(1) });
}

/** What the satellite has seen in the area in the last 24 hours, from the detection groups. null when nothing. Likely detections first; the others only as a note. */
export function burningWords(a: Area, t: T): string | null {
  const b = a.burning_now; if (!b) return null;
  const likely = b.likely ?? 0, other = (b.unconfirmed ?? 0) + (b.known_source ?? 0);
  if (!likely && !other) return null;
  return likely ? t('forecast.burning_likely', 'Burning now: {{n}} likely fire detections by satellite in the last 24 hours{{more}}.', { n: likely, more: other ? t('forecast.burning_more', ', and {{m}} more not confirmed', { m: other }) : '' })
    : t('forecast.burning_other', 'Satellite: {{m}} detections in the last 24 hours, none likely to be a forest fire.', { m: other });
}

export function changeWords(a: Area, t: T): string | null {
  if (a.change === undefined || Math.abs(a.change) < 0.05) return null;
  return a.change > 0 ? t('forecast.change_up', 'up from yesterday') : t('forecast.change_down', 'down from yesterday');
}

/** Actions suggested at this chance, each marked as triggered or not. The division edits its own table later; this is the default. */
export function actionsFor(a: Area, actions: Action[]): Array<Action & { on: boolean }> {
  return actions.map(x => ({ ...x, on: a.chance >= x.min_chance }));
}

/** A reason a person can check, from facts we have (season, change); never a guess about causes. */
export function seasonNote(a: Area, t: T): string | null {
  if (a.usual_chance === null || a.usual_chance === undefined) return null;
  const pct = Math.round(a.usual_chance * 100);
  return pct >= 20 ? t('forecast.season_note', 'In this week of the year there is a fire detected in this area on about {{pct}}% of days.', { pct }) : null;
}

/** Colour tone for the map: reuses the shared polygon tones. Weak-skill areas are drawn paler (a dashed envelope) so they do not look more certain than they are. */
export function toneOf(a: Area): MapPolygon['tone'] | null {
  if (a.level === 'none') return null;
  if (!a.reliable) return 'envelope';
  return a.level === 'extreme' ? 'cell' : a.level === 'high' ? 'warning' : 'advisory';
}

export function areaPolygons(areas: Area[], idPrefix = 'fa'): MapPolygon[] {
  return areas.flatMap(a => {
    const tone = toneOf(a);
    if (!tone) return [];
    const [w, s, e, n] = a.bbox;
    return [{ id: `${idPrefix}-${a.id}`, ring: [[w, s], [e, s], [e, n], [w, n], [w, s]] as Array<[number, number]>, tone }];
  });
}

/** "Today", "Tomorrow" or the date itself, against the reader's own calendar day (the forecast date is a calendar day). */
export function dayWord(date: string, t: T, now: Date = new Date()): string {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return date === iso(now) ? t('forecast.today', 'Today') : date === iso(tomorrow) ? t('forecast.tomorrow', 'Tomorrow') : date;
}

/** The dates to offer a ranger: today and tomorrow when the forecast has them, else just the newest. */
export function cardDates(dates: string[], latest: string, now: Date = new Date()): string[] {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const want = [iso(now), iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1))].filter(d => dates.includes(d));
  return want.length ? want : [latest];
}

export const bearingWord = (b: string | null): string => b ?? '';

export function placeLine(p: NonNullable<Place>): string {
  return `${p.name}${p.from_place ? ` · ${p.km} km ${p.from_place}` : ` · ${p.km} km`}`;
}

/** A short message to forward on WhatsApp or SMS to beat guards and village contacts. */
export function shareText(a: Area, date: string, t: T, actions: Action[]): string {
  const places = (a.look ?? []).map(l => l.place?.name).filter((n): n is string => !!n).slice(0, 4);
  const act = actionsFor(a, actions).filter(x => x.on).map(x => x.text);
  return [
    t('forecast.share_head', '{{date}} · {{name}}, {{state}}: fire danger tomorrow is {{level}} ({{chance}} chance a fire is seen in the area).', { date, name: a.name, state: a.state, level: levelName(a.level, t), chance: chanceWords(a.chance, t) }),
    places.length ? t('forecast.share_places', 'Places to check: {{places}}.', { places: places.join(', ') }) : '',
    act.length ? act.join(' ') : '',
  ].filter(Boolean).join('\n');
}

/** Summary line for yesterday's record: of the areas rated High or Extreme, how many had a fire. */
export function recordWords(y: Yesterday | undefined, t: T): string | null {
  if (!y || !y.areas_rated_high_or_extreme) return null;
  return t('forecast.record', 'Yesterday ({{date}}): a fire was detected in {{hit}} of the {{n}} areas rated High or Extreme, and {{found}} of the {{all}} areas with a fire were rated High or Extreme.', {
    date: y.date, hit: y.of_those_with_fire, n: y.areas_rated_high_or_extreme, found: y.in_high_or_extreme, all: y.areas_with_fire });
}

/** An archived day: what the satellite actually detected, against the levels the forecast gave. null when the day has no outcome (a live forecast). */
export function outcomeWords(o: Outcome | undefined, date: string, t: T): string | null {
  if (!o) return null;
  const share = o.areas_rated_high_or_extreme ? Math.round(100 * o.of_those_with_fire / o.areas_rated_high_or_extreme) : null;
  const missed = o.areas_with_fire - o.in_high_or_extreme;
  return t('forecast.outcome', 'What was detected on {{date}}: a fire was seen by satellite in {{all}} areas. Of the {{n}} areas rated High or Extreme, {{hit}} had a fire{{share}}; {{missed}} areas with a fire were rated lower.', {
    date, all: o.areas_with_fire, n: o.areas_rated_high_or_extreme, hit: o.of_those_with_fire, share: share === null ? '' : ` (${share}%)`, missed });
}

/** One line for an area on an archived day. */
export function fireSeenWords(a: Area, t: T): string | null {
  if (a.fire_detected === undefined) return null;
  return a.fire_detected ? t('forecast.fire_seen', 'A fire was detected in this area that day.') : t('forecast.fire_not_seen', 'No fire was detected in this area that day.');
}
