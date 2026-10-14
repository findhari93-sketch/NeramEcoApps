import { describe, it, expect, vi, afterEach } from 'vitest';
import { grantTtlFromSrc, armStreamGrant, armAndConfirm } from './video-grant-client';

function b64url(json: object): string {
  return btoa(JSON.stringify(json)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const src = (payload: object) => `https://media.example.com/recording?vt=${encodeURIComponent(`vid_${b64url(payload)}.sig`)}`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('grantTtlFromSrc', () => {
  it('reads the lifetime of the grant in an absolute or relative stream URL', () => {
    const payload = { iat: 1_000, exp: 1_600 };
    expect(grantTtlFromSrc(src(payload))).toBe(600);
    expect(grantTtlFromSrc(`/api/media/recording?vt=vid_${b64url(payload)}.sig`)).toBe(600);
  });

  it('is null for a URL with no grant, so the refresh stays off', () => {
    for (const value of [null, '', 'blob:stream', 'https://x.example/a.mp4', '/api/media/recording?vt=other', src({ iat: 5 })]) {
      expect(grantTtlFromSrc(value)).toBeNull();
    }
  });
});

describe('arming', () => {
  function stubFetch(...replies: Array<object | number | Error>) {
    const fetchMock = vi.fn();
    for (const reply of replies) {
      if (reply instanceof Error) fetchMock.mockRejectedValueOnce(reply);
      else if (typeof reply === 'number') fetchMock.mockResolvedValueOnce(new Response('{}', { status: reply }));
      else fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(reply), { status: 200 }));
    }
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('POSTs to the stream URL itself, with credentials, uncached', async () => {
    const fetchMock = stubFetch({ armed: true, cookie: true });
    const url = src({ iat: 1, exp: 601 });
    expect(await armStreamGrant(url)).toEqual({ armed: true, cookie: true });
    expect(fetchMock).toHaveBeenCalledWith(url, { method: 'POST', credentials: 'include', cache: 'no-store' });
  });

  it('never throws: a 405 from an old Worker or a network error is just "not armed"', async () => {
    stubFetch(405, new Error('offline'));
    expect(await armStreamGrant('x')).toEqual({ armed: false, cookie: false });
    expect(await armStreamGrant('x')).toEqual({ armed: false, cookie: false });
  });

  it('confirms with a second request only when the first could not tell', async () => {
    let fetchMock = stubFetch({ armed: true, cookie: true });
    expect(await armAndConfirm('x')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock = stubFetch({ armed: true, cookie: false }, { armed: true, cookie: true });
    expect(await armAndConfirm('x')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports a browser that drops the cookie', async () => {
    stubFetch({ armed: true, cookie: false }, { armed: true, cookie: false });
    expect(await armAndConfirm('x')).toBe(false);
  });
});
