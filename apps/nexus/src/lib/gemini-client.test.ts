import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { generateGeminiText, GEMINI_MODELS } from './gemini-client';

/**
 * The transport's contract, which is entirely about which failures are worth a
 * second call and which are not.
 *
 * This used to live inside class-summary-ai, where it was tested only through a
 * summary. Now that a nightly sweep depends on it too, the distinctions are
 * asserted directly: callers branch on the '429' in the message, and a caller
 * that retried a bad key across three models would turn one wasted call into
 * three.
 */

const ok = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

const fail = (status: number) => new Response(JSON.stringify({ error: { status } }), { status });

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateGeminiText', () => {
  it('returns the first candidate’s text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok('{"a":1}')));
    await expect(generateGeminiText({ parts: [{ text: 'hi' }] })).resolves.toBe('{"a":1}');
  });

  it('stops at the first model that answers', async () => {
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);
    await generateGeminiText({ parts: [{ text: 'hi' }] });
    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as any)[0]).toContain(GEMINI_MODELS[0]);
  });

  it('falls through to the next model on 404, because Google retires them silently', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(fail(404))
      .mockResolvedValueOnce(ok('{"ok":true}'));
    vi.stubGlobal('fetch', f);

    await expect(generateGeminiText({ parts: [{ text: 'hi' }] })).resolves.toBe('{"ok":true}');
    expect(f).toHaveBeenCalledTimes(2);
    expect((f.mock.calls[1] as any)[0]).toContain(GEMINI_MODELS[1]);
  });

  it('falls through on 429, since the quota is per model', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(ok('{"ok":true}'));
    vi.stubGlobal('fetch', f);

    await expect(generateGeminiText({ parts: [{ text: 'hi' }] })).resolves.toBe('{"ok":true}');
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('says 429 in the message when every model is limited, because callers branch on it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fail(429)));
    await expect(generateGeminiText({ parts: [{ text: 'hi' }] })).rejects.toThrow(/429/);
  });

  it.each([400, 403])('gives up immediately on %i: that is the key, not the model', async (status) => {
    const f = vi.fn(async () => fail(status));
    vi.stubGlobal('fetch', f);

    await expect(generateGeminiText({ parts: [{ text: 'hi' }] })).rejects.toThrow(/GEMINI_API_KEY/);
    // Retrying two more models with a bad key is three wasted calls, not one.
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('treats an empty candidate as a failure rather than returning ""', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok('')));
    await expect(generateGeminiText({ parts: [{ text: 'hi' }] })).rejects.toThrow(/empty/i);
  });

  it('reads the key at call time, so setting it later still works', async () => {
    delete process.env.GEMINI_API_KEY;
    vi.stubGlobal('fetch', vi.fn(async () => ok('{}')));

    await expect(generateGeminiText({ parts: [{ text: 'hi' }] })).rejects.toThrow(/GEMINI_API_KEY/);

    process.env.GEMINI_API_KEY = 'set-after-import';
    await expect(generateGeminiText({ parts: [{ text: 'hi' }] })).resolves.toBe('{}');
  });

  it('asks for JSON by default, which is what every caller parses', async () => {
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);
    await generateGeminiText({ parts: [{ text: 'hi' }] });

    const body = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('omits systemInstruction entirely when there is none', async () => {
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);
    await generateGeminiText({ parts: [{ text: 'hi' }] });

    // Gemini rejects a systemInstruction with an empty parts array.
    expect(JSON.parse((f.mock.calls[0] as any)[1].body)).not.toHaveProperty('systemInstruction');
  });
});
