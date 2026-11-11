import type { MapPoint, MapPolygon } from '../map/geojson';

export type Summary = { bearing: string; bearing_deg: number; cover: 'tree' | 'shrub' | 'grass' | 'crop'; cover_share: number; uphill_share: number | null; slope_deg: number };
export type BandFacts = { area_km2: number; people: number; cover: Record<string, number> };
export type Place = { name: string; kind: string; band: number; distance_km: number; bearing: string; lon: number; lat: number };
export type Affected = { bands: Record<string, BandFacts>; places: { by_band: Record<string, Record<string, number>> }; nearest_settlement: Place | null; roads_in_bands: number; road_names: string[]; models: number };
export type Horizon = { file: string; burned_file?: string; places_file?: string; roads_file?: string; cells_scored: number; bands: Record<string, number>; summary?: Summary; affected?: Affected };
export type Check = { burned_km2: number; top_band_km2: number; top_band_capture: number; top_band_precision: number; nearest_capture: number; three_bands_km2: number; three_bands_capture: number };
export type Fire = { check?: Check; event: string; lat: number; lon: number; state?: string; n_detections: number; first_detection: string; last_detection: string; frp_sum: number; overlay_file?: string; horizons?: Record<string, Horizon> };
/** The ranking as a heat picture and a hillshade picture (data URLs), with the corners they are placed at: top-left, top-right, bottom-right, bottom-left, each [lon, lat]. */
export type Overlay = { coordinates: [[number, number], [number, number], [number, number], [number, number]]; heat: string; terrain: string };
export type Overall = { fires: number; burned_km2_median: number; top_band_km2_median: number; top_band_capture_median: number; nearest_capture_median: number; share_capture_80: number; share_capture_under_30: number; share_better_than_nearest: number; three_bands_km2_median: number; three_bands_capture_median: number };
export type Skill = { horizons: Record<string, { model_iou: number; baseline_iou: number; model_direction_auc: number; baseline_direction_auc: number; cases: number }>; source?: string; check?: Overall };
export type Run = { run: string; mode: 'replay' | 'live'; at: string; model_tag?: string; outlook?: string; fires: Fire[]; note: string; skill: Skill | null };
type Ring = Array<[number, number]>;
type Bands = { features: Array<{ properties: { band: number }; geometry: { type: string; coordinates: Ring[][] } }> };

/** Band 3 (highest) is drawn strongest, band 1 (moderate) lightest. Colour is never the only cue: the page also lists the bands in words. */
const TONE = { 3: 'cell', 2: 'warning', 1: 'advisory' } as const;
export const BAND_ORDER = [3, 2, 1] as const;

/** One polygon per outer ring (the map draws single rings; holes are shown filled, which only over-marks a few cells inside a band). */
export function bandPolygons(bands: Bands, id: string): MapPolygon[] {
  return bands.features.flatMap(f => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates as unknown as Ring[]])
    .map((poly, i) => ({ id: `${id}-b${f.properties.band}-${i}`, ring: poly[0], tone: TONE[f.properties.band as 1 | 2 | 3] })));
}

/** The burned cells MODIS later showed, drawn as a dashed outline (archived fires only). */
export function burnedPolygons(g: { features: Array<{ geometry: { type: string; coordinates: Ring[][] } }> }, id: string): MapPolygon[] {
  return g.features.flatMap(f => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates as unknown as Ring[]]).map((poly, i) => ({ id: `${id}-burned-${i}`, ring: poly[0], tone: 'envelope' as const })));
}

/** The fire at the start: one outline around the cells within 190 m of its detections. */
export function footprintPolygons(g: { features: Array<{ geometry: { type: string; coordinates: Ring[][] } }> }, id: string): MapPolygon[] {
  return g.features.flatMap(f => (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates as unknown as Ring[]]).map((poly, i) => ({ id: `${id}-start-${i}`, ring: poly[0], tone: 'observed' as const })));
}

type Coll = { features: Array<{ geometry: { type: string; coordinates: unknown }; properties: Record<string, unknown> }> };
/** Named places from OpenStreetMap as map points (symbol 'task' is the neutral pin; the legend names them). */
export function placePoints(c: Coll, id: string): Array<MapPoint & { place: Place }> {
  return c.features.map((f, i) => { const [lon, lat] = f.geometry.coordinates as [number, number]; const p = f.properties as unknown as Place; return { id: `${id}-pl${i}`, lat, lon, symbol: 'village' as const, label: p.name, place: { ...p, lon, lat } }; });
}
export function roadLines(c: Coll, id: string) {
  return c.features.map((f, i) => ({ id: `${id}-rd${i}`, coords: f.geometry.coordinates as Array<[number, number]>, tone: 'road' as const }));
}

export function pixelPoints(pixels: { features: Array<{ geometry: { coordinates: [number, number] } }> }, id: string): MapPoint[] {
  return pixels.features.map((f, i) => ({ id: `${id}-p${i}`, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], symbol: 'signal' as const }));
}

type T = (key: string, fallback: string, opts?: Record<string, unknown>) => string;
const pct = (x: number): number => Math.round(x * 100);

/** One fire: how much of what burned the top band covered, against choosing the cells nearest the fire first over the same area. A big fire is said plainly to be bigger than the band. */
export function compareWords(c: Check, t: T): string[] {
  const head = c.top_band_capture >= 0.3
    ? t('outlook.cmp_good', 'Of the {{burned}} km² that burned, the top band ({{top}} km²) covers {{pct}}%. Choosing the cells nearest the fire first, over the same area, would have covered {{near}}%.', { burned: c.burned_km2, top: c.top_band_km2, pct: pct(c.top_band_capture), near: pct(c.nearest_capture) })
    : t('outlook.cmp_big', 'A large fire: {{burned}} km² burned, much more than the top band ({{top}} km²). The top band covers {{pct}}% of it, the three bands together ({{b3}} km²) {{pct3}}%.', { burned: c.burned_km2, top: c.top_band_km2, pct: pct(c.top_band_capture), b3: c.three_bands_km2, pct3: pct(c.three_bands_capture) });
  return [head, t('outlook.cmp_precision', '{{pct}}% of the top band burned.', { pct: pct(c.top_band_precision) })];
}

/** All test fires: what a typical fire looks like against the outlook, including how often it falls short. */
export function overallWords(o: Overall, t: T): string[] {
  return [
    t('outlook.all_head', 'Across all {{n}} test fires from 2025, a typical fire burned {{burned}} km². The top band (about {{top}} km²) covered {{cap}}% of it; choosing the nearest cells first covered {{near}}%.', { n: o.fires, burned: o.burned_km2_median, top: o.top_band_km2_median, cap: pct(o.top_band_capture_median), near: pct(o.nearest_capture_median) }),
    t('outlook.all_spread', 'It covered 80% or more of what burned in {{hi}}% of the fires and under 30% in {{lo}}%, mostly large fires that burned more than the band holds. It did better than nearest-first in {{better}}% of the fires.', { hi: pct(o.share_capture_80), lo: pct(o.share_capture_under_30), better: pct(o.share_better_than_nearest) }),
    t('outlook.all_three', 'The three bands together (about {{b3}} km²) covered {{c3}}% of what burned, but that area is several times what a typical fire burns, so it is a ranking and not a forecast of the burned area.', { b3: o.three_bands_km2_median, c3: pct(o.three_bands_capture_median) }),
  ];
}
