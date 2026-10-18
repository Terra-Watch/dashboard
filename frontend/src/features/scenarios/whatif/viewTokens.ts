/** Colours of the what-if map views, read from the --tw-* tokens (palette.mjs) at draw time. */
import { FALLBACK_FIRE, FIRE_TOKENS, readTokenColor, readTokenStops, type RGB } from './ramp.ts';
import { TINT_TOKENS, type TintGroup } from './hillshade.ts';

const css = (name: string): string => (typeof document === 'undefined' ? '' : getComputedStyle(document.documentElement).getPropertyValue(`--tw-${name}`).trim());

export interface DarkTokens {
  terrain: { land: string; earth: string; forest: string; water: string; road: string; roadMajor: string; boundary: string; label: string; halo: string };
  /** For MapView.colorsOverride: bright labels with a dark halo, bright markers and lines. */
  mapColors: Record<string, string>;
  fire: RGB[];
  front: RGB;
  contour: RGB;
  cases: [RGB, RGB, RGB];
  caseCss: [string, string, string];
  tints: Record<TintGroup, RGB>;
  light: RGB;
  dark: RGB;
}

export function readDarkTokens(): DarkTokens {
  const t = (n: string) => css(n) || 'currentColor';
  const rgb = (n: string, fb: RGB = [128, 128, 128]) => readTokenColor(n, fb);
  const tints = Object.fromEntries(Object.entries(TINT_TOKENS).map(([k, n]) => [k, rgb(n)])) as Record<TintGroup, RGB>;
  return {
    terrain: { land: t('wi-land'), earth: t('wi-earth'), forest: t('wi-forest'), water: t('wi-water'), road: t('wi-road'), roadMajor: t('wi-road-major'), boundary: t('wi-boundary'), label: t('wi-label'), halo: t('wi-halo') },
    // text: labels and the fire line; surface/halo: the dark rim around every symbol; unconfirmed: ignition; muted/boundary: road and water lines.
    mapColors: { text: t('wi-label'), halo: t('wi-halo'), surface: t('wi-halo'), unconfirmed: t('wi-ignition'), action: t('wi-front'), muted: t('wi-road-major'), boundary: t('wi-water-line'), ember: t('wi-fire-3'), danger: t('wi-fire-3') },
    fire: readTokenStops(FIRE_TOKENS, FALLBACK_FIRE),
    front: rgb('wi-front', [255, 248, 194]),
    contour: rgb('wi-contour', [40, 10, 5]),
    cases: [rgb('wi-case-a'), rgb('wi-case-b'), rgb('wi-case-c')],
    caseCss: [`var(--tw-wi-case-a)`, `var(--tw-wi-case-b)`, `var(--tw-wi-case-c)`],
    tints,
    light: rgb('wi-shade-light', [255, 255, 255]),
    dark: rgb('wi-shade-dark', [0, 0, 0]),
  };
}
