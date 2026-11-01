/** Photos are shrunk on the phone before sending: the hosting refuses requests above about 4.5 MB, and field signal is slow. */
export const PHOTO_MAX_SIDE = 1600;
const TARGET_BYTES = 1_200_000;

export function fitWithin(width: number, height: number, max = PHOTO_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/** A JPEG with the long side at most 1600 px and, where possible, under about 1.2 MB. Returns the original when the browser cannot do it.
 * shortcut: the original's hidden camera data is not kept; the server's authenticity check then relies on the pixels alone. */
export async function shrinkPhoto(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    if (width === bitmap.width && file.type === 'image/jpeg' && file.size <= TARGET_BYTES) { bitmap.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    let blob: Blob | null = null;
    for (const quality of [0.82, 0.7, 0.58]) {
      blob = await toBlob(canvas, quality);
      if (blob && blob.size <= TARGET_BYTES) break;
    }
    return blob ? new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`, { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}
