/** Colour ramp for arrival time. Stops come from design tokens (outlook scale, dark = early, light = late) read at draw time, so light and dark themes both work. */
export type RGB = [number, number, number];

/** Token names (--tw-<name>), earliest arrival first. */
export const RAMP_TOKENS = ['outlook-5', 'outlook-4', 'outlook-3', 'outlook-2', 'outlook-1'] as const;
/** Used only when a token cannot be read (tests, very old browsers): a plain dark-to-light grey ramp. */
export const FALLBACK_STOPS: RGB[] = [[40, 40, 40], [100, 100, 100], [160, 160, 160], [210, 210, 210], [245, 245, 245]];

const clamp255 = (v: number): number => Math.min(255, Math.max(0, Math.round(v)));

/** '#rgb', '#rrggbb', 'rgb(r, g, b)' or 'rgba(...)' to numbers; null when it is something else. */
export function parseColor(input: string): RGB | null {
  const s = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1]].map(c => parseInt(c + c, 16)) as RGB;
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/.exec(s);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (m) return [clamp255(+m[1]), clamp255(+m[2]), clamp255(+m[3])];
  return null;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.min(1, Math.max(0, t));
  return [clamp255(a[0] + (b[0] - a[0]) * k), clamp255(a[1] + (b[1] - a[1]) * k), clamp255(a[2] + (b[2] - a[2]) * k)];
}

/** Colour at position t in [0, 1] along the stops (linear between neighbours). */
export function rampColor(stops: readonly RGB[], t: number): RGB {
  if (stops.length === 0) return [0, 0, 0];
  if (stops.length === 1) return stops[0];
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

/** Colour of a cell reached at `hours` in a run of `maxHours`. */
export const arrivalColor = (stops: readonly RGB[], hours: number, maxHours: number): RGB => rampColor(stops, maxHours > 0 ? hours / maxHours : 0);

/** Relative luminance (WCAG) of an sRGB colour, 0 to 1. */
export function luminance(c: RGB): number {
  const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
}

/** Read the ramp from the page's CSS variables. Falls back to grey when a token is missing. */
export function readRampStops(root?: Element): RGB[] {
  if (typeof document === 'undefined') return FALLBACK_STOPS;
  const style = getComputedStyle(root ?? document.documentElement);
  const stops = RAMP_TOKENS.map(name => parseColor(style.getPropertyValue(`--tw-${name}`)));
  return stops.every(Boolean) ? (stops as RGB[]) : FALLBACK_STOPS;
}

export function readTokenColor(name: string, fallback: RGB = [128, 128, 128]): RGB {
  if (typeof document === 'undefined') return fallback;
  return parseColor(getComputedStyle(document.documentElement).getPropertyValue(`--tw-${name}`)) ?? fallback;
}

/** Hour ticks for the legend: about five to seven evenly spaced whole hours including 0 and the end. */
export function legendTicks(maxHours: number): number[] {
  const step = maxHours <= 6 ? 1 : maxHours <= 12 ? 3 : maxHours <= 24 ? 6 : 12;
  const out: number[] = [];
  for (let h = 0; h < maxHours; h += step) out.push(h);
  out.push(maxHours);
  return out;
}

/** Spacing in hours of the contour lines: hourly up to 24 h, every 2 h beyond. */
export const contourEveryH = (maxHours: number): number => (maxHours <= 24 ? 1 : 2);

/** Fire colours for the dark and satellite views, just burning (bright yellow) to burned earlier (deep red). */
export const FIRE_TOKENS = ['wi-fire-1', 'wi-fire-2', 'wi-fire-3', 'wi-fire-4', 'wi-fire-5'] as const;
/** Light stand-ins used only when a token cannot be read: a bright-to-dark orange-ish ramp in numbers, no hex. */
export const FALLBACK_FIRE: RGB[] = [[255, 240, 60], [255, 184, 28], [255, 122, 18], [224, 54, 15], [179, 18, 28]];

export function readTokenStops(names: readonly string[], fallback: RGB[]): RGB[] {
  if (typeof document === 'undefined') return fallback;
  const style = getComputedStyle(document.documentElement);
  const stops = names.map(n => parseColor(style.getPropertyValue(`--tw-${n}`)));
  return stops.every(Boolean) ? (stops as RGB[]) : fallback;
}

/** Position on the fire ramp for a cell reached at `arrival`, seen at `hour`: 0 at the front (just burning), 1 for the oldest burn. */
export function ageFraction(arrival: number, hour: number): number {
  const age = hour - arrival;
  if (!(age > 0)) return 0;
  return Math.min(1, age / Math.max(hour, 0.5));
}
