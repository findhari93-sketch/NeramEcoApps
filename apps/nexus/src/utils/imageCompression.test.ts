import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compressImage } from './imageCompression';

/**
 * jsdom has no real canvas, so these tests assert the draw *instructions*:
 * the canvas is sized by rotatedSize, and the image is rotated about the
 * centre before being drawn centred on it. The arithmetic those instructions
 * rely on is covered directly in lib/image-rotation.test.ts.
 */

interface FakeCtx {
  translate: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
}

let ctx: FakeCtx;
let canvas: { width: number; height: number; getContext: () => FakeCtx | null; toBlob: (cb: (b: Blob | null) => void, type?: string, q?: number) => void };
let createElementSpy: { mockRestore: () => void };
let contextAvailable = true;
let blobResult: Blob | null = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });

const bitmapClose = vi.fn();

function setSourceSize(width: number, height: number) {
  (globalThis as any).createImageBitmap = vi.fn(async () => ({
    width,
    height,
    close: bitmapClose,
  }));
}

beforeEach(() => {
  contextAvailable = true;
  blobResult = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
  bitmapClose.mockClear();

  ctx = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() };
  canvas = {
    width: 0,
    height: 0,
    getContext: () => (contextAvailable ? ctx : null),
    toBlob: (cb) => cb(blobResult),
  };

  const realCreateElement = document.createElement.bind(document);
  createElementSpy = vi
    .spyOn(document, 'createElement')
    .mockImplementation((tag: string, ...rest: any[]) =>
      tag === 'canvas' ? (canvas as unknown as HTMLElement) : realCreateElement(tag, ...rest),
    );

  setSourceSize(400, 300);
});

afterEach(() => {
  createElementSpy.mockRestore();
  delete (globalThis as any).createImageBitmap;
});

const file = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

describe('compressImage rotation', () => {
  it('keeps the canvas axes on 0 degrees and draws an identity transform', async () => {
    await compressImage(file(), 2400, 0.85, 'drawing.jpg', 0);

    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(300);
    expect(ctx.rotate).toHaveBeenCalledWith(0);
    expect(ctx.translate).toHaveBeenCalledWith(200, 150);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), -200, -150, 400, 300);
  });

  it('swaps the canvas axes on a quarter turn', async () => {
    await compressImage(file(), 2400, 0.85, 'drawing.jpg', 90);

    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(400);
    // Rotate about the new centre, draw the image at its own centred offsets.
    expect(ctx.translate).toHaveBeenCalledWith(150, 200);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), -200, -150, 400, 300);
  });

  it('swaps the canvas axes on 270 too', async () => {
    await compressImage(file(), 2400, 0.85, 'drawing.jpg', 270);

    expect(canvas.width).toBe(300);
    expect(canvas.height).toBe(400);
    expect(ctx.rotate).toHaveBeenCalledWith((270 * Math.PI) / 180);
  });

  it('leaves the axes alone on a half turn', async () => {
    await compressImage(file(), 2400, 0.85, 'drawing.jpg', 180);

    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(300);
    expect(ctx.rotate).toHaveBeenCalledWith(Math.PI);
  });

  it('downscales before rotating so maxDimension still bounds the result', async () => {
    setSourceSize(4000, 3000);
    await compressImage(file(), 2400, 0.85, 'drawing.jpg', 90);

    // 4000x3000 scaled to fit 2400 => 2400x1800, then axes swapped.
    expect(canvas.width).toBe(1800);
    expect(canvas.height).toBe(2400);
  });

  it('decodes with an explicit EXIF orientation', async () => {
    await compressImage(file(), 2400, 0.85, 'drawing.jpg', 90);
    expect((globalThis as any).createImageBitmap).toHaveBeenCalledWith(
      expect.anything(),
      { imageOrientation: 'from-image' },
    );
  });

  it('releases the decoded bitmap even when encoding fails', async () => {
    blobResult = null;
    await expect(compressImage(file(), 2400, 0.85, 'drawing.jpg', 90)).rejects.toThrow(
      /toBlob returned null/,
    );
    expect(bitmapClose).toHaveBeenCalled();
  });

  it('returns a jpeg File named as asked', async () => {
    const out = await compressImage(file(), 2400, 0.85, 'drawing.jpg', 90);
    expect(out).toBeInstanceOf(File);
    expect(out.name).toBe('drawing.jpg');
    expect(out.type).toBe('image/jpeg');
  });

  it('refuses rather than silently dropping a rotation when canvas is unavailable', async () => {
    contextAvailable = false;
    await expect(compressImage(file(), 2400, 0.85, 'drawing.jpg', 90)).rejects.toThrow(
      /cannot rotate/i,
    );
  });

  it('still falls back to the original file when canvas is unavailable and no rotation was asked for', async () => {
    contextAvailable = false;
    const input = file();
    const out = await compressImage(input, 2400, 0.85, 'drawing.jpg', 0);
    expect(out).toBe(input);
  });
});
