import type { MapPoint, MapPolygon } from '../map/geojson';

export type Summary = { bearing: string; bearing_deg: number; cover: 'tree' | 'shrub' | 'grass' | 'crop'; cover_share: number; uphill_share: number | null; slope_deg: number };
export type BandFacts = { area_km2: number; people: number; cover: Record<string, number> };
export type Place = { name: string; kind: string; band: number; distance_km: number; bearing: string; lon: number; lat: number };
export type Affected = { bands: Record<string, BandFacts>; places: { by_band: Record<string, Record<string, number>> }; nearest_settlement: Place | null; roads_in_bands: number; road_names: string[]; models: number };
export type Horizon = { file: string; burned_file?: string; places_file?: string; roads_file?: string; cells_scored: number; bands: Record<string, number>; summary?: Summary; affected?: Affected };
export type Fire = { event: string; lat: number; lon: number; state?: string; n_detections: number; first_detection: string; last_detection: string; frp_sum: number; overlay_file?: string; horizons?: Record<string, Horizon> };
/** The ranking as a heat picture and a hillshade picture (data URLs), with the corners they are placed at: top-left, top-right, bottom-right, bottom-left, each [lon, lat]. */
export type Overlay = { coordinates: [[number, number], [number, number], [number, number], [number, number]]; heat: string; terrain: string };
export type Skill = { horizons: Record<string, { model_iou: number; baseline_iou: number; model_direction_auc: number; baseline_direction_auc: number; cases: number }>; source?: string };
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
  return c.features.map((f, i) => { const [lon, lat] = f.geometry.coordinates as [number, number]; const p = f.properties as unknown as Place; return { id: `${id}-pl${i}`, lat, lon, symbol: 'task' as const, label: p.name, place: { ...p, lon, lat } }; });
}
export function roadLines(c: Coll, id: string) {
  return c.features.map((f, i) => ({ id: `${id}-rd${i}`, coords: f.geometry.coordinates as Array<[number, number]>, tone: 'road' as const }));
}

export function pixelPoints(pixels: { features: Array<{ geometry: { coordinates: [number, number] } }> }, id: string): MapPoint[] {
  return pixels.features.map((f, i) => ({ id: `${id}-p${i}`, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], symbol: 'signal' as const }));
}
