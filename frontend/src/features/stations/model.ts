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
  smoke?: 'normal' | 'rising' | 'haze' | 'damp' | 'watch' | 'unknown'; statement?: Statement;
};
export type Tone = 'gap' | 'check' | 'watch' | 'ok';
export type Statement = { key: string; params: { age_s?: number | null; minutes?: number; n?: number }; tone: Tone };
export type SoundKind = 'chainsaw' | 'blast' | 'fire';
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
export const soundName = (k: SoundKind): string => (k === 'chainsaw' ? 'Chainsaw' : k === 'fire' ? 'Open fire' : 'Gunshot or blast');

type T = (key: string, fallback: string, opts?: Record<string, unknown>) => string;

/** One plain sentence on what the station says now. The wording is a prompt to look, never a claim of fire. */
export function statementWords(s: Station, t: T): string {
  const k = s.statement?.key ?? 'normal'; const p = s.statement?.params ?? {}; const age = ageLabel(p.age_s ?? s.age_s) ?? '';
  switch (k) {
    case 'never': return t('stations.st_never', 'Nothing has been heard from this station yet.');
    case 'silent': return t('stations.st_silent', 'Silent for {{age}}. Treat it as not reporting, not as quiet.', { age });
    case 'late': return t('stations.st_late', 'Late: last heard {{age}} ago.', { age });
    case 'chainsaw': return t('stations.st_chainsaw', 'Heard a chainsaw {{n}} times in the last 30 minutes. Someone may be cutting trees.', { n: p.n ?? 2 });
    case 'blast': return t('stations.st_blast', 'Heard a gunshot or blast in the last hour.');
    case 'smoke_rising': return t('stations.st_smoke_rising', 'Smoke particles have been well above this station\'s normal for {{minutes}} minutes, and the stations near it are not up. Worth a look.', { minutes: p.minutes ?? 20 });
    case 'haze': return t('stations.st_haze', 'Smoke particles are up, but so are the stations around it. Likely regional haze, not a fire at this spot.');
    case 'smoke_up': return t('stations.st_smoke_up', 'Smoke particles are above normal, not for long yet. Watching.');
    case 'fire_sound': return t('stations.st_fire_sound', 'Heard what may be an open fire. A guess by a classifier; nothing else supports it yet.');
    case 'damp': return t('stations.st_damp', 'Humidity is very high (fog or mist), so particle readings are not trusted right now.');
    case 'no_baseline': return t('stations.st_no_baseline', 'Reporting. Not enough days of readings yet to know its normal.');
    default: return t('stations.st_normal', 'Reporting, and smoke is at its normal.');
  }
}

const RANK: Record<Tone, number> = { gap: 3, check: 2, watch: 1, ok: 0 };
/** Stations that need a person first: checks, then silent ones, then watches; ties by name. */
export const byAttention = (items: Station[]): Station[] => [...items].sort((a, b) => {
  const ra = a.statement ? (a.statement.tone === 'check' ? 4 : RANK[a.statement.tone]) : 0; const rb = b.statement ? (b.statement.tone === 'check' ? 4 : RANK[b.statement.tone]) : 0;
  return rb - ra || a.name.localeCompare(b.name);
});

export const LOW_BATTERY_MV = 3500; export const WEAK_RSSI = -110; export const WEAK_SNR = -5;
export type Fix = 'silent' | 'late' | 'battery' | 'signal' | 'position';

/** What a technician should look at for this station: not reporting, low battery, weak link, or a reported position far from the registered one. Empty when nothing. */
export function maintenance(s: Station & { reported?: { offset_km: number } | null }): Fix[] {
  const out: Fix[] = [];
  if (s.status === 'offline' || s.status === 'never') out.push('silent'); else if (s.status === 'late') out.push('late');
  if (s.battery_mv !== null && s.battery_mv < LOW_BATTERY_MV) out.push('battery');
  if ((s.rssi !== null && s.rssi < WEAK_RSSI) || (s.snr !== null && s.snr < WEAK_SNR)) out.push('signal');
  if (s.reported && s.reported.offset_km > 1) out.push('position');
  return out;
}

export const fixWords = (f: Fix, t: T): string => f === 'silent' ? t('stations.fix_silent', 'Not reporting') : f === 'late' ? t('stations.fix_late', 'Late') : f === 'battery' ? t('stations.fix_battery', 'Battery low')
  : f === 'signal' ? t('stations.fix_signal', 'Weak radio link') : t('stations.fix_position', 'Not where it is registered');
