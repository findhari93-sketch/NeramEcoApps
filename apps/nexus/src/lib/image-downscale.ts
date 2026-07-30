/**
 * Make a small copy of an image in the browser, before it is uploaded.
 *
 * Class images are whiteboard screenshots and photos, commonly 1 to 4 MB. They
 * are now shown as 48px tiles in front of every past class, and a student
 * scanning a week of history would otherwise download the originals to fill
 * them. Downscaling here costs nothing: Supabase image transformations would do
 * the same job server-side but bill per origin image.
 *
 * This never blocks an upload. Every failure path returns null and the caller
 * uploads the original alone, which still renders, just heavier.
 */

const THUMB_MAX_PX = 320;
const THUMB_QUALITY = 0.72;

/** Below this the original IS the thumbnail, so encoding twice is a waste. */
const ALREADY_SMALL_BYTES = 40_000;

interface Downscaled {
  blob: Blob;
  /** 'webp' or 'jpeg', so the caller can name the uploaded file correctly. */
  ext: 'webp' | 'jpeg';
}

/** Longest edge capped at maxPx, aspect ratio kept, never scaled up. */
function fit(width: number, height: number, maxPx: number): { w: number; h: number } {
  const longest = Math.max(width, height);
  if (longest <= maxPx) return { w: width, h: height };
  const scale = maxPx / longest;
  return { w: Math.round(width * scale), h: Math.round(height * scale) };
}

/**
 * OffscreenCanvas where it exists, a detached <canvas> otherwise (Safari only
 * got convertToBlob recently, and this runs on teachers' phones).
 */
async function encode(
  bitmap: ImageBitmap,
  w: number,
  h: number,
  type: string,
  quality: number,
): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return canvas.convertToBlob({ type, quality });
  }

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

/**
 * A small copy of `file`, or null when there is no point making one or the
 * browser cannot.
 *
 * Returns null (rather than throwing) for: a non-image, an already-small file,
 * an undecodable file, a browser without canvas, and an encoder that produced
 * something no smaller than the original.
 */
export async function makeThumbnail(
  file: File,
  maxPx: number = THUMB_MAX_PX,
  quality: number = THUMB_QUALITY,
): Promise<Downscaled | null> {
  if (typeof window === 'undefined') return null;
  if (!file.type.startsWith('image/')) return null;
  if (file.size <= ALREADY_SMALL_BYTES) return null;
  if (typeof createImageBitmap !== 'function') return null;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const { w, h } = fit(bitmap.width, bitmap.height, maxPx);

    // An image already within the box only needs re-encoding if that is what
    // makes it small, and at this size it usually is not worth the risk.
    if (w === bitmap.width && h === bitmap.height && file.size <= ALREADY_SMALL_BYTES * 4) return null;

    let blob = await encode(bitmap, w, h, 'image/webp', quality);
    let ext: 'webp' | 'jpeg' = 'webp';

    // Browsers that cannot encode webp silently hand back a PNG, which is
    // bigger than the JPEG we would rather have.
    if (!blob || blob.type !== 'image/webp') {
      blob = await encode(bitmap, w, h, 'image/jpeg', quality);
      ext = 'jpeg';
    }

    if (!blob || blob.size >= file.size) return null;
    return { blob, ext };
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}
