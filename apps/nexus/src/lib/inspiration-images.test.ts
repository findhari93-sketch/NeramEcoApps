// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

/** Real sharp on a generated image; storage, the database and fetch are mocked. */
const mocks = vi.hoisted(() => ({ upload: vi.fn(), setItemImageMeta: vi.fn() }));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => mocks.upload(...a),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.example/${path}` } }),
      }),
    },
  }),
}));
vi.mock('@neram/database/queries/nexus', () => ({
  setItemImageMeta: (...a: unknown[]) => mocks.setItemImageMeta(...a),
}));

import { orientedAspect, prepareItemImage } from './inspiration-images';

describe('orientedAspect', () => {
  it('divides width by height, rounded to three places', () => {
    expect(orientedAspect({ width: 300, height: 600 })).toBe(0.5);
    expect(orientedAspect({ width: 800, height: 1200 })).toBe(0.667);
  });

  it('swaps for a photo stored sideways', () => {
    expect(orientedAspect({ width: 600, height: 300, orientation: 6 })).toBe(0.5);
  });

  it('gives up on missing or absurd sizes', () => {
    expect(orientedAspect({ width: 0, height: 10 })).toBeNull();
    expect(orientedAspect({ width: 1, height: 1000 })).toBeNull();
  });
});

describe('prepareItemImage', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.upload.mockResolvedValue({ error: null });
    mocks.setItemImageMeta.mockResolvedValue(undefined);
    const png = await sharp({ create: { width: 800, height: 1200, channels: 3, background: '#ffffff' } }).png().toBuffer();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(png, { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stores the shape and a 400px JPEG thumbnail', async () => {
    await prepareItemImage({ id: 'item-1', image_url: 'https://example.com/a.png', thumbnail_url: null, image_aspect: null });
    const [path, body, options] = mocks.upload.mock.calls[0];
    expect(path).toBe('inspiration-thumbs/item-1.jpg');
    expect(options).toMatchObject({ contentType: 'image/jpeg', upsert: true });
    expect((await sharp(body as Buffer).metadata()).width).toBe(400);
    expect(mocks.setItemImageMeta).toHaveBeenCalledWith('item-1', {
      image_aspect: 0.667,
      thumbnail_url: 'https://cdn.example/inspiration-thumbs/item-1.jpg',
    });
    expect((fetch as any).mock.calls[0][1]?.signal).toBeDefined();
  });

  it('only fills what is missing', async () => {
    await prepareItemImage({ id: 'item-2', image_url: 'https://example.com/a.png', thumbnail_url: 'https://example.com/t.jpg', image_aspect: null });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.setItemImageMeta).toHaveBeenCalledWith('item-2', { image_aspect: 0.667 });
  });

  it('parks an image it cannot read, so the next batch moves on', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gone', { status: 404 })));
    await expect(
      prepareItemImage({ id: 'item-3', image_url: 'https://example.com/gone.png', thumbnail_url: null, image_aspect: null }),
    ).rejects.toThrow('Image fetch failed (404)');
    expect(mocks.setItemImageMeta).toHaveBeenCalledWith('item-3', { image_aspect: 0.75, thumbnail_url: 'https://example.com/gone.png' });
  });

  it('refuses an image larger than 15 MB and parks it', async () => {
    const png = await sharp({ create: { width: 800, height: 1200, channels: 3, background: '#ffffff' } }).png().toBuffer();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(png, { status: 200, headers: { 'content-length': String(16 * 1024 * 1024) } })));
    await expect(
      prepareItemImage({ id: 'item-4', image_url: 'https://example.com/huge.png', thumbnail_url: null, image_aspect: null }),
    ).rejects.toThrow('Image too large');
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.setItemImageMeta).toHaveBeenCalledWith('item-4', { image_aspect: 0.75, thumbnail_url: 'https://example.com/huge.png' });
  });

  it('gives up on an image that never arrives and parks it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    }));
    await expect(
      prepareItemImage({ id: 'item-5', image_url: 'https://example.com/slow.png', thumbnail_url: null, image_aspect: null }),
    ).rejects.toThrow('The operation was aborted due to timeout');
    expect(mocks.setItemImageMeta).toHaveBeenCalledWith('item-5', { image_aspect: 0.75, thumbnail_url: 'https://example.com/slow.png' });
  });
});
