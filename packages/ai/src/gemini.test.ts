import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The transport's contract, which is mostly about which failures are worth a
 * second call and which are not. These cases came from
 * apps/nexus/src/lib/gemini-client.test.ts and are kept because the reasoning
 * behind each one still holds: callers branch on the '429' in the message, and
 * a caller that retried a bad key across three models would turn one wasted
 * call into three.
 *
 * What is new here is metering. Every assertion about usage rows is really an
 * assertion that the control panel will not lie.
 */

const recordAiUsage = vi.fn();
const getNexusSetting = vi.fn();
const getAiSpend = vi.fn();
const getAiSpendForFeature = vi.fn();

vi.mock('@neram/database', () => ({
  recordAiUsage: (...a: unknown[]) => recordAiUsage(...a),
  getNexusSetting: (...a: unknown[]) => getNexusSetting(...a),
  getAiSpend: (...a: unknown[]) => getAiSpend(...a),
  getAiSpendForFeature: (...a: unknown[]) => getAiSpendForFeature(...a),
  utcDay: () => '2026-08-04',
  utcMonthStart: () => '2026-08-01',
}));

import { AiBlockedError, buildManualPrompt, generateGemini, generateGeminiText } from './gemini';
import { clearBudgetCache } from './budget';
import { TIER_MODELS } from './pricing';

/** A 'document' tier feature: it attaches a PDF, so it must avoid the lite models. */
const FEATURE = 'nexus.chapter-test';

const ok = (text: string, usage?: Record<string, number>) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: usage ?? { promptTokenCount: 100, candidatesTokenCount: 50 },
    }),
    { status: 200 }
  );

const fail = (status: number) => new Response(JSON.stringify({ error: { status } }), { status });

const zeroSpend = { calls: 0, blockedCalls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0 };

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  delete process.env.GEMINI_API_KEY_FREE;
  clearBudgetCache();
  // recordAiUsage is async, so the mock has to return a promise: the client
  // attaches a .catch to it and a bare undefined would throw right there.
  recordAiUsage.mockReset().mockResolvedValue(undefined);
  getNexusSetting.mockReset().mockResolvedValue(null);
  getAiSpend.mockReset().mockResolvedValue(zeroSpend);
  getAiSpendForFeature.mockReset().mockResolvedValue(zeroSpend);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generateGeminiText', () => {
  it('returns the first candidate’s text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok('{"a":1}')));
    await expect(generateGeminiText({ feature: FEATURE, parts: [{ text: 'hi' }] })).resolves.toBe(
      '{"a":1}'
    );
  });

  it('stops at the first model that answers', async () => {
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);
    await generateGeminiText({ feature: FEATURE, parts: [{ text: 'hi' }] });

    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as any)[0]).toContain(TIER_MODELS.document[0]);
  });

  it('falls through to the next model on 404, because Google retires them silently', async () => {
    const f = vi.fn().mockResolvedValueOnce(fail(404)).mockResolvedValueOnce(ok('{"ok":true}'));
    vi.stubGlobal('fetch', f);

    await expect(generateGeminiText({ feature: FEATURE, parts: [{ text: 'hi' }] })).resolves.toBe(
      '{"ok":true}'
    );
    expect((f.mock.calls[1] as any)[0]).toContain(TIER_MODELS.document[1]);
  });

  it('falls through on 429, since the quota is per model', async () => {
    const f = vi.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok('{"ok":true}'));
    vi.stubGlobal('fetch', f);

    await expect(generateGeminiText({ feature: FEATURE, parts: [{ text: 'hi' }] })).resolves.toBe(
      '{"ok":true}'
    );
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('says 429 in the message when every model is limited, because callers branch on it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fail(429)));
    await expect(generateGeminiText({ feature: FEATURE, parts: [{ text: 'hi' }] })).rejects.toThrow(
      /429/
    );
  });

  it.each([400, 403])('gives up immediately on %i: that is the key, not the model', async (status) => {
    const f = vi.fn(async () => fail(status));
    vi.stubGlobal('fetch', f);

    await expect(generateGeminiText({ feature: FEATURE, parts: [{ text: 'hi' }] })).rejects.toThrow(
      /GEMINI_API_KEY/
    );
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('treats an empty candidate as a failure rather than returning ""', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok('')));
    await expect(generateGeminiText({ feature: FEATURE, parts: [{ text: 'hi' }] })).rejects.toThrow(
      /empty/i
    );
  });

  it('reads the key at call time, so setting it later still works', async () => {
    delete process.env.GEMINI_API_KEY;
    vi.stubGlobal('fetch', vi.fn(async () => ok('{}')));

    await expect(generateGeminiText({ feature: FEATURE, parts: [{ text: 'hi' }] })).rejects.toThrow(
      /GEMINI_API_KEY/
    );

    process.env.GEMINI_API_KEY = 'set-after-import';
    await expect(generateGeminiText({ feature: FEATURE, parts: [{ text: 'hi' }] })).resolves.toBe('{}');
  });

  it('asks for JSON by default, which is what most callers parse', async () => {
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);
    await generateGeminiText({ feature: FEATURE, parts: [{ text: 'hi' }] });

    const body = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('omits systemInstruction entirely when there is none', async () => {
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);
    await generateGeminiText({ feature: FEATURE, parts: [{ text: 'hi' }] });

    // Gemini rejects a systemInstruction with an empty parts array.
    expect(JSON.parse((f.mock.calls[0] as any)[1].body)).not.toHaveProperty('systemInstruction');
  });
});

describe('the model list', () => {
  it('never spends a round trip on a model Google has shut down', async () => {
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);

    await generateGeminiText({
      feature: FEATURE,
      parts: [{ text: 'hi' }],
      models: ['gemini-2.0-flash', 'gemini-2.5-flash'],
    });

    expect(f).toHaveBeenCalledTimes(1);
    expect((f.mock.calls[0] as any)[0]).toContain('gemini-2.5-flash');
  });

  it('picks the cascade from the feature tier, not from the caller', async () => {
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);

    // nexus.answer-explain is a cheap-tier feature.
    await generateGeminiText({ feature: 'nexus.answer-explain', parts: [{ text: 'hi' }] });
    expect((f.mock.calls[0] as any)[0]).toContain(TIER_MODELS.cheap[0]);
  });
});

describe('metering', () => {
  it('records the exact token counts Gemini reported', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok('{}', { promptTokenCount: 1000, candidatesTokenCount: 200 }))
    );

    const result = await generateGemini({ feature: FEATURE, parts: [{ text: 'hi' }] });

    expect(result.usage.promptTokens).toBe(1000);
    expect(result.usage.outputTokens).toBe(200);
    // gemini-2.5-flash: 1000/1M * 0.30 + 200/1M * 2.50
    expect(result.costUsd).toBe(0.0008);
  });

  it('bills thinking tokens, which the 2.5 models report separately', async () => {
    // Counting only candidatesTokenCount understates every reasoning call.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ok('{}', { promptTokenCount: 0, candidatesTokenCount: 100, thoughtsTokenCount: 900 })
      )
    );

    const result = await generateGemini({ feature: FEATURE, parts: [{ text: 'hi' }] });
    expect(result.usage.outputTokens).toBe(1000);
  });

  it('writes a usage row on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok('{}')));
    await generateGemini({ feature: FEATURE, parts: [{ text: 'hi' }], actorId: 'user-1' });

    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ featureId: FEATURE, app: 'nexus', status: 'ok', actorId: 'user-1' })
    );
  });

  it('records which model actually answered, not which was asked for', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(fail(404)).mockResolvedValueOnce(ok('{}'))
    );
    await generateGemini({ feature: FEATURE, parts: [{ text: 'hi' }] });

    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: TIER_MODELS.document[1] })
    );
  });

  it('records a rate limit as its own status, not as a generic error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fail(429)));
    await expect(generateGemini({ feature: FEATURE, parts: [{ text: 'hi' }] })).rejects.toThrow();

    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rate_limited' })
    );
  });

  it('never lets a logging failure break a working answer', async () => {
    // recordAiUsage swallows its own errors, but prove the client does not
    // await it in a way that could surface one.
    recordAiUsage.mockImplementation(() => Promise.reject(new Error('supabase down')));
    vi.stubGlobal('fetch', vi.fn(async () => ok('{"fine":true}')));

    await expect(generateGeminiText({ feature: FEATURE, parts: [{ text: 'hi' }] })).resolves.toBe(
      '{"fine":true}'
    );
  });
});

describe('the budget gate', () => {
  it('never calls Gemini when the feature is set to manual', async () => {
    getNexusSetting.mockResolvedValue({ value: { modes: { [FEATURE]: 'manual' } } });
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);

    await expect(generateGemini({ feature: FEATURE, parts: [{ text: 'hi' }] })).rejects.toThrow(
      AiBlockedError
    );
    expect(f).not.toHaveBeenCalled();
  });

  it('hands back a runnable prompt when it refuses a manual-capable feature', async () => {
    getNexusSetting.mockResolvedValue({ value: { modes: { [FEATURE]: 'manual' } } });
    vi.stubGlobal('fetch', vi.fn(async () => ok('{}')));

    const err = await generateGemini({
      feature: FEATURE,
      parts: [{ text: 'Write ten questions.' }],
    }).catch((e) => e as AiBlockedError);

    expect(err).toBeInstanceOf(AiBlockedError);
    expect(err.reason).toBe('manual');
    expect(err.manualPrompt).toContain('Write ten questions.');
  });

  it('offers no prompt for a public chatbot, which has nobody to run it', async () => {
    getNexusSetting.mockResolvedValue({ value: { masterEnabled: false } });
    vi.stubGlobal('fetch', vi.fn(async () => ok('{}')));

    const err = await generateGemini({
      feature: 'marketing.site-chat',
      parts: [{ text: 'hi' }],
    }).catch((e) => e as AiBlockedError);

    expect(err.supportsManual).toBe(false);
    expect(err.manualPrompt).toBeNull();
  });

  it('logs a blocked call so the panel can show what the controls prevented', async () => {
    getNexusSetting.mockResolvedValue({ value: { dailyCapUsd: 1 } });
    getAiSpend.mockResolvedValue({ ...zeroSpend, costUsd: 5 });
    vi.stubGlobal('fetch', vi.fn(async () => ok('{}')));

    await generateGemini({ feature: FEATURE, parts: [{ text: 'hi' }] }).catch(() => {});

    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'blocked_budget', error: 'daily_cap' })
    );
  });
});

describe('the request shapes each app needs', () => {
  it('sends a multi-turn conversation when given contents', async () => {
    const f = vi.fn(async () => ok('hello'));
    vi.stubGlobal('fetch', f);

    await generateGemini({
      feature: 'marketing.site-chat',
      contents: [
        { role: 'user', parts: [{ text: 'hi' }] },
        { role: 'model', parts: [{ text: 'hello' }] },
        { role: 'user', parts: [{ text: 'and?' }] },
      ],
      responseMimeType: 'text/plain',
    });

    const body = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(body.contents).toHaveLength(3);
    expect(body.contents[1].role).toBe('model');
  });

  it('passes tools through, for the site chatbot’s function calling', async () => {
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);

    const tools = [{ functionDeclarations: [{ name: 'getCourses' }] }];
    await generateGemini({ feature: 'marketing.site-chat', parts: [{ text: 'hi' }], tools });

    expect(JSON.parse((f.mock.calls[0] as any)[1].body).tools).toEqual(tools);
  });

  it('returns function calls instead of treating them as an empty answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                { content: { parts: [{ functionCall: { name: 'getCourses', args: {} } }] } },
              ],
              usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
            }),
            { status: 200 }
          )
      )
    );

    const result = await generateGemini({ feature: 'marketing.site-chat', parts: [{ text: 'hi' }] });
    expect(result.functionCalls).toEqual([{ name: 'getCourses', args: {} }]);
  });

  it('passes responseSchema through, which the admin review needs', async () => {
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);

    const schema = { type: 'object', properties: { verdict: { type: 'string' } } };
    await generateGemini({ feature: 'admin.chat-review', parts: [{ text: 'hi' }], responseSchema: schema });

    expect(JSON.parse((f.mock.calls[0] as any)[1].body).generationConfig.responseSchema).toEqual(
      schema
    );
  });

  it('carries inline PDF and image data', async () => {
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);

    await generateGemini({
      feature: FEATURE,
      parts: [{ text: 'read this' }, { inline_data: { mime_type: 'application/pdf', data: 'AAA' } }],
    });

    const body = JSON.parse((f.mock.calls[0] as any)[1].body);
    expect(body.contents[0].parts[1].inline_data.mime_type).toBe('application/pdf');
  });
});

describe('the free key', () => {
  it('is tried first for a feature that allows it', async () => {
    process.env.GEMINI_API_KEY_FREE = 'free-key';
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);

    await generateGemini({ feature: 'marketing.site-chat', parts: [{ text: 'hi' }] });

    expect((f.mock.calls[0] as any)[0]).toContain('key=free-key');
  });

  it('is never used for a feature carrying student data', async () => {
    process.env.GEMINI_API_KEY_FREE = 'free-key';
    const f = vi.fn(async () => ok('{}'));
    vi.stubGlobal('fetch', f);

    await generateGemini({ feature: FEATURE, parts: [{ text: 'hi' }] });

    expect((f.mock.calls[0] as any)[0]).toContain('key=test-key');
  });

  it('falls back to the paid key when the free tier is exhausted', async () => {
    process.env.GEMINI_API_KEY_FREE = 'free-key';
    const f = vi
      .fn()
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(fail(429))
      .mockResolvedValueOnce(ok('{"paid":true}'));
    vi.stubGlobal('fetch', f);

    const result = await generateGemini({ feature: 'marketing.site-chat', parts: [{ text: 'hi' }] });

    expect(result.keyTier).toBe('paid');
    expect((f.mock.calls[2] as any)[0]).toContain('key=test-key');
  });

  it('does not let a bad free key take down the request', async () => {
    // 403 on the paid key is fatal, but on the free key it just means the
    // second project is misconfigured. The work should still get done.
    process.env.GEMINI_API_KEY_FREE = 'bad-key';
    const f = vi
      .fn()
      .mockResolvedValueOnce(fail(403))
      .mockResolvedValueOnce(fail(403))
      .mockResolvedValueOnce(ok('{"paid":true}'));
    vi.stubGlobal('fetch', f);

    const result = await generateGemini({ feature: 'marketing.site-chat', parts: [{ text: 'hi' }] });
    expect(result.keyTier).toBe('paid');
  });
});

describe('buildManualPrompt', () => {
  it('joins the system instruction and the text parts', () => {
    const prompt = buildManualPrompt({
      feature: FEATURE,
      systemInstruction: 'You are a question writer.',
      parts: [{ text: 'Chapter 3.' }],
    });

    expect(prompt).toContain('You are a question writer.');
    expect(prompt).toContain('Chapter 3.');
  });

  it('names a file that has to be attached by hand', () => {
    const prompt = buildManualPrompt({
      feature: FEATURE,
      parts: [{ inline_data: { mime_type: 'application/pdf', data: 'AAA' } }],
    });

    expect(prompt).toContain('attach the application/pdf file');
    // Never paste megabytes of base64 into a chat box.
    expect(prompt).not.toContain('AAA');
  });

  it('asks for bare JSON, since the answer gets pasted back into a parser', () => {
    const prompt = buildManualPrompt({ feature: FEATURE, parts: [{ text: 'go' }] });
    expect(prompt).toMatch(/JSON only/);
  });
});
