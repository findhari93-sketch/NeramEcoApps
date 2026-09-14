// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sharp from 'sharp';

/**
 * The orientation step, with real sharp on a generated image and the model
 * mocked. No request leaves the process: generateGemini is a mock and fetch is
 * stubbed to return the generated image.
 */

const mocks = vi.hoisted(() => {
  class AiBlockedError extends Error {
    reason: string;
    constructor(args: { message: string; reason: string }) {
      super(args.message);
      this.reason = args.reason;
    }
  }
  return { AiBlockedError, generateGemini: vi.fn() };
});

vi.mock('@neram/ai', () => ({ AiBlockedError: mocks.AiBlockedError, generateGemini: mocks.generateGemini }));

import {
  decideRotation,
  detectAndFixOrientation,
  parseOrientation,
  MODEL_IMAGE_MAX_SIDE,
} from './drawing-orientation';

const IMAGE = 'https://storage.example/drawing-uploads/student-1/1.jpg';

describe('parseOrientation', () => {
  it('reads a well-formed answer', () => {
    expect(parseOrientation('{"rotateClockwise":90,"confidence":"high"}')).toEqual({ rotateClockwise: 90, confidence: 'high' });
  });

  it('rejects a turn that is not a quarter turn', () => {
    expect(parseOrientation('{"rotateClockwise":45,"confidence":"high"}')).toBeNull();
  });

  it('rejects an unknown confidence and text that is not JSON', () => {
    expect(parseOrientation('{"rotateClockwise":90,"confidence":"certain"}')).toBeNull();
    expect(parseOrientation('turn it 90')).toBeNull();
  });
});

describe('decideRotation', () => {
  it('turns only on a high confidence, non-zero answer', () => {
    expect(decideRotation({ rotateClockwise: 270, confidence: 'high' }, false)).toEqual({ turn: 270, write: true });
  });

  it('never turns on a medium or low answer', () => {
    expect(decideRotation({ rotateClockwise: 90, confidence: 'medium' }, false)).toEqual({ turn: 0, write: false });
    expect(decideRotation({ rotateClockwise: 180, confidence: 'low' }, false)).toEqual({ turn: 0, write: false });
  });

  it('writes nothing for an upright sheet or no answer', () => {
    expect(decideRotation({ rotateClockwise: 0, confidence: 'high' }, false)).toEqual({ turn: 0, write: false });
    expect(decideRotation(null, false)).toEqual({ turn: 0, write: false });
  });

  it('still writes the upright pixels when EXIF alone turned the photo', () => {
    expect(decideRotation(null, true)).toEqual({ turn: 0, write: true });
  });
});

describe('detectAndFixOrientation', () => {
  let landscape: Buffer;
  const uploads: Array<{ path: string; body: Buffer }> = [];
  const updates: Array<{ values: Record<string, unknown>; filters: Array<[string, string, unknown]> }> = [];
  let updateRows = 1;

  function admin() {
    return {
      storage: {
        from: () => ({
          upload: async (path: string, body: Buffer) => {
            uploads.push({ path, body });
            return { error: null };
          },
          getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.example/drawing-uploads/${path}` } }),
        }),
      },
      from: () => {
        const entry = { values: {} as Record<string, unknown>, filters: [] as Array<[string, string, unknown]> };
        const chain: any = {
          update: (v: Record<string, unknown>) => ((entry.values = v), chain),
          eq: (c: string, v: unknown) => (entry.filters.push(['eq', c, v]), chain),
          is: (c: string, v: unknown) => (entry.filters.push(['is', c, v]), chain),
          select: async () => {
            updates.push(entry);
            return { data: Array.from({ length: updateRows }, () => ({ id: 'sub-1' })), error: null };
          },
        };
        return chain;
      },
    };
  }

  const submission = { id: 'sub-1', student_id: 'student-1', original_image_url: IMAGE };

  beforeEach(async () => {
    uploads.length = 0;
    updates.length = 0;
    updateRows = 1;
    mocks.generateGemini.mockReset();
    // 1600 wide, 800 tall.
    landscape = await sharp({ create: { width: 1600, height: 800, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array(landscape), { status: 200, headers: { 'content-type': 'image/jpeg' } })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the model a small copy, never the full photo', async () => {
    mocks.generateGemini.mockResolvedValue({ text: '{"rotateClockwise":0,"confidence":"high"}', model: 'm' });
    await detectAndFixOrientation(admin(), submission);
    const part = mocks.generateGemini.mock.calls[0][0].parts[0];
    const meta = await sharp(Buffer.from(part.inline_data.data, 'base64')).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(MODEL_IMAGE_MAX_SIDE);
    expect(mocks.generateGemini.mock.calls[0][0].feature).toBe('nexus.drawing-eval');
  });

  it('turns a confidently sideways sheet, stores a new object and points the sheet at it, guarded', async () => {
    mocks.generateGemini.mockResolvedValue({ text: '{"rotateClockwise":90,"confidence":"high"}', model: 'm' });
    const outcome = await detectAndFixOrientation(admin(), submission);

    expect(outcome.rotatedDeg).toBe(90);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].path).toMatch(/^student-1\/auto-upright-\d+\.jpg$/);
    const meta = await sharp(uploads[0].body).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(1600);

    expect(updates).toHaveLength(1);
    expect(updates[0].values).toEqual({ original_image_url: outcome.imageUrl, auto_rotated_deg: 90 });
    expect(updates[0].filters).toEqual([
      ['eq', 'id', 'sub-1'],
      ['eq', 'original_image_url', IMAGE],
      ['eq', 'status', 'submitted'],
      ['is', 'reviewed_image_url', null],
    ]);
  });

  it('leaves the sheet alone on a medium confidence answer', async () => {
    mocks.generateGemini.mockResolvedValue({ text: '{"rotateClockwise":90,"confidence":"medium"}', model: 'm' });
    const outcome = await detectAndFixOrientation(admin(), submission);
    expect(outcome.rotatedDeg).toBeNull();
    expect(outcome.imageUrl).toBe(IMAGE);
    expect(uploads).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it('keeps the student version when the sheet changed while it was being turned', async () => {
    mocks.generateGemini.mockResolvedValue({ text: '{"rotateClockwise":180,"confidence":"high"}', model: 'm' });
    updateRows = 0;
    const outcome = await detectAndFixOrientation(admin(), submission);
    expect(outcome.rotatedDeg).toBeNull();
    expect(outcome.imageUrl).toBe(IMAGE);
    expect(outcome.reason).toMatch(/changed/);
  });

  it('lets a refusal from the AI controls reach the caller', async () => {
    mocks.generateGemini.mockRejectedValue(new mocks.AiBlockedError({ message: 'off', reason: 'feature_off' }));
    await expect(detectAndFixOrientation(admin(), submission)).rejects.toBeInstanceOf(mocks.AiBlockedError);
  });

  it('carries on unturned when the model call fails for another reason', async () => {
    mocks.generateGemini.mockRejectedValue(new Error('boom'));
    const outcome = await detectAndFixOrientation(admin(), submission);
    expect(outcome.rotatedDeg).toBeNull();
    expect(outcome.reason).toMatch(/could not run/);
  });

  it('carries on unturned when the photo cannot be downloaded', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));
    const outcome = await detectAndFixOrientation(admin(), submission);
    expect(outcome.reason).toMatch(/404/);
    expect(mocks.generateGemini).not.toHaveBeenCalled();
  });
});
