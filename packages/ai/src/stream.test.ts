import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Streaming: streamGemini, streamWithBackup and the SSE reader under them.
 *
 * The site chatbot shows answers word by word. What matters is that streaming
 * changes nothing else: the same cascade, the same 402 handling, the same usage
 * rows, and a backup that streams too (Gemini is the one out of credit).
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

import { AiBillingError, streamGemini } from './gemini';
import { readSse } from './sse';
import { clearBudgetCache } from './budget';

const SITE_CHAT = 'marketing.site-chat';
const ADMIN_TEXT = 'admin.kb-refine';
const zeroSpend = { calls: 0, blockedCalls: 0, promptTokens: 0, outputTokens: 0, costUsd: 0 };

/** An SSE body that arrives in the given raw pieces, so chunk boundaries can fall anywhere. */
function sseResponse(pieces: string[], opts: { failAfter?: boolean } = {}): Response {
  const encoder = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < pieces.length) {
        controller.enqueue(encoder.encode(pieces[i++]));
      } else if (opts.failAfter) {
        controller.error(new Error('socket hang up'));
      } else {
        controller.close();
      }
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const geminiEvent = (payload: unknown) => `data: ${JSON.stringify(payload)}\r\n\r\n`;
const geminiText = (text: string, finishReason?: string) =>
  geminiEvent({ candidates: [{ content: { parts: [{ text }] }, ...(finishReason ? { finishReason } : {}) }] });
const chatEvent = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;
const chatDelta = (content: string, finish_reason: string | null = null) =>
  chatEvent({ choices: [{ delta: { content }, finish_reason }] });
const fail = (status: number) => new Response(JSON.stringify({ error: { status } }), { status });

function stubFetch(handlers: { gemini?: () => Response; groq?: () => Response; openrouter?: () => Response }) {
  const fn = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes('generativelanguage')) return (handlers.gemini ?? (() => fail(402)))();
    if (url.includes('api.groq.com')) return (handlers.groq ?? (() => fail(500)))();
    if (url.includes('openrouter.ai')) return (handlers.openrouter ?? (() => fail(500)))();
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const siteChat = (onText: (d: string) => void) => ({
  feature: SITE_CHAT as const,
  responseMimeType: 'text/plain',
  contents: [{ role: 'user' as const, parts: [{ text: 'What are the fees?' }] }],
  onText,
});

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'test-key';
  process.env.GROQ_API_KEY = 'groq-test';
  process.env.OPENROUTER_API_KEY = 'or-test';
  delete process.env.GEMINI_API_KEY_FREE;
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

describe('readSse', () => {
  it('joins events split across reads and skips comments and [DONE]-style payloads untouched', async () => {
    const seen: string[] = [];
    await readSse(sseResponse([': keep-alive\n\nda', 'ta: one\n', '\ndata: two\n\n', 'data: [DONE]\n\n']), (d) =>
      seen.push(d),
    );
    expect(seen).toEqual(['one', 'two', '[DONE]']);
  });

  it('throws when the connection drops, so a cut answer is not mistaken for a finished one', async () => {
    await expect(readSse(sseResponse(['data: one\n\n'], { failAfter: true }), () => {})).rejects.toThrow(
      'socket hang up',
    );
  });
});

describe('streamGemini', () => {
  it('hands each delta over as it arrives and returns the whole answer', async () => {
    const fn = stubFetch({
      gemini: () =>
        sseResponse([
          geminiText('Our 1-Year '),
          geminiText('Program is '),
          geminiEvent({
            candidates: [{ content: { parts: [{ text: '₹25,000.' }] }, finishReason: 'STOP' }],
            usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 30 },
          }),
        ]),
    });
    const deltas: string[] = [];

    const out = await streamGemini(siteChat((d) => deltas.push(d)));

    expect(deltas).toEqual(['Our 1-Year ', 'Program is ', '₹25,000.']);
    expect(out.text).toBe('Our 1-Year Program is ₹25,000.');
    expect(out.modelParts).toEqual([{ text: 'Our 1-Year Program is ₹25,000.' }]);
    expect(out.finishReason).toBe('STOP');
    expect(String(fn.mock.calls[0][0])).toContain(':streamGenerateContent?alt=sse');
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', promptTokens: 900, outputTokens: 30 }),
    );
  });

  it('returns a function call whole, signature included, so the tool loop can replay it', async () => {
    const call = { functionCall: { name: 'search_colleges', args: { city: 'Chennai' } }, thoughtSignature: 'sig' };
    stubFetch({ gemini: () => sseResponse([geminiEvent({ candidates: [{ content: { parts: [call] }, finishReason: 'STOP' }] })]) });
    const deltas: string[] = [];

    const out = await streamGemini(siteChat((d) => deltas.push(d)));

    expect(deltas).toEqual([]);
    expect(out.functionCalls).toEqual([{ name: 'search_colleges', args: { city: 'Chennai' } }]);
    expect(out.modelParts).toEqual([call]);
  });

  it('skips thinking parts in what the visitor sees', async () => {
    stubFetch({
      gemini: () =>
        sseResponse([
          geminiEvent({ candidates: [{ content: { parts: [{ text: 'plan the answer', thought: true }] } }] }),
          geminiText('Hello', 'STOP'),
        ]),
    });
    const deltas: string[] = [];
    await streamGemini(siteChat((d) => deltas.push(d)));
    expect(deltas).toEqual(['Hello']);
  });

  it('ends a dropped stream as INTERRUPTED with what already arrived, rather than failing over', async () => {
    const fn = stubFetch({ gemini: () => sseResponse([geminiText('Half an ')], { failAfter: true }) });

    const out = await streamGemini(siteChat(() => {}));

    expect(out.text).toBe('Half an ');
    expect(out.finishReason).toBe('INTERRUPTED');
    expect(fn.mock.calls.some((c) => String(c[0]).includes('groq'))).toBe(false);
  });

  it('streams from Groq when Gemini is out of credit (402)', async () => {
    const fn = stubFetch({
      groq: () =>
        sseResponse([
          chatDelta('\n'),
          chatDelta('Fees start '),
          chatDelta('at ₹15,000.', 'stop'),
          chatEvent({ choices: [], usage: { prompt_tokens: 800, completion_tokens: 12 } }),
          'data: [DONE]\n\n',
        ]),
    });
    const deltas: string[] = [];

    const out = await streamGemini(siteChat((d) => deltas.push(d)));

    expect(deltas.join('')).toBe('Fees start at ₹15,000.');
    expect(out.text).toBe('Fees start at ₹15,000.');
    expect(out.model).toBe('groq/openai/gpt-oss-120b');
    expect(out.finishReason).toBe('STOP');
    const groqCall = fn.mock.calls.find((c) => String(c[0]).includes('api.groq.com'))!;
    expect(JSON.parse(String((groqCall[1] as RequestInit).body)).stream).toBe(true);
    expect(recordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ok', model: 'groq/openai/gpt-oss-120b', promptTokens: 800, outputTokens: 12 }),
    );
  });

  it('moves to OpenRouter when Groq streams nothing, and the visitor sees only one answer', async () => {
    stubFetch({
      groq: () => sseResponse([chatDelta('   ', 'stop'), 'data: [DONE]\n\n']),
      openrouter: () => sseResponse([chatDelta('From OpenRouter.', 'stop'), 'data: [DONE]\n\n']),
    });
    const deltas: string[] = [];

    const out = await streamGemini(siteChat((d) => deltas.push(d)));

    expect(deltas.join('')).toBe('From OpenRouter.');
    expect(out.model.startsWith('openrouter/')).toBe(true);
  });

  it("still throws Gemini's 402 when the feature may not fall back", async () => {
    stubFetch({});
    await expect(
      streamGemini({ feature: ADMIN_TEXT, parts: [{ text: 'hi' }], onText: () => {} }),
    ).rejects.toBeInstanceOf(AiBillingError);
  });

  it('falls through a 429 to the next Gemini model before streaming', async () => {
    let geminiCalls = 0;
    stubFetch({
      gemini: () => (++geminiCalls === 1 ? fail(429) : sseResponse([geminiText('ok', 'STOP')])),
    });
    const out = await streamGemini(siteChat(() => {}));
    expect(out.text).toBe('ok');
    expect(geminiCalls).toBe(2);
  });
});
