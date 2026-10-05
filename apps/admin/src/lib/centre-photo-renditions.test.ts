import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { MIN_PHOTO_WIDTH, makeRenditions } from './centre-photo-renditions';

const jpeg = (width: number, height: number, withExif = false) => {
  const img = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } } }).jpeg();
  return (withExif ? img.withMetadata({ exif: { IFD0: { Copyright: 'phone' } } }) : img).toBuffer();
};

describe('makeRenditions', () => {
  it('makes a 1600px WebP and a 1200x630 JPEG, without EXIF', async () => {
    const r = await makeRenditions(await jpeg(3000, 2250, true));
    expect(r.width).toBe(1600);
    expect(r.height).toBe(1200);
    const page = await sharp(r.page).metadata();
    expect(page.format).toBe('webp');
    expect(page.exif).toBeUndefined();
    const og = await sharp(r.og).metadata();
    expect([og.format, og.width, og.height]).toEqual(['jpeg', 1200, 630]);
    expect(og.exif).toBeUndefined();
  });

  it('never enlarges a photo between the minimum and 1600px', async () => {
    const r = await makeRenditions(await jpeg(1200, 900));
    expect([r.width, r.height]).toEqual([1200, 900]);
  });

  it('rejects a photo that is too small to look sharp', async () => {
    await expect(makeRenditions(await jpeg(MIN_PHOTO_WIDTH - 1, 600))).rejects.toThrow(/at least/);
  });

  it('rejects a file that is not an image', async () => {
    await expect(makeRenditions(Buffer.from('not an image'))).rejects.toThrow();
  });
});

describe('plain borders', () => {
  /** A 1600x1000 photo-like block with black bars added left and top, like a phone screenshot. */
  const letterboxed = async () => {
    const noise = Buffer.alloc(1600 * 1000 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = 60 + ((i * 7919) % 160);
    const photo = await sharp(noise, { raw: { width: 1600, height: 1000, channels: 3 } }).png().toBuffer();
    return sharp({ create: { width: 2400, height: 1040, channels: 3, background: { r: 0, g: 0, b: 0 } } })
      .composite([{ input: photo, left: 800, top: 40 }])
      .jpeg({ quality: 90 })
      .toBuffer();
  };

  it('trims black bars so the page shows only the photo', async () => {
    const r = await makeRenditions(await letterboxed());
    expect(r.width).toBe(1600);
    expect(Math.abs(r.height - 1000)).toBeLessThanOrEqual(4);
  });

  it('explains a screenshot that is too narrow once trimmed', async () => {
    const shot = await sharp(await letterboxed()).resize({ width: 1400 }).jpeg().toBuffer();
    await expect(makeRenditions(shot)).rejects.toThrow(/screenshot/);
  });
});
