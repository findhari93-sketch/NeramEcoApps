/**
 * Combines several images into a single PDF, entirely client-side.
 *
 * Each image is first shrunk with compressImage (long edge capped, re-encoded as
 * JPEG) then placed one-per-page on A4 portrait, scaled to fit inside a small
 * margin while keeping its aspect ratio. This lets a student photograph their
 * handwritten work and submit one small PDF without any third-party app.
 *
 * jsPDF is dynamically imported so it never enters the main bundle, it only
 * loads when a student actually builds a PDF.
 */
import { compressImage } from './imageCompression';

export interface ImagesToPdfOptions {
  /** Long-edge cap for each page image, in px. Default 1600 (sharp for handwriting, small on disk). */
  maxDimension?: number;
  /** JPEG quality for each page image, 0-1. Default 0.72. */
  quality?: number;
  /** Output file name. Default 'submission.pdf'. */
  fileName?: string;
}

interface LoadedImage {
  dataUrl: string;
  width: number;
  height: number;
  format: 'JPEG' | 'PNG' | 'WEBP';
}

function readImage(file: File | Blob): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const format = dataUrl.startsWith('data:image/png')
          ? 'PNG'
          : dataUrl.startsWith('data:image/webp')
            ? 'WEBP'
            : 'JPEG';
        resolve({ dataUrl, width: img.naturalWidth, height: img.naturalHeight, format });
      };
      img.onerror = () => reject(new Error('Could not read one of the images. Try retaking that photo.'));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error('Could not read one of the images. Try retaking that photo.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress + combine images into one A4-portrait PDF File (application/pdf).
 * Throws if the list is empty or an image cannot be decoded.
 */
export async function imagesToPdf(files: File[], opts: ImagesToPdfOptions = {}): Promise<File> {
  const { maxDimension = 1600, quality = 0.72, fileName = 'submission.pdf' } = opts;
  if (!files.length) throw new Error('Add at least one photo first.');

  const { default: jsPDF } = await import('jspdf');
  // A4 portrait in points (72dpi): 595.28 x 841.89
  const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;

  for (let i = 0; i < files.length; i++) {
    const compressed = await compressImage(files[i], maxDimension, quality, `page-${i + 1}.jpg`);
    const { dataUrl, width, height, format } = await readImage(compressed);

    const scale = Math.min(maxW / width, maxH / height);
    const w = width * scale;
    const h = height * scale;
    const x = (pageW - w) / 2;
    const y = (pageH - h) / 2;

    if (i > 0) doc.addPage();
    doc.addImage(dataUrl, format, x, y, w, h, undefined, 'FAST');
  }

  const blob = doc.output('blob');
  return new File([blob], fileName, { type: 'application/pdf' });
}
