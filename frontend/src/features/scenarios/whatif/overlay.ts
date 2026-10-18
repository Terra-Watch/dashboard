/** Draws the burned area into RGBA pixels (S x S pixels per grid cell). Pure, so it is unit tested. */
import { contourEveryH, arrivalColor, type RGB } from './ramp.ts';

export const OVERLAY_SCALE = 4;
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface OverlayLayers {
  /** Fill by arrival time. */
  fill?: { stops: readonly RGB[]; alpha: number };
  /** Thin lines where one contour interval meets the next. */
  hourLines?: { rgb: RGB; alpha: number };
  /** Outline of the burned area (edge against unburned cells). */
  outline?: { rgb: RGB; style: LineStyle; thickness: number };
}

export function createOverlay(width: number, height: number, scale: number = OVERLAY_SCALE): Uint8ClampedArray<ArrayBuffer> {
  return new Uint8ClampedArray(new ArrayBuffer(width * scale * height * scale * 4));
}

function put(buf: Uint8ClampedArray, stride: number, x: number, y: number, rgb: RGB, alpha: number): void {
  const o = (y * stride + x) * 4;
  buf[o] = rgb[0]; buf[o + 1] = rgb[1]; buf[o + 2] = rgb[2]; buf[o + 3] = Math.round(alpha * 255);
}

/** Pixel on a dashed or dotted line, from its position `along` the edge. */
export function onPattern(style: LineStyle, along: number): boolean {
  if (style === 'solid') return true;
  if (style === 'dashed') return ((along >> 3) & 1) === 0;
  return (along & 3) === 0;
}

/**
 * Paint one run at `hour` into `buf` (width*scale by height*scale). Later calls draw over earlier ones, so compare outlines
 * from several runs can share one buffer. Cells with arrival <= hour are burned.
 */
export function paintRun(buf: Uint8ClampedArray, arrivalH: Float32Array, width: number, height: number, hour: number, maxHours: number, layers: OverlayLayers, scale: number = OVERLAY_SCALE): void {
  const S = scale;
  const stride = width * S;
  const every = contourEveryH(maxHours);
  const edge = (cx: number, cy: number, side: 0 | 1 | 2 | 3, rgb: RGB, alpha: number, thickness: number, style: LineStyle) => {
    // side: 0 north, 1 east, 2 south, 3 west of the cell; thickness in pixels inside the cell
    for (let a = 0; a < S; a++) {
      for (let d = 0; d < thickness; d++) {
        const px = side === 1 ? cx * S + S - 1 - d : side === 3 ? cx * S + d : cx * S + a;
        const py = side === 0 ? cy * S + d : side === 2 ? cy * S + S - 1 - d : cy * S + a;
        const along = side === 0 || side === 2 ? px : py;
        if (onPattern(style, along)) put(buf, stride, px, py, rgb, alpha);
      }
    }
  };
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const i = row * width + col;
      const a = arrivalH[i];
      if (!(a <= hour)) continue;
      if (layers.fill) {
        const rgb = arrivalColor(layers.fill.stops, a, maxHours);
        for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) put(buf, stride, col * S + x, row * S + y, rgb, layers.fill.alpha);
      }
      const bin = Math.floor(a / every);
      const neighbours: Array<[number, 0 | 1 | 2 | 3, boolean]> = [
        [i - width, 0, row > 0], [i + 1, 1, col + 1 < width], [i + width, 2, row + 1 < height], [i - 1, 3, col > 0],
      ];
      for (const [j, side, inside] of neighbours) {
        if (!inside) continue;
        const b = arrivalH[j];
        if (b <= hour) {
          if (layers.hourLines && Math.floor(b / every) > bin) edge(col, row, side, layers.hourLines.rgb, layers.hourLines.alpha, 1, 'solid');
        } else if (layers.outline) {
          edge(col, row, side, layers.outline.rgb, 1, layers.outline.thickness, layers.outline.style);
        }
      }
    }
  }
}
