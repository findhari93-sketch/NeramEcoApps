import { describe, it, expect, vi, beforeEach } from 'vitest';

// App-only token is irrelevant to the resolution logic under test.
vi.mock('./graph-app-token', () => ({
  getAppOnlyToken: vi.fn(async () => 'test-token'),
}));

import { getSharePointStreamUrl } from './sharepoint';

type FetchHandler = (url: string, opts?: RequestInit) => Promise<unknown>;

function mockFetch(handler: FetchHandler) {
  global.fetch = vi.fn((input: unknown, opts?: RequestInit) =>
    handler(String(input), opts),
  ) as unknown as typeof fetch;
}

function jsonRes(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  };
}

function redirectRes(status: number, location: string | null) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    headers: { get: (h: string) => (h.toLowerCase() === 'location' ? location : null) },
  };
}

// A real /:b:/ document sharing link (the shape that fails today) and a /:v:/ video link.
const DOC_URL = 'https://nerasmclasses.sharepoint.com/:b:/s/Site/IQabc?e=xyz';
const VIDEO_URL = 'https://nerasmclasses.sharepoint.com/:v:/s/Site/IQvid?e=xyz';

describe('getSharePointStreamUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves a /:b:/ document link via the downloadUrl annotation (requested WITHOUT $select)', async () => {
    mockFetch(async (url) => {
      if (url.includes('/driveItem/content')) return redirectRes(302, null);
      // The correct call omits $select so the annotation is present.
      if (url.includes('/driveItem') && !url.includes('$select')) {
        return jsonRes(200, { id: 'x', '@microsoft.graph.downloadUrl': 'https://blob/doc.pdf' });
      }
      // Graph strips @microsoft.graph.downloadUrl when it is named in $select.
      if (url.includes('$select')) return jsonRes(200, { id: 'x' });
      return jsonRes(404, {});
    });
    await expect(getSharePointStreamUrl(DOC_URL)).resolves.toBe('https://blob/doc.pdf');
  });

  it('falls back to /content 302 when the downloadUrl annotation is absent', async () => {
    mockFetch(async (url) => {
      if (url.includes('/driveItem/content')) return redirectRes(302, 'https://blob/from-content.pdf');
      if (url.includes('/driveItem')) return jsonRes(200, { id: 'x' }); // no annotation, ever
      return jsonRes(404, {});
    });
    await expect(getSharePointStreamUrl(DOC_URL)).resolves.toBe('https://blob/from-content.pdf');
  });

  it('still resolves a /:v:/ video sharing link (no regression)', async () => {
    mockFetch(async (url) => {
      if (url.includes('/driveItem/content')) return redirectRes(302, null);
      if (url.includes('/driveItem') && !url.includes('$select')) {
        return jsonRes(200, { id: 'v', '@microsoft.graph.downloadUrl': 'https://blob/video.mp4' });
      }
      if (url.includes('$select')) return jsonRes(200, { id: 'v' });
      return jsonRes(404, {});
    });
    await expect(getSharePointStreamUrl(VIDEO_URL)).resolves.toBe('https://blob/video.mp4');
  });

  it('throws for an unresolvable non-SharePoint URL', async () => {
    mockFetch(async () => jsonRes(404, {}));
    await expect(getSharePointStreamUrl('https://cdn3.digialm.com/foo.pdf')).rejects.toThrow(
      /could not resolve/i,
    );
  });
});
