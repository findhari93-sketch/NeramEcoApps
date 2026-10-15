import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The backup providers. What matters most is what they must NOT do: answer for
 * another app, look at a drawing, or hide Gemini's own error from callers that
 * branch on it.
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
  utcDay: () => '2026-10-15',
  utcMonthStart: () => '2026-10-01',
}));

import { AiBillingError, generateGemini } from './gemini';
import { backupEligibility, generateWithBackup, toChatMessages } from './fallback';
import { clearBudgetCache } from './budget';

const NEXUS_TEXT = 'nexus.recap-questions-cron';
const zeroSpend = { calls: 0, blockedCalls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0 };

const geminiFail = (status: number) => new Response(JSON.stringify({ error: { status } }), { status });
const chatOk = (content: string) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 40 },
    }),
    { status: 200 },
  );
const chatFail = (status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: { message: 'no' } }), { status, headers });

/** Routes by host, so one stub can play Gemini, Groq and OpenRouter. */
function stubFetch(handlers: { gemini?: () => Response; groq?: () => Response; openrouter?: () => Response }) {
  const fn = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes('generativelanguage')) return (handlers.gemini ?? (() => geminiFail(402)))();
    if (url.includes('api.groq.com')) return (handlers.groq ?? (() => chatFail(500)))();
    if (url.includes('openrouter.ai')) return (handlers.openrouter ?? (() => chatFail(500)))();
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const hostsCalled = (fn: { mock: { calls: unknown[][] } }) =>
  fn.mock.calls.map((c) => new URL(String(c[0])).host);

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GROQ_API_KEY = 'groq-test';
  process.env.OPENROUTER_API_KEY = 'or-test';
  delete process.env.GEMINI_API_KEY_FREE;
  delete process.env.GEMINI_API_KEY_TUTOR;
  delete process.env.GROQ_MODELS;
  delete process.env.OPENROUTER_MODELS;
  clearBudgetCache();
  recordAiUsage.mockReset().mockResolvedValue(undefined);
  getNexusSetting.mockReset().mockResolvedValue(null);
  getAiSpend.mockReset().mockResolvedValue(zeroSpend);
  getAiSpendForFeature.mockReset().mockResolvedValue(zeroSpend);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GROQ_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
});

describe('generateGemini with a backup', () => {
  it('answers a Nexus text call from Groq when Gemini is out of credit (2026-10-15)', async () => {
    const fn = stubFetch({ groq: () => chatOk('{"segments":[]}') });

    const out = await generateGemini({ feature: NEXUS_TEXT, parts: [{ text: 'Write questions.' }] });

    expect(out.text).toBe('{"segments":[]}');
    expect(out.model).toBe('groq/openai/gpt-oss-120b');
    expect(out.keyTier).toBe('free');
    expect(out.costUsd).toBe(0);
    expect(hostsCalled(fn)).toEqual(['generativelanguage.googleapis.com', 'api.groq.com']);
    // The 402 row and the backup's ok row, so the usage page shows both.
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', model: 'groq/openai/gpt-oss-120b', keyTier: 'free', estimatedCostUsd: 0 }),
    );
  });

  it('never answers for an app outside the list (Admin), even with the keys present', async () => {
    const fn = stubFetch({ groq: () => chatOk('{}') });

    await expect(
      generateGemini({ feature: 'admin.kb-refine', parts: [{ text: 'hi' }] }),
    ).rejects.toBeInstanceOf(AiBillingError);
    expect(hostsCalled(fn)).not.toContain('api.groq.com');
  });

  it('keeps the site chatbot online on a 402: answers in text with the tools dropped', async () => {
    const fn = stubFetch({ groq: () => chatOk('Classes run on weekends.') });

    const out = await generateGemini({
      feature: 'marketing.site-chat',
      responseMimeType: 'text/plain',
      contents: [{ role: 'user', parts: [{ text: 'What are class timings?' }] }],
      tools: [{ functionDeclarations: [{ name: 'search_colleges' }] }],
    });

    expect(out.text).toBe('Classes run on weekends.');
    expect(out.functionCalls).toEqual([]);
    const groqCall = fn.mock.calls.find((c) => String(c[0]).includes('api.groq.com'))!;
    const body = JSON.parse(String((groqCall[1] as RequestInit).body));
    expect(body.tools).toBeUndefined();
    expect(body.response_format).toBeUndefined();
    expect(body.messages[0].content).toContain('Lookup tools are not available');
  });

  it('answers the other Marketing Aintra chats too (TNEA)', async () => {
    stubFetch({ groq: () => chatOk('TNEA counselling opens in June.') });

    const out = await generateGemini({
      feature: 'marketing.tnea-aintra',
      responseMimeType: 'text/plain',
      parts: [{ text: 'When is counselling?' }],
    });
    expect(out.model).toBe('groq/openai/gpt-oss-120b');
  });

  it('still refuses a Nexus feature that sends tools', async () => {
    const fn = stubFetch({ groq: () => chatOk('{}') });

    await expect(
      generateGemini({ feature: NEXUS_TEXT, parts: [{ text: 'x' }], tools: [{}] }),
    ).rejects.toBeInstanceOf(AiBillingError);
    expect(hostsCalled(fn)).not.toContain('api.groq.com');
  });

  it('leaves a drawing for Gemini: an image call waits rather than fall back', async () => {
    const fn = stubFetch({ groq: () => chatOk('{}') });

    await expect(
      generateGemini({
        feature: NEXUS_TEXT,
        parts: [{ text: 'Judge this.' }, { inline_data: { mime_type: 'image/jpeg', data: 'AAAA' } }],
      }),
    ).rejects.toBeInstanceOf(AiBillingError);
    expect(hostsCalled(fn)).not.toContain('api.groq.com');
  });

  it("rethrows Gemini's own error when the backup fails too, so callers still see the 402", async () => {
    stubFetch({ groq: () => chatFail(500), openrouter: () => chatFail(500) });

    await expect(
      generateGemini({ feature: NEXUS_TEXT, parts: [{ text: 'Write questions.' }] }),
    ).rejects.toBeInstanceOf(AiBillingError);
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'error', model: 'backup', keyTier: 'free' }),
    );
  });

  it('does nothing extra when Gemini answers', async () => {
    const fn = stubFetch({
      gemini: () =>
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{}' }] } }] }), { status: 200 }),
    });

    const out = await generateGemini({ feature: NEXUS_TEXT, parts: [{ text: 'x' }] });
    expect(out.model).not.toContain('groq');
    expect(hostsCalled(fn)).toEqual(['generativelanguage.googleapis.com']);
  });
});

describe('generateWithBackup', () => {
  const opts = { feature: NEXUS_TEXT as never, parts: [{ text: 'x' }] };

  it('waits out a short Groq rate limit once, then retries the same model', async () => {
    const replies = [chatFail(429, { 'retry-after': '2' }), chatOk('{"a":1}')];
    vi.stubGlobal('fetch', vi.fn(async () => replies.shift()!));
    const sleep = vi.fn(async () => undefined);

    const out = await generateWithBackup(opts, { sleep });
    expect(sleep).toHaveBeenCalledWith(2000);
    expect(out.model).toBe('groq/openai/gpt-oss-120b');
  });

  it('moves to the second Groq model on a long rate limit, without waiting', async () => {
    const replies = [chatFail(429, { 'retry-after': '45' }), chatOk('{"a":1}')];
    vi.stubGlobal('fetch', vi.fn(async () => replies.shift()!));
    const sleep = vi.fn(async () => undefined);

    const out = await generateWithBackup(opts, { sleep });
    expect(sleep).not.toHaveBeenCalled();
    expect(out.model).toBe('groq/qwen/qwen3.8-27b');
  });

  it('skips the rest of a provider whose key is rejected and goes to OpenRouter', async () => {
    const fn = stubFetch({ groq: () => chatFail(401), openrouter: () => chatOk('{"a":1}') });

    const out = await generateWithBackup(opts);
    expect(out.model).toBe('openrouter/nvidia/nemotron-3-super-120b-a12b:free');
    expect(hostsCalled(fn).filter((h) => h === 'api.groq.com')).toHaveLength(1);
  });

  it('goes straight to OpenRouter when Groq says the request is too large (413)', async () => {
    const fn = stubFetch({ groq: () => chatFail(413), openrouter: () => chatOk('{"a":1}') });

    const out = await generateWithBackup(opts);
    expect(out.model).toBe('openrouter/nvidia/nemotron-3-super-120b-a12b:free');
    expect(hostsCalled(fn).filter((h) => h === 'api.groq.com')).toHaveLength(1);
  });

  it("names the calling app to OpenRouter", async () => {
    const fn = stubFetch({ groq: () => chatFail(401), openrouter: () => chatOk('{}') });

    await generateWithBackup(opts, { app: 'marketing' });
    const orCall = fn.mock.calls.find((c) => String(c[0]).includes('openrouter.ai'))!;
    const headers = (orCall[1] as RequestInit).headers as Record<string, string>;
    expect(headers['X-Title']).toBe('Neram Classes');
    expect(headers['HTTP-Referer']).toBe('https://neramclasses.com');
  });

  it('sends JSON mode and a reasoning budget to gpt-oss', async () => {
    const fn = stubFetch({ groq: () => chatOk('{}') });
    await generateWithBackup({ ...opts, maxOutputTokens: 2048 });

    const body = JSON.parse(String((fn.mock.calls[0][1] as RequestInit).body));
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.reasoning_effort).toBe('low');
    expect(body.max_tokens).toBe(8192);
  });
});

describe('backupEligibility', () => {
  it('needs a key', () => {
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    expect(backupEligibility({ feature: NEXUS_TEXT as never, parts: [{ text: 'x' }] }, 'nexus')).toEqual({
      ok: false,
      reason: 'no backup key set',
    });
  });

  it('lets the site chatbot replay its tool results', () => {
    expect(
      backupEligibility(
        {
          feature: 'marketing.site-chat',
          contents: [
            { role: 'model', parts: [{ functionCall: { name: 'search_colleges', args: {} } }] },
            { role: 'user', parts: [{ functionResponse: { name: 'search_colleges', response: { ok: true } } }] },
          ],
          tools: [{}],
        },
        'marketing',
      ),
    ).toEqual({ ok: true });
  });

  it('refuses tool calls', () => {
    expect(
      backupEligibility({ feature: NEXUS_TEXT as never, parts: [{ text: 'x' }], tools: [{}] }, 'nexus').ok,
    ).toBe(false);
  });
});

describe('toChatMessages', () => {
  it('states the JSON rule and the schema in the system message, and maps model turns', () => {
    const messages = toChatMessages({
      feature: NEXUS_TEXT as never,
      systemInstruction: 'You write quizzes.',
      responseSchema: { type: 'OBJECT' },
      contents: [
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi' }, { text: 'secret', thought: true }] },
      ],
    });
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('You write quizzes.');
    expect(messages[0].content).toContain('JSON');
    expect(messages[0].content).toContain('"type":"OBJECT"');
    expect(messages.slice(1)).toEqual([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]);
  });

  it('spells out tool calls and their results as text, cut to size', () => {
    const big = 'x'.repeat(10_000);
    const messages = toChatMessages({
      feature: 'marketing.site-chat',
      responseMimeType: 'text/plain',
      contents: [
        { role: 'user', parts: [{ text: 'Colleges in Chennai?' }] },
        { role: 'model', parts: [{ functionCall: { name: 'search_colleges', args: { city: 'Chennai' } } }] },
        { role: 'user', parts: [{ functionResponse: { name: 'search_colleges', response: { rows: big } } }] },
      ],
    });
    expect(messages[2]).toEqual({ role: 'assistant', content: '[Looked up search_colleges with {"city":"Chennai"}]' });
    expect(messages[3].role).toBe('user');
    expect(messages[3].content).toContain('[Result of search_colleges:');
    expect(messages[3].content).toContain('...(cut)');
    expect(messages[3].content.length).toBeLessThan(6_200);
  });

  it('asks for no JSON on a plain-text call', () => {
    const messages = toChatMessages({
      feature: NEXUS_TEXT as never,
      responseMimeType: 'text/plain',
      parts: [{ text: 'Say hi' }],
    });
    expect(messages).toEqual([{ role: 'user', content: 'Say hi' }]);
  });
});
