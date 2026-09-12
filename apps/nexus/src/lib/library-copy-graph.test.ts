import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./graph-app-token', () => ({
  getAppOnlyToken: vi.fn(async () => 'test-token'),
}));
vi.mock('./sharepoint', () => ({
  getSiteId: vi.fn(async () => 'site-1'),
}));

import { ensureLibraryFolder, readLibraryCopy, startLibraryCopy } from './library-copy-graph';
import { VideoItemError, type ResolvedVideoItem } from './sharepoint-video';

/**
 * Copying a OneDrive recording into the Neram library, against Microsoft Graph.
 *
 * Graph copies a file in the background: the request answers 202 with a
 * progress address, and that address is read without a token until it reports
 * the new file's id (learn.microsoft.com/graph/long-running-actions-overview).
 * Every response below is the shape those docs and the tenant probe returned.
 */

interface Call {
  url: string;
  init?: RequestInit;
}

const calls: Call[] = [];

function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  calls.length = 0;
  global.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return handler(String(input), init);
  }) as unknown as typeof fetch;
}

function res(status: number, body: unknown = {}, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
  };
}

const authOf = (call: Call) => {
  const headers = (call.init?.headers || {}) as Record<string, string>;
  return headers.Authorization ?? null;
};

const MONITOR = 'https://nerasmclasses-my.sharepoint.com/_api/v2.0/monitor/4A3407B5-88FC-4504-8B21-0AABD3412717';

const SOURCE: ResolvedVideoItem = {
  driveId: 'b!onedrive',
  itemId: '01ONEDRIVEITEM',
  name: '1.History of Architecture.mp4',
  sizeBytes: 877174153,
  durationSeconds: 3758,
  webUrl: 'https://nerasmclasses-my.sharepoint.com/personal/haribabu_neramclasses_com/Documents/1.History%20of%20Architecture.mp4',
  folderPath: null,
  driveType: 'business',
  mimeType: 'video/mp4',
  isFolder: false,
};

const DEST = { driveId: 'b!library', folderId: 'chapter-folder', path: 'nexus/class-videos/Ch 1 History Of Architecture' };

const COPY_ITEM = {
  id: '01COPYITEM',
  name: '1.History of Architecture.mp4',
  size: 877174153,
  file: { mimeType: 'video/mp4' },
  video: { duration: 3757909 },
  webUrl:
    'https://nerasmclasses.sharepoint.com/sites/NeramStorage/Shared%20Documents/nexus/class-videos/Ch%201%20History%20Of%20Architecture/1.History%20of%20Architecture.mp4',
  parentReference: {
    driveId: 'b!library',
    driveType: 'documentLibrary',
    path: '/drives/b!library/root:/nexus/class-videos/Ch 1 History Of Architecture',
  },
};

beforeEach(() => {
  calls.length = 0;
});

describe('ensureLibraryFolder', () => {
  it('uses the chapter folder when it is already there, in one call', async () => {
    mockFetch(() => res(200, { id: 'chapter-folder', parentReference: { driveId: 'b!library' } }));

    const folder = await ensureLibraryFolder(['nexus', 'class-videos', 'Ch 1 History Of Architecture']);

    expect(folder).toEqual({ driveId: 'b!library', folderId: 'chapter-folder', path: 'nexus/class-videos/Ch 1 History Of Architecture' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/sites/site-1/drive/root:/nexus/class-videos/Ch%201%20History%20Of%20Architecture');
  });

  it('creates only the folders that are missing, under the one above', async () => {
    mockFetch((url, init) => {
      if (init?.method === 'POST') {
        return res(201, { id: 'new-chapter', parentReference: { driveId: 'b!library' } });
      }
      if (url.includes('root:/nexus/class-videos/Unit%202')) return res(404, { error: { code: 'itemNotFound' } });
      if (url.includes('root:/nexus/class-videos')) return res(200, { id: 'class-videos', parentReference: { driveId: 'b!library' } });
      if (url.includes('root:/nexus')) return res(200, { id: 'nexus', parentReference: { driveId: 'b!library' } });
      return res(500);
    });

    const folder = await ensureLibraryFolder(['nexus', 'class-videos', 'Unit 2']);

    expect(folder.folderId).toBe('new-chapter');
    const created = calls.filter((c) => c.init?.method === 'POST');
    expect(created).toHaveLength(1);
    expect(created[0].url).toContain('/drives/b!library/items/class-videos/children');
    const body = JSON.parse(String(created[0].init?.body));
    expect(body).toMatchObject({ name: 'Unit 2', folder: {}, '@microsoft.graph.conflictBehavior': 'fail' });
  });

  it('uses the folder another request made first, when creating it clashes', async () => {
    let chapterLooks = 0;
    mockFetch((url, init) => {
      if (init?.method === 'POST') return res(409, { error: { code: 'nameAlreadyExists' } });
      if (url.includes('root:/nexus/class-videos/Unit%202')) {
        chapterLooks += 1;
        return chapterLooks <= 2
          ? res(404, { error: { code: 'itemNotFound' } })
          : res(200, { id: 'raced-chapter', parentReference: { driveId: 'b!library' } });
      }
      if (url.includes('root:/nexus/class-videos')) return res(200, { id: 'class-videos', parentReference: { driveId: 'b!library' } });
      if (url.includes('root:/nexus')) return res(200, { id: 'nexus', parentReference: { driveId: 'b!library' } });
      return res(500);
    });

    const folder = await ensureLibraryFolder(['nexus', 'class-videos', 'Unit 2']);
    expect(folder.folderId).toBe('raced-chapter');
  });

  it('says Nexus is not allowed in, rather than creating nothing quietly', async () => {
    mockFetch(() => res(403, { error: { code: 'accessDenied' } }));
    await expect(ensureLibraryFolder(['nexus', 'class-videos'])).rejects.toMatchObject({ code: 'NO_ACCESS' });
  });
});

describe('startLibraryCopy', () => {
  it('uses a copy that already finished instead of copying the video twice', async () => {
    mockFetch(() => res(200, { value: [COPY_ITEM] }));

    const started = await startLibraryCopy(SOURCE, DEST);

    expect(started.state).toBe('done');
    if (started.state === 'done') {
      expect(started.item.itemId).toBe('01COPYITEM');
      expect(started.item.driveId).toBe('b!library');
    }
    expect(calls.some((c) => c.init?.method === 'POST')).toBe(false);
  });

  it('asks Graph to copy the file into the chapter folder, and returns where to watch it', async () => {
    mockFetch((url, init) => {
      if (init?.method === 'POST') return res(202, {}, { location: MONITOR });
      return res(200, { value: [] });
    });

    const started = await startLibraryCopy(SOURCE, DEST);

    expect(started).toEqual({ state: 'copying', monitor: MONITOR });
    const copy = calls.find((c) => c.init?.method === 'POST')!;
    expect(copy.url).toContain('/drives/b!onedrive/items/01ONEDRIVEITEM/copy');
    expect(copy.url).toContain('conflictBehavior=rename');
    const body = JSON.parse(String(copy.init?.body));
    expect(body).toEqual({ parentReference: { driveId: 'b!library', id: 'chapter-folder' } });
    // Passing a name makes Graph ignore other copy options (documented bug), and
    // the copy should keep the original's name anyway.
    expect('name' in body).toBe(false);
    expect(authOf(copy)).toBe('Bearer test-token');
  });

  it('accepts the operations address this tenant really returns, not only the documented monitor shape', async () => {
    // Probed 2026-09-11. Refusing this shape made every live copy fail as "unavailable".
    const OPERATIONS =
      'https://nerasmclasses-my.sharepoint.com/personal/haribabu_neramclasses_com/_api/v2.1/drives/b!onedrive/operations/6f2f6b69-780c-4f79-8ee3-0b37afdaf2a9?c=abc&v=2.0&tempauth=v1.secret';
    mockFetch((url, init) => (init?.method === 'POST' ? res(202, {}, { location: OPERATIONS }) : res(200, { value: [] })));
    expect(await startLibraryCopy(SOURCE, DEST)).toEqual({ state: 'copying', monitor: OPERATIONS });
  });

  it('says Nexus is not allowed to copy the file when Graph refuses', async () => {
    mockFetch((url, init) => (init?.method === 'POST' ? res(403, { error: { code: 'accessDenied' } }) : res(200, { value: [] })));
    await expect(startLibraryCopy(SOURCE, DEST)).rejects.toBeInstanceOf(VideoItemError);
    await expect(startLibraryCopy(SOURCE, DEST)).rejects.toMatchObject({ code: 'NO_ACCESS' });
  });

  it('treats an accepted copy with no progress address as SharePoint being unavailable', async () => {
    mockFetch((url, init) => (init?.method === 'POST' ? res(202, {}) : res(200, { value: [] })));
    await expect(startLibraryCopy(SOURCE, DEST)).rejects.toMatchObject({ code: 'GRAPH_UNAVAILABLE' });
  });
});

describe('readLibraryCopy', () => {
  it('reports progress, and reads the progress address without a token', async () => {
    mockFetch(() => res(202, { operation: 'ItemCopy', percentageComplete: 42, status: 'inProgress' }));

    expect(await readLibraryCopy(MONITOR, 'b!library')).toEqual({ state: 'copying', percent: 42 });
    expect(calls[0].url).toBe(MONITOR);
    expect(authOf(calls[0])).toBeNull();
  });

  it('looks up the new file once the copy has finished', async () => {
    mockFetch((url) => {
      if (url === MONITOR) return res(202, { percentageComplete: 100, resourceId: '01COPYITEM', status: 'completed' });
      return res(200, COPY_ITEM);
    });

    const progress = await readLibraryCopy(MONITOR, 'b!library');

    expect(progress.state).toBe('done');
    if (progress.state === 'done') expect(progress.item.name).toBe('1.History of Architecture.mp4');
    const lookup = calls.find((c) => c.url !== MONITOR)!;
    expect(lookup.url).toContain('/drives/b!library/items/01COPYITEM');
    expect(authOf(lookup)).toBe('Bearer test-token');
  });

  it('keeps waiting when the finished copy cannot be read yet', async () => {
    mockFetch((url) =>
      url === MONITOR ? res(202, { status: 'completed', resourceId: '01COPYITEM' }) : res(404, { error: { code: 'itemNotFound' } }),
    );
    expect(await readLibraryCopy(MONITOR, 'b!library')).toEqual({ state: 'copying', percent: 100 });
  });

  it('reports a failed copy with its reason', async () => {
    mockFetch(() => res(202, { status: 'failed', error: { code: 'nameAlreadyExists', message: 'Name already exists' } }));
    expect(await readLibraryCopy(MONITOR, 'b!library')).toMatchObject({ state: 'failed', code: 'nameAlreadyExists' });
  });

  it('says the copy was lost when its progress address no longer exists', async () => {
    mockFetch(() => res(404, {}));
    expect(await readLibraryCopy(MONITOR, 'b!library')).toMatchObject({ state: 'failed', code: 'COPY_UNKNOWN' });
  });

  it('keeps waiting through a busy moment at Microsoft', async () => {
    mockFetch(() => res(503, {}));
    expect(await readLibraryCopy(MONITOR, 'b!library')).toEqual({ state: 'copying', percent: null });
  });

  it('refuses an address that is not a copy progress address, without fetching it', async () => {
    mockFetch(() => res(200, {}));
    await expect(readLibraryCopy('https://evil.com/monitor/x', 'b!library')).rejects.toMatchObject({ code: 'LINK_NOT_RECOGNISED' });
    expect(calls).toHaveLength(0);
  });
});
