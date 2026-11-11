/** Which map look the Spread outlook uses (dark terrain, light, satellite), how the choice is remembered, and the colours of the dark views. The pure parts are unit tested. */
export type OutlookViewId = 'dark' | 'light' | 'satellite';
export const OUTLOOK_VIEWS: readonly OutlookViewId[] = ['light', 'dark', 'satellite'];
export const DEFAULT_VIEW: OutlookViewId = 'light';   // dark terrain is opt-in: it was too heavy as the first thing a person sees
export const VIEW_KEY = 'tw_outlook_view';
/** Satellite tiles above this zoom are not requested unless VITE_SATELLITE_MAX_ZOOM says otherwise. */
export const SATELLITE_MAX_ZOOM = 13;

export interface SatelliteConfig { url: string; attribution: string; note: string; maxZoom: number }
type Env = Record<string, string | boolean | undefined>;

/** Satellite is on only when the deployment opts in and gives both the tile URL and its attribution. No URL is built into the code. */
export function satelliteConfig(env: Env): SatelliteConfig | null {
  if (env.VITE_SATELLITE_BASEMAP !== 'true') return null;
  const url = typeof env.VITE_SATELLITE_TILE_URL === 'string' ? env.VITE_SATELLITE_TILE_URL.trim() : '';
  const attribution = typeof env.VITE_SATELLITE_ATTRIBUTION === 'string' ? env.VITE_SATELLITE_ATTRIBUTION.trim() : '';
  const note = typeof env.VITE_SATELLITE_NOTE === 'string' && env.VITE_SATELLITE_NOTE.trim() ? env.VITE_SATELLITE_NOTE.trim() : "Check the imagery provider's terms before public use.";
  const z = Number(env.VITE_SATELLITE_MAX_ZOOM);
  return url && attribution ? { url, attribution, note, maxZoom: Number.isFinite(z) && z >= 1 && z <= 22 ? Math.floor(z) : SATELLITE_MAX_ZOOM } : null;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Saved choice, or the default. A saved satellite choice falls back to the default when satellite is not available. Never throws. */
export function readView(store: Store | null | undefined, satelliteAvailable: boolean): OutlookViewId {
  try {
    const v = store?.getItem(VIEW_KEY);
    if (v === 'dark' || v === 'light') return v;
    if (v === 'satellite' && satelliteAvailable) return v;
  } catch { /* storage blocked: use the default */ }
  return DEFAULT_VIEW;
}

export function writeView(store: Store | null | undefined, view: OutlookViewId): void {
  try { store?.setItem(VIEW_KEY, view); } catch { /* kept for this visit only */ }
}

/** The browser's localStorage, or null when even touching it throws. */
export function safeStorage(): Store | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The look-ahead keys a fire carries, smallest first. Current runs carry one (48: the next one to two days); older runs carried 24 and 48. */
export function horizonKeys(horizons: Record<string, unknown> | undefined): number[] {
  return Object.keys(horizons ?? {}).map(Number).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
}

/** The fire ramp of the heat picture as CSS colours, most likely first (the same --tw-wi-fire-* tokens the picture is drawn with). */
export const HEAT_STOPS = ['var(--tw-wi-fire-1)', 'var(--tw-wi-fire-2)', 'var(--tw-wi-fire-3)', 'var(--tw-wi-fire-4)', 'var(--tw-wi-fire-5)'] as const;

export interface DarkTokens {
  terrain: Record<'land' | 'earth' | 'forest' | 'water' | 'road' | 'roadMajor' | 'boundary' | 'label' | 'halo', string>;
  /** For MapView.colorsOverride: bright labels with a dark halo, bright outlines and lines. */
  mapColors: Record<string, string>;
}

/** Colours of the dark terrain and satellite views, read from the --tw-wi-* tokens at draw time. */
export function readDarkTokens(): DarkTokens {
  const css = (name: string): string => (typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(`--tw-${name}`).trim()) || 'currentColor';
  return {
    terrain: { land: css('wi-land'), earth: css('wi-earth'), forest: css('wi-forest'), water: css('wi-water'), road: css('wi-road'), roadMajor: css('wi-road-major'), boundary: css('wi-boundary'), label: css('wi-label'), halo: css('wi-halo') },
    // text: labels and the outline of the fire at the start; surface/halo: the dark rim around every symbol; unconfirmed: what burned (dashed); muted/boundary: road and water lines.
    mapColors: { text: css('wi-label'), halo: css('wi-halo'), surface: css('wi-halo'), unconfirmed: css('wi-ignition'), action: css('wi-front'), muted: css('wi-road-major'), boundary: css('wi-water-line'), ember: css('wi-fire-3'), danger: css('wi-fire-4'), warn: css('wi-fire-2') },
  };
}
