import type { Rung } from '../../ui/ladder';

export type SymbolKind = 'signal' | 'report' | 'verified' | 'responding' | 'contained' | 'closed' | 'officer' | 'me' | 'task';
export type MapPoint = { id: string; lat: number; lon: number; symbol: SymbolKind; label?: string; ageMinutes?: number };
export type MapPolygon = { id: string; ring: Array<[number, number]>; tone: 'cell' | 'advisory' | 'warning' | 'envelope' | 'band' | 'observed'; hour?: number; label?: string };
export type RiskCell = { id: number; lat: number; lon: number; rank_percentile: number; band: string; state: string };

export type FeatureCollection = { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; id?: string | number; properties: Record<string, unknown>; geometry: { type: 'Point'; coordinates: [number, number] } | { type: 'Polygon'; coordinates: Array<Array<[number, number]>> } }> };

export const SYMBOL_OF_RUNG: Record<Rung, SymbolKind> = { signal: 'signal', report: 'report', verified: 'verified', responding: 'responding', contained: 'contained', closed: 'closed' };

/** Older satellite signals fade: full strength for the first hours, never below a visible floor. */
export function freshness(ageMinutes: number | undefined): number {
  if (ageMinutes === undefined || !Number.isFinite(ageMinutes)) return 1;
  return Math.max(0.35, 1 - ageMinutes / (72 * 60));
}

export function pointsToGeoJson(points: readonly MapPoint[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180).map(p => ({
      type: 'Feature', id: p.id, properties: { id: p.id, symbol: p.symbol, label: p.label ?? '', opacity: freshness(p.ageMinutes) },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  };
}

export function polygonsToGeoJson(polygons: readonly MapPolygon[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: polygons.filter(p => p.ring.length >= 3).map(p => {
      const ring = p.ring[0][0] === p.ring[p.ring.length - 1][0] && p.ring[0][1] === p.ring[p.ring.length - 1][1] ? p.ring : [...p.ring, p.ring[0]];
      return { type: 'Feature', id: p.id, properties: { id: p.id, tone: p.tone, hour: p.hour ?? 0, label: p.label ?? '' }, geometry: { type: 'Polygon', coordinates: [ring] } };
    }),
  };
}

export function boundsOf(points: ReadonlyArray<{ lat: number; lon: number }>): [[number, number], [number, number]] | null {
  const ok = points.filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!ok.length) return null;
  const lats = ok.map(p => p.lat), lons = ok.map(p => p.lon);
  const pad = ok.length === 1 ? 0.05 : 0.02;
  return [[Math.min(...lons) - pad, Math.min(...lats) - pad], [Math.max(...lons) + pad, Math.max(...lats) + pad]];
}

export function riskCellsToGeoJson(cells: readonly RiskCell[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: cells.filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lon) && Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180).map(c => ({
      type: 'Feature',
      id: c.id,
      properties: { id: c.id, rank_percentile: c.rank_percentile, band: c.band, state: c.state },
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
    })),
  };
}
