// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PadClientError, padFetch, padUpload } from './pad-fetch';
import type { PadHost } from './pad-host';

const host = (getToken: () => Promise<string>): PadHost => ({
  kind: 'test',
  meeting: null,
  frame: 'sidePanel',
  theme: 'light',
  getToken,
  onResume: () => () => undefined,
  onThemeChange: () => () => undefined,
});

let fetchSpy: Mock;

beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response(JSON.stringify({ sessionId: 's1' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('padFetch', () => {
  it('sends the host token, and a JSON body only when there is one', async () => {
    await expect(padFetch(host(async () => 'tok'), '/api/pad/join', { method: 'POST', body: { code: '482913' } })).resolves.toEqual({ sessionId: 's1' });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pad/join');
    expect(init).toMatchObject({ method: 'POST', cache: 'no-store', body: '{"code":"482913"}' });
    expect(init.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });

    await padFetch(host(async () => 'tok'), '/api/pad/sessions/s1/snapshot');
    const [, getInit] = fetchSpy.mock.calls[1] as [string, RequestInit];
    expect(getInit).toMatchObject({ method: 'GET', body: undefined });
    expect(getInit.headers).toEqual({ Authorization: 'Bearer tok' });
  });

  it('surfaces a refusal with its status, code, message and detail', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ error: 'PROMPT_NOT_OPEN', code: 'PROMPT_NOT_OPEN', state: 'closed' }), { status: 409 }));
    const err = await padFetch(host(async () => 'tok'), '/api/pad/submit', { method: 'POST', body: {} }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PadClientError);
    expect(err).toMatchObject({ status: 409, code: 'PROMPT_NOT_OPEN', message: 'PROMPT_NOT_OPEN', offline: false });
    expect((err as PadClientError).detail).toMatchObject({ state: 'closed' });
  });

  it('copes with an error page that is not JSON', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(padFetch(host(async () => 'tok'), '/api/pad/heartbeat')).rejects.toMatchObject({ status: 502, code: null, message: 'Request failed (502)' });
  });

  it('reports a dropped connection as offline', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(padFetch(host(async () => 'tok'), '/api/pad/submit', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 0, code: 'OFFLINE', offline: true });
  });

  it('lets an abort through as an abort, not as offline', async () => {
    fetchSpy.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    await expect(padFetch(host(async () => 'tok'), '/api/pad/sessions/s1/snapshot')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('refuses without calling the server when there is no token', async () => {
    await expect(padFetch(host(async () => Promise.reject(new Error('consent required'))), '/api/pad/join')).rejects.toMatchObject({ status: 401, code: 'NO_TOKEN' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('padUpload', () => {
  it('sends the picture as form data with the host token, leaving the boundary to the browser', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ url: 'https://x.test/a.jpg' }), { status: 200 }));
    const file = new File([new Uint8Array(8)], 'question.jpg', { type: 'image/jpeg' });
    await expect(padUpload(host(async () => 'tok'), '/api/pad/sessions/s1/image', file, 'question.jpg')).resolves.toEqual({ url: 'https://x.test/a.jpg' });

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/pad/sessions/s1/image');
    expect(init.headers).toEqual({ Authorization: 'Bearer tok' });
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('turns a refusal into the same coded error padFetch gives, and no network into OFFLINE', async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ error: 'RATE_LIMITED', code: 'RATE_LIMITED' }), { status: 429 }));
    const file = new File([new Uint8Array(8)], 'q.jpg', { type: 'image/jpeg' });
    await expect(padUpload(host(async () => 'tok'), '/api/pad/sessions/s1/image', file, 'q.jpg')).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' });

    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(padUpload(host(async () => 'tok'), '/api/pad/sessions/s1/image', file, 'q.jpg')).rejects.toMatchObject({ code: 'OFFLINE' });
  });
});
