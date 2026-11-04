import type { MapPoint, MapPolygon } from '../map/geojson';

export type Fire = { event: string; lat: number; lon: number; n_detections: number; first_detection: string; last_detection: string; frp_sum: number };
export type Skill = { horizons: Record<string, { model_iou: number; baseline_iou: number; model_direction_auc: number; baseline_direction_auc: number; cases: number }>; source?: string };
export type Run = { run: string; mode: 'replay' | 'live'; at: string; fires: Fire[]; note: string; skill: Skill | null };
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

export function pixelPoints(pixels: { features: Array<{ geometry: { coordinates: [number, number] } }> }, id: string): MapPoint[] {
  return pixels.features.map((f, i) => ({ id: `${id}-p${i}`, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], symbol: 'signal' as const }));
}
