/** Gentle hints about a photo before it is sent. Only about the picture itself (soft, very dark, very bright, small); it never says anything about fire, smoke or authenticity, and never blocks sending.
 * Thresholds come from real photos: sharp web photos have a Laplacian variance of about 95 or more at the 5th percentile; the same photos blurred sit at 3 to 6.
 * shortcut: a hazy sky is also low in detail, so the soft hint says "may be". */
export type Hint = 'soft' | 'dark' | 'bright' | 'small';

export const THRESHOLDS = { softBelow: 15, darkBelow: 30, brightAbove: 230, smallBelowPx: 640 } as const;

/** Variance of the 4-neighbour Laplacian of a grayscale image (row-major, width x height). */
export function laplacianVariance(gray: ArrayLike<number>, width: number, height: number): number {
  if (width < 3 || height < 3) return 0;
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const v = -4 * gray[i] + gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width];
      sum += v; sumSq += v * v; n += 1;
    }
  }
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function hintsFor(gray: ArrayLike<number>, width: number, height: number, longSidePx: number): Hint[] {
  const out: Hint[] = [];
  let total = 0;
  for (let i = 0; i < gray.length; i += 1) total += gray[i];
  const mean = gray.length ? total / gray.length : 0;
  if (longSidePx < THRESHOLDS.smallBelowPx) out.push('small');
  if (mean < THRESHOLDS.darkBelow) out.push('dark');
  else if (mean > THRESHOLDS.brightAbove) out.push('bright');
  if (laplacianVariance(gray, width, height) < THRESHOLDS.softBelow) out.push('soft');
  return out;
}

/** Looks at a picked photo in the browser (downscaled to 256 px). Returns no hints if the browser cannot decode it. */
export async function analyzePhoto(file: File): Promise<Hint[]> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(3, Math.round(bitmap.width * scale)), height = Math.max(3, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) { bitmap.close(); return []; }
    context.drawImage(bitmap, 0, 0, width, height);
    const longSide = Math.max(bitmap.width, bitmap.height); bitmap.close();
    const { data } = context.getImageData(0, 0, width, height);
    const gray = new Float32Array(width * height);
    for (let i = 0; i < gray.length; i += 1) gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    return hintsFor(gray, width, height, longSide);
  } catch { return []; }
}
