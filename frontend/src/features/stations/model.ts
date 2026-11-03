/** Lookout stations: the shapes the API returns and the small pure helpers the pages share (tested in unit/stations.unit.ts). */
import type { SymbolKind } from '../map/geojson';

export type StationStatus = 'online' | 'late' | 'offline' | 'never';
export type Station = {
  id: number; node_id: number; name: string; latitude: number; longitude: number; state: string; expected_interval_s: number; notes: string;
  status: StationStatus; age_s: number | null; last_heard: string | null;
  temp_c: number | null; humidity_pct: number | null; pm25: number | null; pm10: number | null; battery_mv: number | null;
  rssi: number | null; snr: number | null; hops: number | null; pm25_normal: number | null; pm25_vs_normal: number | null;
  last_sound: { kind: SoundKind; confidence: number; age_s: number } | null;
  distance_km?: number; bearing?: string;
};
export type SoundKind = 'chainsaw' | 'blast';
export type SoundEvent = { at: string; kind: SoundKind; confidence: number };
export type StationsResponse = { label: string; items: Station[] };
export type SeriesPoint = { t: string; pm25: number | null; pm10: number | null; temp_c: number | null; humidity_pct: number | null };
export type StationResponse = { label: string; station: Station; hours: number; series: SeriesPoint[]; sounds: SoundEvent[] };
export type Nearby = {
  hotspots: { count: number; items: Array<{ id: number; km: number; satellite: string; at: string; frp: number | null }> };
  incidents: { count: number; items: Array<{ id: number; km: number; status: string; source: string }> };
  stations: { count: number; items: Array<{ id: number; name: string; km: number; status: StationStatus; pm25: number | null }> };
};

/** A reading counts as "high" only when the station's own recent normal is known and the value is at least this many times above it. A display prompt, never an alert. */
export const HIGH_RATIO = 2;

export const isHigh = (s: Station): boolean => s.status === 'online' && s.pm25_vs_normal !== null && s.pm25_vs_normal >= HIGH_RATIO;

export function symbolOf(s: Station): SymbolKind {
  return s.status === 'offline' || s.status === 'never' ? 'station_off' : s.status === 'late' ? 'station_late' : isHigh(s) ? 'station_high' : 'station_ok';
}

/** "8 s ago", "12 min ago", "3 h ago", "2 d ago"; null when never heard. */
export function ageLabel(seconds: number | null): string | null {
  if (seconds === null) return null;
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

export const fmt = (v: number | null | undefined, digits = 0, unit = ''): string => (v === null || v === undefined ? '-' : `${v.toFixed(digits)}${unit}`);

export const counts = (items: Station[]) => ({ online: items.filter(s => s.status === 'online').length, late: items.filter(s => s.status === 'late').length,
  offline: items.filter(s => s.status === 'offline' || s.status === 'never').length, high: items.filter(isHigh).length });

/** Plain words for what a station's sound classifier reported. It is a classifier's guess, never a confirmed event. */
export const soundName = (k: SoundKind): string => (k === 'chainsaw' ? 'Chainsaw' : 'Gunshot or blast');
