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
