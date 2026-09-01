import { rotatedSize, type Rotation } from '@/lib/image-rotation';

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/**
 * Decode an image with a deterministic orientation.
 *
 * `createImageBitmap(file, { imageOrientation: 'from-image' })` applies the
 * EXIF orientation tag explicitly. The `<img>` fallback relies on the browser
 * default (`image-orientation: from-image`), which is what every current
 * engine does but is not something we can assert on an old Android WebView.
 * Either way the canvas re-encode below strips the tag, so the bytes we upload
 * are upright rather than upright-only-if-the-viewer-cooperates.
 */
async function decodeImage(file: File | Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    } catch {
      // Older Safari and some WebViews reject the options bag outright, and
      // HEIC may not decode here at all. Fall through to the <img> path.
    }
  }

  return new Promise<DecodedImage>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () =>
      resolve({
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        release: () => URL.revokeObjectURL(url),
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };
    img.src = url;
  });
}

/**
 * Compresses an image file client-side using a canvas.
 * Resizes to fit within maxDimension, applies an optional quarter-turn
 * rotation, and re-encodes as JPEG at the given quality.
 * Returns a new File (always image/jpeg) that is significantly smaller than the
 * original screenshot or PNG pasted from clipboard.
 *
 * `rotation` bakes the turn into the pixels, so every surface that renders the
 * stored URL afterwards is upright with no per-surface handling.
 */
export async function compressImage(
  file: File | Blob,
  maxDimension = 1920,
  quality = 0.85,
  fileName = 'image.jpg',
  rotation: Rotation = 0,
): Promise<File> {
  const decoded = await decodeImage(file);

  try {
    const { width: w, height: h } = decoded;
    const scale = Math.min(1, maxDimension / Math.max(w, h));
    const drawWidth = Math.round(w * scale);
    const drawHeight = Math.round(h * scale);

    // The quarter turns swap the canvas axes; the half turn does not.
    const { width, height } = rotatedSize(drawWidth, drawHeight, rotation);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      // A rotation cannot be honoured without a canvas. Refuse rather than
      // return the untouched file and silently discard the turn the user asked
      // for; an unrotated call keeps the original lenient fallback.
      if (rotation !== 0) throw new Error('Canvas unavailable, cannot rotate image');
      return file instanceof File ? file : new File([file], fileName, { type: 'image/jpeg' });
    }

    // Rotate about the canvas centre, then draw the image centred on it.
    ctx.translate(width / 2, height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(decoded.source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) throw new Error('Canvas toBlob returned null');

    return new File([blob], fileName, { type: 'image/jpeg' });
  } finally {
    decoded.release();
  }
}
