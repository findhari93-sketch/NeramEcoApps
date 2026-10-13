/**
 * Download a candidate and turn it into the stored file.
 *
 * Cover: the same orient-and-trim as centre photos, at least 1000px wide and
 * landscape, saved as a 1600px WebP. Logo: fitted onto a 256px white square
 * (SVG logos are rasterised by sharp), saved as WebP.
 */
import sharp from 'sharp';
import { MIN_PHOTO_WIDTH, orientAndTrim } from '../centre-photo-renditions';
import { BROWSER_UA, USER_AGENT } from './sources';

const MAX_DOWNLOAD = 15 * 1024 * 1024;

export async function downloadImage(url: string, timeoutMs = 20_000): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Wikimedia asks for a contact-bearing bot agent; many college sites refuse
    // anything that does not look like a browser.
    const wikimedia = /(^|\.)wiki(media|pedia|data)\.org$/.test(new URL(url).hostname);
    const res = await fetch(url, {
      headers: { 'User-Agent': wikimedia ? USER_AGENT : BROWSER_UA, Accept: 'image/*' },
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type') || '';
    if (type && !type.startsWith('image/') && !type.includes('octet-stream')) throw new Error(`not an image (${type})`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_DOWNLOAD) throw new Error('image larger than 15 MB');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_DOWNLOAD) throw new Error('image larger than 15 MB');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

/** A banner is wide; a phone-portrait or square photo crops badly on every card. */
const MIN_COVER_RATIO = 1.2;

export async function coverWebp(input: Buffer): Promise<{ data: Buffer; width: number; height: number }> {
  const src = await orientAndTrim(input);
  if (src.width < MIN_PHOTO_WIDTH) throw new Error(`cover only ${src.width}px wide`);
  if (src.width / src.height < MIN_COVER_RATIO) throw new Error('cover is not landscape');
  const out = await sharp(src.data, { raw: { width: src.width, height: src.height, channels: src.channels } })
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true });
  return { data: out.data, width: out.info.width, height: out.info.height };
}

export async function logoWebp(input: Buffer): Promise<Buffer> {
  const img = sharp(input, { density: 300, failOn: 'error' });
  const meta = await img.metadata();
  const isSvg = meta.format === 'svg';
  if (!isSvg && Math.min(meta.width ?? 0, meta.height ?? 0) < 64) throw new Error('logo smaller than 64px');
  return img
    .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: '#ffffff' })
    .webp({ quality: 90 })
    .toBuffer();
}

/** A small JPEG for the AI judge (keeps the request cheap and under size limits). */
export async function judgeThumb(input: Buffer): Promise<string> {
  const out = await sharp(input, { density: 150 })
    .rotate()
    .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 70 })
    .toBuffer();
  return out.toString('base64');
}
