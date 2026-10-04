import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantHttpError, OFFLINE, confirmActionRequest, isRetryable, newMessageId, postTurn } from './client';

const getToken = async () => 'tok';

afterEach(() => { vi.unstubAllGlobals(); });

describe('postTurn', () => {
  it('posts the body with the bearer token and returns the envelope', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ reply: 'hi', suggestions: [], links: [], action: null, mode: 'general', threadId: 't1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = await postTurn(getToken, { threadId: null, text: 'brief', pageContext: { path: '/student/dashboard' }, clientMessageId: 'a1b2c3d4-0000-4000-8000-000000000001' });
    expect(env.threadId).toBe('t1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/assistant/turn');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))).toMatchObject({ text: 'brief', pageContext: { path: '/student/dashboard' } });
  });

  it('throws AssistantHttpError carrying the status and the server message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'not switched on for your account yet' }), { status: 403 })));
    await expect(postTurn(getToken, { threadId: null, text: 'x', clientMessageId: 'a1b2c3d4-0000-4000-8000-000000000001' })).rejects.toMatchObject({ name: 'AssistantHttpError', status: 403, message: 'not switched on for your account yet' });
  });

  it('turns a network failure (fetch TypeError, no status) into a plain offline sentence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(postTurn(getToken, { threadId: null, text: 'x', clientMessageId: 'a1b2c3d4-0000-4000-8000-000000000001' })).rejects.toMatchObject({
      name: 'AssistantHttpError', status: 0, message: 'You seem to be offline. Check your connection and try again.',
    });
  });

  it('fails with 401 when there is no token, without calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(postTurn(async () => null, { threadId: null, text: 'x', clientMessageId: 'a1b2c3d4-0000-4000-8000-000000000001' })).rejects.toBeInstanceOf(AssistantHttpError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('confirmActionRequest', () => {
  it('posts the token to the action route', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, reply: 'Done.', links: [], threadId: 't1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await confirmActionRequest(getToken, 'a1', 'ct');
    expect(out.reply).toBe('Done.');
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe('/api/assistant/actions/a1');
  });
});

describe('isRetryable', () => {
  it('is true for no response and server faults, false for answers that would repeat', () => {
    expect(isRetryable(new AssistantHttpError(OFFLINE, 0))).toBe(true);
    expect(isRetryable(new AssistantHttpError('x', 500))).toBe(true);
    expect(isRetryable(new AssistantHttpError('x', 503))).toBe(true);
    expect(isRetryable(new TypeError('Failed to fetch'))).toBe(true);
    for (const s of [400, 401, 409, 413, 429]) expect(isRetryable(new AssistantHttpError('x', s))).toBe(false);
  });

  it('makes uuid message ids', () => {
    expect(newMessageId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newMessageId()).not.toBe(newMessageId());
  });
});
