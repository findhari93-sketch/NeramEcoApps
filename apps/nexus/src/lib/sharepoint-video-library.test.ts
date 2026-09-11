import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./graph-app-token', () => ({
  getAppOnlyToken: vi.fn(async () => 'test-token'),
}));

import { getLibraryVideoFolderUrl, clearLibraryFolderCache } from './sharepoint-video';

/**
 * "Open the Class videos folder", the link a teacher follows to put a recording
 * into SharePoint before picking it in Nexus.
 *
 * The configured folder, nexus/class-videos, does not exist on this tenant yet
 * (probed 2026-09-11: the library holds "nexus" and "Questionbank Solutions").
 * A link that 404s would strand the teacher at exactly the step this is for, so
 * it falls back to the nearest folder that does exist.
 */

const calls: string[] = [];

function mockFetch(handler: (url: string) => unknown) {
  calls.length = 0;
  global.fetch = vi.fn(async (input: unknown) => {
    calls.push(String(input));
    return handler(String(input));
  }) as unknown as typeof fetch;
}

const jsonRes = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  headers: { get: () => null },
});

const ORIGINAL_ENV = process.env;

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, SHAREPOINT_SITE_ID: 'site-1', SHAREPOINT_VIDEO_ROOT: 'nexus/class-videos' };
  clearLibraryFolderCache();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe('getLibraryVideoFolderUrl', () => {
  it('links to the class videos folder when it exists', async () => {
    mockFetch((url) =>
      url.includes('root:/nexus/class-videos') ? jsonRes(200, { webUrl: 'https://lib/nexus/class-videos' }) : jsonRes(404, {}),
    );
    await expect(getLibraryVideoFolderUrl()).resolves.toBe('https://lib/nexus/class-videos');
  });

  it('falls back to the nearest folder that does exist, which on this tenant is nexus', async () => {
    mockFetch((url) => {
      if (url.includes('root:/nexus/class-videos')) return jsonRes(404, {});
      if (url.includes('root:/nexus')) return jsonRes(200, { webUrl: 'https://lib/nexus' });
      return jsonRes(404, {});
    });
    await expect(getLibraryVideoFolderUrl()).resolves.toBe('https://lib/nexus');
  });

  it('falls back to the library itself when no folder on the path exists', async () => {
    mockFetch((url) => (url.endsWith('/drive?$select=webUrl') ? jsonRes(200, { webUrl: 'https://lib' }) : jsonRes(404, {})));
    await expect(getLibraryVideoFolderUrl()).resolves.toBe('https://lib');
  });

  it('remembers the answer rather than asking Graph on every page load', async () => {
    mockFetch(() => jsonRes(200, { webUrl: 'https://lib/nexus/class-videos' }));
    await getLibraryVideoFolderUrl();
    await getLibraryVideoFolderUrl();
    expect(calls).toHaveLength(1);
  });

  it('does not remember a failure', async () => {
    mockFetch(() => jsonRes(503, {}));
    await expect(getLibraryVideoFolderUrl()).resolves.toBeNull();
    mockFetch(() => jsonRes(200, { webUrl: 'https://lib/nexus/class-videos' }));
    await expect(getLibraryVideoFolderUrl()).resolves.toBe('https://lib/nexus/class-videos');
  });

  it('returns null when no library is configured', async () => {
    delete process.env.SHAREPOINT_SITE_ID;
    delete process.env.SHAREPOINT_SITE_URL;
    mockFetch(() => jsonRes(200, { webUrl: 'https://lib' }));
    await expect(getLibraryVideoFolderUrl()).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });
});
