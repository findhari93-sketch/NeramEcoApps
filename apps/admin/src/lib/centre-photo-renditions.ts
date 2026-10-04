/**
 * Centre photo renditions for the public pages (Admin > Centres upload).
 *
 * - page: up to 1600px wide WebP, the photo shown on the page and listed in
 *   the schema and image sitemap (Google prefers 1200px or wider).
 * - og: 1200x630 JPEG cover crop, the share card and result thumbnail.
 *
 * sharp drops EXIF (including any phone GPS) unless asked to keep it; rotate()
 * first applies the phone's orientation so nothing comes out sideways.
 */
import sharp from 'sharp';

/** Narrower than this looks soft in a search thumbnail and on a laptop. */
export const MIN_PHOTO_WIDTH = 1000;

export interface Renditions {
  page: Buffer;
  og: Buffer;
  width: number;
  height: number;
}

export async function makeRenditions(input: Buffer): Promise<Renditions> {
  const oriented = sharp(input, { failOn: 'error' }).rotate();
  const meta = await oriented.clone().metadata();
  // After rotate() the stored width/height may be swapped (orientation 5 to 8).
  const sideways = (meta.orientation ?? 1) >= 5;
  const srcWidth = (sideways ? meta.height : meta.width) ?? 0;
  if (srcWidth < MIN_PHOTO_WIDTH) {
    throw new Error(`Photo is ${srcWidth}px wide. Upload one at least ${MIN_PHOTO_WIDTH}px wide (the original from the phone, not a WhatsApp copy).`);
  }
  const page = await oriented.clone().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  const og = await oriented.clone().resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return { page: page.data, og, width: page.info.width, height: page.info.height };
}
