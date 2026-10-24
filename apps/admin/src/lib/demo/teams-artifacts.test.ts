import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@neram/auth', () => ({ getAppOnlyToken: vi.fn(async () => 'app-token') }));

import { demoRecordingPlayUrl } from './teams-artifacts';

const DOWNLOAD = 'https://neram-my.sharepoint.com/download.aspx?tempauth=abc';

/**
 * What Graph really does (checked on DEMO-8Y4P, 24 Oct): a $select request
 * answers 200 with only the selected fields and leaves the download link out,
 * even when $select names @microsoft.graph.downloadUrl. A plain GET has it.
 */
function fakeGraph() {
  return vi.fn(async (url: string) => {
    const body = url.includes('$select')
      ? { id: 'item1' }
      : { id: 'item1', name: 'Demo.mp4', '@microsoft.graph.downloadUrl': DOWNLOAD };
    return new Response(JSON.stringify(body), { status: 200 });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('demoRecordingPlayUrl', () => {
  it('returns the short-lived download link for the picked recording', async () => {
    const fetchMock = fakeGraph();
    vi.stubGlobal('fetch', fetchMock);
    expect(await demoRecordingPlayUrl('b!drive', 'item1')).toBe(DOWNLOAD);
    expect(fetchMock.mock.calls[0][0]).toContain('/drives/b!drive/items/item1');
  });

  it('returns null when Graph refuses the item', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    expect(await demoRecordingPlayUrl('b!drive', 'gone')).toBeNull();
  });
});
