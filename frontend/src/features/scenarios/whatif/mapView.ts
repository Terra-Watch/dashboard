/** Which map look the what-if page uses, and how that choice is remembered. Pure, so it is unit tested. */
export type MapViewId = 'dark' | 'light' | 'satellite';
export const MAP_VIEWS: readonly MapViewId[] = ['dark', 'light', 'satellite'];
export const DEFAULT_VIEW: MapViewId = 'dark';
export const VIEW_KEY = 'tw_whatif_view';
/** Default: satellite tiles above this zoom are not requested (MapLibre enlarges the last real level instead of showing blurry deeper tiles). VITE_SATELLITE_MAX_ZOOM overrides it. */
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
export function readView(store: Store | null | undefined, satelliteAvailable: boolean): MapViewId {
  try {
    const v = store?.getItem(VIEW_KEY);
    if (v === 'dark' || v === 'light') return v;
    if (v === 'satellite' && satelliteAvailable) return v;
  } catch { /* storage blocked: use the default */ }
  return DEFAULT_VIEW;
}

export function writeView(store: Store | null | undefined, view: MapViewId): void {
  try { store?.setItem(VIEW_KEY, view); } catch { /* kept for this visit only */ }
}

/** The browser's localStorage, or null when even touching it throws. */
export function safeStorage(): Store | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}
