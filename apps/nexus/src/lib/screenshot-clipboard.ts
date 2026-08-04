'use client';

/**
 * Put a ticket's screenshots on the clipboard as ONE image.
 *
 * The system clipboard holds a single image, and browsers honour only the first
 * `ClipboardItem` you hand them, so N screenshots are composited into one
 * stacked PNG. That is what keeps the promise of "one text paste, one image
 * paste" true no matter how many pictures a student attached.
 *
 * Images are fetched as blobs rather than assigned to an `<img>` src, so the
 * canvas is never tainted and `toBlob` always succeeds.
 */

const OUTER_PAD = 16;
const GAP = 16;
const LABEL_HEIGHT = 22;
const MAX_WIDTH = 1600;
const MAX_HEIGHT = 8000;

export type CopyImagesResult = 'clipboard' | 'download';

/** Stack every screenshot into a single PNG blob. */
export async function buildScreenshotComposite(urls: string[]): Promise<Blob> {
  if (urls.length === 0) throw new Error('No screenshots to copy');

  const bitmaps = await Promise.all(urls.map(loadBitmap));
  const labelled = bitmaps.length > 1;
  const labelSpace = labelled ? LABEL_HEIGHT : 0;

  const contentWidth = Math.min(MAX_WIDTH, Math.max(...bitmaps.map((b) => b.width)));
  const drawn = bitmaps.map((bitmap) => {
    const scale = Math.min(1, contentWidth / bitmap.width);
    return { bitmap, width: bitmap.width * scale, height: bitmap.height * scale };
  });

  const naturalHeight =
    OUTER_PAD * 2 +
    drawn.reduce((sum, item) => sum + labelSpace + item.height, 0) +
    GAP * (drawn.length - 1);
  const fit = Math.min(1, MAX_HEIGHT / naturalHeight);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round((contentWidth + OUTER_PAD * 2) * fit);
  canvas.height = Math.round(naturalHeight * fit);

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');
  ctx.scale(fit, fit);

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width / fit, canvas.height / fit);

  let y = OUTER_PAD;
  drawn.forEach((item, index) => {
    if (labelled) {
      ctx.fillStyle = '#5f6368';
      ctx.font = '600 14px system-ui, -apple-system, Segoe UI, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText(`${index + 1} / ${drawn.length}`, OUTER_PAD, y + 2);
      y += LABEL_HEIGHT;
    }
    ctx.drawImage(item.bitmap, OUTER_PAD, y, item.width, item.height);
    y += item.height + GAP;
  });

  bitmaps.forEach((bitmap) => bitmap.close?.());

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not render the screenshots'))),
      'image/png',
    );
  });
}

/**
 * Copy the composite to the clipboard, falling back to a download where the
 * browser cannot write images (older Firefox).
 *
 * MUST be called synchronously from the click handler: the `ClipboardItem` is
 * built around the still-pending blob promise, which is what Safari requires to
 * keep the write tied to the user gesture.
 */
export function copyScreenshotsToClipboard(urls: string[], fileName: string): Promise<CopyImagesResult> {
  const blobPromise = buildScreenshotComposite(urls);
  const canWriteImages =
    typeof ClipboardItem !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.clipboard?.write;

  if (!canWriteImages) {
    return blobPromise.then((blob) => {
      downloadBlob(blob, fileName);
      return 'download' as const;
    });
  }

  try {
    const item = new ClipboardItem({ 'image/png': blobPromise });
    return navigator.clipboard
      .write([item])
      .then(() => 'clipboard' as const)
      .catch(async () => {
        downloadBlob(await blobPromise, fileName);
        return 'download' as const;
      });
  } catch {
    return blobPromise.then((blob) => {
      downloadBlob(blob, fileName);
      return 'download' as const;
    });
  }
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url, { mode: 'cors', cache: 'force-cache' });
  if (!res.ok) throw new Error(`Could not load a screenshot (HTTP ${res.status})`);
  return createImageBitmap(await res.blob());
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
