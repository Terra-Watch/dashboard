/** Active fires: the shapes the API returns and the small pure helpers the pages share (tested in unit/fires.unit.ts). Everything is observed from satellite detections; nothing predicts where or when. */
import type { MapPolygon } from '../map/geojson';

export type Status = 'growing' | 'steady' | 'new' | 'out';
export type Place = { name: string; kind: string; lat: number; lon: number; km: number; bearing: string; on_side: boolean };
export type Pass = { t: string; n: number; n_new: number; area_km2: number };
export type Fire = {
  id: string; lat: number; lon: number; bbox: [number, number, number, number]; first_seen: string; last_seen: string; age_h: number; n_det: number; n_passes: number; area_km2: number; frp_sum: number;
  status: Status; kind: 'likely' | 'unconfirmed'; grew_toward: string | null; grew_deg: number | null; passes: Pass[]; places: Place[]; nearest: Place | null; multi: boolean; tasked: boolean; attention: number;
  mark?: { status: string; at: string };
};
export type Board = { generated_at: string; window_h: number; counts: { active: number; growing: number; near_village: number; no_task: number; single: number }; items: Fire[] };
export type Footprint = { t: string; rings: Array<Array<[number, number]>> };
export type FireDetail = Fire & { footprints: Footprint[]; detections: Array<{ t: string; lat: number; lon: number; frp: number | null }>; marks: Array<{ status: string; note: string; at: string }>; stations: Array<{ id: number; name: string; km: number }>; note: string };
export type MarkStatus = 'burning' | 'handled' | 'out' | 'not_forest_fire';

type T = (key: string, fallback: string, opts?: Record<string, unknown>) => string;
const WORD: Record<string, string> = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
export const pointWord = (p: string, t: T): string => t(`fires.dir.${p}`, WORD[p] ?? p);

export function statusName(s: Status, t: T): string {
  return s === 'growing' ? t('fires.st_growing', 'Growing') : s === 'steady' ? t('fires.st_steady', 'Steady') : s === 'new' ? t('fires.st_new', 'New') : t('fires.st_out', 'Probably out');
}

/** Duration of a fire in words: "a few hours", "1 day", "3 days". */
export function spanWords(f: Pick<Fire, 'first_seen' | 'last_seen'>, t: T): string {
  const h = (Date.parse(f.last_seen) - Date.parse(f.first_seen)) / 3_600_000;
  if (h < 6) return t('fires.span_hours', 'a few hours');
  const d = Math.round(h / 24);
  return d <= 1 ? t('fires.span_day', 'about a day') : t('fires.span_days', '{{n}} days', { n: d });
}

/** "near Pathara" when a named place is close, else the coordinates. */
export function fireName(f: Pick<Fire, 'nearest' | 'lat' | 'lon'>, t: T): string {
  return f.nearest ? t('fires.near', 'near {{name}}', { name: f.nearest.name }) : `${f.lat.toFixed(2)}°N ${f.lon.toFixed(2)}°E`;
}

/** What has happened, in observed facts only. */
export function happenedWords(f: Fire, t: T): string {
  const base = t('fires.happened', 'Seen {{passes}} times over {{span}}, about {{area}} km² so far.', { passes: f.n_passes, span: spanWords(f, t), area: f.area_km2 });
  const grew = f.status === 'growing' && f.grew_toward ? ` ${t('fires.grew_toward', 'At the last look it had grown toward the {{where}}.', { where: pointWord(f.grew_toward, t) })}` : f.status === 'growing' ? ` ${t('fires.grew', 'At the last look it had grown.')}`
    : f.status === 'steady' ? ` ${t('fires.did_not_grow', 'At the last look it had not grown.')}` : f.status === 'out' ? ` ${t('fires.not_seen', 'Not seen on the last passes: probably out.')}` : '';
  return base + grew;
}

/** The nearest named place, with its distance from the edge of the fire and whether it lies on the side the fire grew toward. */
export function nearestWords(f: Pick<Fire, 'nearest'>, t: T): string | null {
  const n = f.nearest; if (!n) return null;
  const base = t('fires.nearest', '{{name}} ({{kind}}), {{km}} km from the fire edge', { name: n.name, kind: t(`outlook.kind.${n.kind}`, n.kind), km: n.km });
  return n.on_side ? `${base}, ${t('fires.on_side', 'on the side it grew toward')}` : base;
}

export function statusLine(c: Board['counts'], t: T): string {
  return t('fires.status_line', 'Active now {{a}} · growing {{g}} · within 2 km of a village {{v}} · no check yet {{n}}', { a: c.active, g: c.growing, v: c.near_village, n: c.no_task });
}

/** A message to forward to villages and guards. */
export function warnText(f: Fire, t: T): string {
  const near = f.places.slice(0, 4).map(p => p.name).join(', ');
  return [t('fires.warn_head', 'Forest fire seen by satellite {{where}}: {{status}}.', { where: fireName(f, t), status: statusName(f.status, t).toLowerCase() }),
    f.grew_toward ? t('fires.warn_side', 'It was last seen spreading toward the {{where}}.', { where: pointWord(f.grew_toward, t) }) : '',
    near ? t('fires.warn_places', 'Places near it: {{places}}.', { places: near }) : '', t('fires.warn_advice', 'Keep away from the forest edge, do not light fires, and tell the forest office if you see flames or smoke.')].filter(Boolean).join('\n');
}

/** The map pieces of one fire up to pass `upto`: each pass's footprint holds only the cells it added. Everything before the newest pass is the fire so far (solid red); what the newest pass added is bright orange. */
export function firePolygons(footprints: Footprint[], upto: number): MapPolygon[] {
  const last = Math.min(upto, footprints.length - 1);
  return footprints.slice(0, last + 1).flatMap((fp, k) => fp.rings.map((ring, i) => ({ id: `fp-${k}-${i}`, ring, tone: (last > 0 && k === last ? 'grew' : 'fire') as MapPolygon['tone'] })));
}

export function bearingOf(fromLat: number, fromLon: number, toLat: number, toLon: number): number {
  const x = (toLon - fromLon) * Math.cos(((fromLat + toLat) / 2) * Math.PI / 180), y = toLat - fromLat;
  return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
}
