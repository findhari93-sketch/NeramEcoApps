import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssistantHttpError, confirmActionRequest, postTurn } from './client';

const getToken = async () => 'tok';

afterEach(() => { vi.unstubAllGlobals(); });

describe('postTurn', () => {
  it('posts the body with the bearer token and returns the envelope', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ reply: 'hi', suggestions: [], links: [], action: null, mode: 'general', threadId: 't1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const env = await postTurn(getToken, { threadId: null, text: 'brief', pageContext: { path: '/student/dashboard' } });
    expect(env.threadId).toBe('t1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/assistant/turn');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(String(init.body))).toMatchObject({ text: 'brief', pageContext: { path: '/student/dashboard' } });
  });

  it('throws AssistantHttpError carrying the status and the server message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'not switched on for your account yet' }), { status: 403 })));
    await expect(postTurn(getToken, { threadId: null, text: 'x' })).rejects.toMatchObject({ name: 'AssistantHttpError', status: 403, message: 'not switched on for your account yet' });
  });

  it('turns a network failure (fetch TypeError, no status) into a plain offline sentence', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(postTurn(getToken, { threadId: null, text: 'x' })).rejects.toMatchObject({
      name: 'AssistantHttpError', status: 0, message: 'You seem to be offline. Check your connection and try again.',
    });
  });

  it('fails with 401 when there is no token, without calling the server', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(postTurn(async () => null, { threadId: null, text: 'x' })).rejects.toBeInstanceOf(AssistantHttpError);
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
