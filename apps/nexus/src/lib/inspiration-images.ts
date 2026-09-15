import sharp from 'sharp';
import { getSupabaseAdminClient } from '@neram/database';
import { setItemImageMeta, type ItemImageWork } from '@neram/database/queries/nexus';

/**
 * A grid of full-size drawing photos is slow on a phone, and a tile that learns
 * its height only after the image loads makes the whole grid jump. So every
 * visible item gets a 400px thumbnail and a stored width-to-height ratio.
 */
const BUCKET = 'drawing-references';
const THUMB_WIDTH = 400;
const FALLBACK_ASPECT = 0.75;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export function orientedAspect(meta: { width?: number; height?: number; orientation?: number }): number | null {
  if (!meta.width || !meta.height) return null;
  // EXIF orientations 5 to 8 store the picture turned a quarter.
  const sideways = (meta.orientation ?? 1) >= 5;
  const aspect = sideways ? meta.height / meta.width : meta.width / meta.height;
  if (aspect < 0.1 || aspect > 10) return null;
  return Math.round(aspect * 1000) / 1000;
}

export async function prepareItemImage(item: ItemImageWork): Promise<void> {
  try {
    const res = await fetch(item.image_url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
    const contentLength = Number(res.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES) {
      throw new Error('Image too large');
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('Image too large');
    }

    const patch: { thumbnail_url?: string; image_aspect?: number } = {};
    if (item.image_aspect == null) {
      patch.image_aspect = orientedAspect(await sharp(buffer).metadata()) ?? FALLBACK_ASPECT;
    }
    if (!item.thumbnail_url) {
      const thumb = await sharp(buffer)
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: 78, mozjpeg: true })
        .toBuffer();
      const path = `inspiration-thumbs/${item.id}.jpg`;
      const storage = getSupabaseAdminClient().storage.from(BUCKET);
      const { error } = await storage.upload(path, thumb, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      patch.thumbnail_url = storage.getPublicUrl(path).data.publicUrl;
    }
    if (Object.keys(patch).length > 0) await setItemImageMeta(item.id, patch);
  } catch (err) {
    // Park it. The tile falls back to the full image in a portrait box, and the
    // next batch does not spend itself retrying the same broken link.
    await setItemImageMeta(item.id, {
      image_aspect: item.image_aspect ?? FALLBACK_ASPECT,
      thumbnail_url: item.thumbnail_url ?? item.image_url,
    }).catch(() => undefined);
    throw err;
  }
}
