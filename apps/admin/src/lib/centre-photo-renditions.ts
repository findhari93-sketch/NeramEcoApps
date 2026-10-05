/**
 * Centre photo renditions for the public pages (Admin > Centres upload).
 *
 * - page: up to 1600px wide WebP, the photo shown on the page and listed in
 *   the schema and image sitemap (Google prefers 1200px or wider).
 * - og: 1200x630 JPEG cover crop, the share card and result thumbnail.
 *
 * sharp drops EXIF (including any phone GPS) unless asked to keep it; rotate()
 * first applies the phone's orientation so nothing comes out sideways.
 *
 * Plain borders are trimmed first: a phone screenshot of a portrait photo
 * arrives with wide black (or white) bars, which no crop on the page can hide.
 */
import sharp from 'sharp';

/** Narrower than this looks soft in a search thumbnail and on a laptop. */
export const MIN_PHOTO_WIDTH = 1000;

/** How far a border pixel may drift from the corner colour (JPEG noise on a black bar). */
const TRIM_THRESHOLD = 24;
/** Only trim real bars: each kept side must be at least this share of the original. */
const MIN_KEPT_SHARE = 0.4;

export interface Renditions {
  page: Buffer;
  og: Buffer;
  width: number;
  height: number;
}

/** Decoded pixels, passed between steps so the photo is compressed only once. */
export interface Pixels {
  data: Buffer;
  width: number;
  height: number;
  channels: 1 | 2 | 3 | 4;
}

const load = (p: Pixels) => sharp(p.data, { raw: { width: p.width, height: p.height, channels: p.channels } });
const pixels = async (img: sharp.Sharp): Promise<Pixels> => {
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
};

/** Applies the phone's orientation and removes plain bars around the photo. */
export async function orientAndTrim(input: Buffer): Promise<Pixels & { trimmed: boolean }> {
  const oriented = await pixels(sharp(input, { failOn: 'error' }).rotate());
  try {
    const cut = await pixels(load(oriented).trim({ threshold: TRIM_THRESHOLD }));
    const kept = cut.width >= oriented.width * MIN_KEPT_SHARE && cut.height >= oriented.height * MIN_KEPT_SHARE;
    const changed = cut.width < oriented.width || cut.height < oriented.height;
    if (kept && changed) return { ...cut, trimmed: true };
  } catch {
    // A single-colour image has nothing to trim; keep it as it is.
  }
  return { ...oriented, trimmed: false };
}

export async function makeRenditions(input: Buffer): Promise<Renditions> {
  const src = await orientAndTrim(input);
  if (src.width < MIN_PHOTO_WIDTH) {
    throw new Error(
      src.trimmed
        ? `After removing the plain edges, this photo is ${src.width}px wide. It looks like a screenshot: upload the original photo from the phone (at least ${MIN_PHOTO_WIDTH}px wide).`
        : `Photo is ${src.width}px wide. Upload one at least ${MIN_PHOTO_WIDTH}px wide (the original from the phone, not a WhatsApp copy).`,
    );
  }
  return renditionsFrom(src);
}

/** The two files, from an oriented and trimmed photo. */
export async function renditionsFrom(src: Pixels): Promise<Renditions> {
  const page = await load(src).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
  const og = await load(src).resize(1200, 630, { fit: 'cover', position: 'attention' }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  return { page: page.data, og, width: page.info.width, height: page.info.height };
}
