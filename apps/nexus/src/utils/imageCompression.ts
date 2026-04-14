/**
 * Compresses an image file client-side using a canvas.
 * Resizes to fit within maxDimension and re-encodes as JPEG at the given quality.
 * Returns a new File (always image/jpeg) that is significantly smaller than the original
 * screenshot or PNG pasted from clipboard.
 */
export async function compressImage(
  file: File | Blob,
  maxDimension = 1920,
  quality = 0.85,
  fileName = 'image.jpg',
): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const { naturalWidth: w, naturalHeight: h } = img;
      const scale = Math.min(1, maxDimension / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        // Fall back to original if canvas is unavailable
        resolve(file instanceof File ? file : new File([file], fileName, { type: 'image/jpeg' }));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas toBlob returned null'));
            return;
          }
          resolve(new File([blob], fileName, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = url;
  });
}
