import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { TelemetryKeyframe } from './mission-config';

// ─── Tailwind ────────────────────────────────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Math / Interpolation ────────────────────────────────────────────────────

/** Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Smooth step (ease in–out) */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Map a value from one range to another */
export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/**
 * Interpolate along a keyframe array.
 * Keyframes are [progress, value] tuples, sorted ascending by progress.
 * Uses smoothstep easing between adjacent keyframes.
 */
export function interpolateKeyframes(
  keyframes: TelemetryKeyframe[],
  t: number,
): number {
  if (keyframes.length === 0) return 0;
  if (t <= keyframes[0][0]) return keyframes[0][1];
  if (t >= keyframes[keyframes.length - 1][0]) return keyframes[keyframes.length - 1][1];

  let lo = 0;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i][0] <= t && keyframes[i + 1][0] >= t) {
      lo = i;
      break;
    }
  }

  const [t0, v0] = keyframes[lo];
  const [t1, v1] = keyframes[lo + 1];
  const localT = smoothstep(t0, t1, t);
  return lerp(v0, v1, localT);
}

/**
 * Interpolate a CSS hex color between two values.
 * Returns rgb() string for use in inline styles.
 */
export function interpolateColor(
  from: string,
  to: string,
  t: number,
): string {
  const parse = (hex: string) => {
    const clean = hex.replace('#', '');
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16),
    ];
  };

  const [r0, g0, b0] = parse(from);
  const [r1, g1, b1] = parse(to);
  const r = Math.round(lerp(r0, r1, t));
  const g = Math.round(lerp(g0, g1, t));
  const b = Math.round(lerp(b0, b1, t));
  return `rgb(${r},${g},${b})`;
}

// ─── Formatting ──────────────────────────────────────────────────────────────

/** Format a number to fixed decimal places */
export function fmt(value: number, decimals = 1): string {
  return value.toFixed(decimals);
}

/** Format degrees to heading string */
export function fmtHeading(degrees: number): string {
  return `${Math.round(degrees)}°`;
}

/** Format km to distance string */
export function fmtDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)} km`;
}

// ─── Animation helpers ───────────────────────────────────────────────────────

/**
 * Returns a visibility window:
 * - 0 before `showAt`
 * - 1 between `showAt` and `hideAt`
 * - 0 after `hideAt`
 * With smooth fade margins.
 */
export function panelVisibility(
  progress: number,
  showAt: number,
  hideAt: number,
  fadeMargin = 0.02,
): number {
  if (progress < showAt - fadeMargin) return 0;
  if (progress > hideAt + fadeMargin) return 0;
  const fadeIn = smoothstep(showAt - fadeMargin, showAt + fadeMargin, progress);
  const fadeOut = 1 - smoothstep(hideAt - fadeMargin, hideAt + fadeMargin, progress);
  return Math.min(fadeIn, fadeOut);
}
