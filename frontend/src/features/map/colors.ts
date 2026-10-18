/** Map colours come from the design tokens (src/ui/palette.generated.css), read at the moment the map is built so light and dark both work. */
export type MapColors = Record<'land' | 'forest' | 'water' | 'road' | 'roadMajor' | 'boundary' | 'label' | 'halo' | 'text' | 'muted' | 'danger' | 'warn' | 'ok' | 'unconfirmed' | 'action' | 'surface' | 'onAction' | 'ember' | 'outlook1' | 'outlook2' | 'outlook3' | 'outlook4' | 'outlook5' | 'prob1' | 'prob2' | 'prob3' | 'prob4', string>;

const TOKENS: Record<keyof MapColors, string> = {
  land: 'map-land', forest: 'map-forest', water: 'map-water', road: 'map-road', roadMajor: 'map-road-major', boundary: 'map-boundary', label: 'map-label', halo: 'surface',
  text: 'text', muted: 'text-muted', danger: 'danger', warn: 'warn', ok: 'ok', unconfirmed: 'unconfirmed', action: 'action', surface: 'surface', onAction: 'on-action', ember: 'ember',
  outlook1: 'outlook-1', outlook2: 'outlook-2', outlook3: 'outlook-3', outlook4: 'outlook-4', outlook5: 'outlook-5', prob1: 'prob-1', prob2: 'prob-2', prob3: 'prob-3', prob4: 'prob-4',
};

export function readMapColors(): MapColors {
  const style = typeof document === 'undefined' ? null : getComputedStyle(document.documentElement);
  const read = (token: string) => style?.getPropertyValue(`--tw-${token}`).trim() || 'currentColor';
  return Object.fromEntries(Object.entries(TOKENS).map(([key, token]) => [key, read(token)])) as MapColors;
}

export const isDark = (): boolean => {
  if (typeof document === 'undefined') return false;
  const forced = document.documentElement.getAttribute('data-theme');
  return forced === 'dark' || (forced !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
};
