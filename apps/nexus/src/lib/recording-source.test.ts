import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('./graph-app-token', () => ({
  getAppOnlyToken: vi.fn(async () => 'test-token'),
}));

import { fetchSlice, resolveRecordingSourceByIds } from './recording-source';

/**
 * Reading the mp4 in slices.
 *
 * Verified against production on 2026-07-30: all four recording_url shapes serve
 * 206 with Accept-Ranges on the pre-authenticated download URL, for leading and
 * arbitrary mid-file offsets alike. These tests pin the two ways that can still
 * go wrong at runtime: a server that quietly ignores the Range header, and one
 * that answers with fewer bytes than were asked for.
 */

const partial = (bytes: number, filler = 1) =>
  new Response(new Uint8Array(bytes).fill(filler), { status: 206 });

describe('fetchSlice', () => {
  it('asks for an inclusive byte range', async () => {
    const f = vi.fn(async () => partial(1024));
    await fetchSlice('https://dl', 0, 1024, f as any);
    expect((f.mock.calls[0] as any)[1].headers.Range).toBe('bytes=0-1023');
  });

  it('reads from an arbitrary offset, which is what makes a resume possible', async () => {
    const f = vi.fn(async () => partial(1024));
    await fetchSlice('https://dl', 8388608, 1024, f as any);
    expect((f.mock.calls[0] as any)[1].headers.Range).toBe('bytes=8388608-8389631');
  });

  it('tops up a short read rather than returning an undersized chunk', async () => {
    // A short slice that is not the final one is not a 256 KB multiple, and
    // Google rejects the chunk outright. Looping here is cheaper than finding
    // that out at the upload boundary.
    const f = vi.fn()
      .mockResolvedValueOnce(partial(600))
      .mockResolvedValueOnce(partial(424));

    const out = await fetchSlice('https://dl', 0, 1024, f as any);

    expect(out.length).toBe(1024);
    expect(f).toHaveBeenCalledTimes(2);
    expect((f.mock.calls[1] as any)[1].headers.Range).toBe('bytes=600-1023');
  });

  it('refuses a 200, which would mean the whole file is streaming at us', async () => {
    const f = vi.fn(async () => new Response(new Uint8Array(10), { status: 200 }));
    // Buffering that into a slice would quietly allocate hundreds of megabytes.
    await expect(fetchSlice('https://dl', 0, 1024, f as any)).rejects.toThrow('RANGE_NOT_SUPPORTED');
  });

  it('reports the status on any other failure', async () => {
    const f = vi.fn(async () => new Response('', { status: 403 }));
    // 403 here is usually an expired download URL, which is exactly why the URL
    // is re-resolved every run and never persisted.
    await expect(fetchSlice('https://dl', 0, 1024, f as any)).rejects.toThrow('RANGE_FETCH_403');
  });

  it('gives up rather than spinning when the server returns nothing', async () => {
    const f = vi.fn(async () => partial(0));
    await expect(fetchSlice('https://dl', 0, 1024, f as any)).rejects.toThrow('RANGE_FETCH_EMPTY');
  });
});

describe('resolveRecordingSourceByIds', () => {
  /**
   * A recording found by its SharePoint ids, which survive the folder above it
   * being moved. Probed app-only on 2026-09-17: /drives/{d}/items/{i} carries the
   * download URL when nothing is $select-ed, /content 302s to it, and that URL
   * answers a Range with 206.
   */
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function graph(handler: (url: string) => Response) {
    const calls: string[] = [];
    global.fetch = vi.fn(async (input: unknown) => {
      calls.push(String(input));
      return handler(String(input));
    }) as unknown as typeof fetch;
    return calls;
  }

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

  it('reads size, name and the download URL from the file itself', async () => {
    const calls = graph(() =>
      json(200, {
        id: '01HISTORY',
        name: 'History.mp4',
        size: 170153218,
        '@microsoft.graph.downloadUrl': 'https://dl/history',
      }),
    );
    await expect(resolveRecordingSourceByIds('b!library', '01HISTORY')).resolves.toEqual({
      downloadUrl: 'https://dl/history',
      size: 170153218,
      itemId: '01HISTORY',
      name: 'History.mp4',
    });
    expect(calls).toEqual(['https://graph.microsoft.com/v1.0/drives/b!library/items/01HISTORY']);
  });

  it('follows /content when the download URL is not on the item', async () => {
    graph((url) =>
      url.endsWith('/content')
        ? new Response(null, { status: 302, headers: { Location: 'https://dl/redirected' } })
        : json(200, { id: '01HISTORY', name: 'History.mp4', size: 10 }),
    );
    const source = await resolveRecordingSourceByIds('b!library', '01HISTORY');
    expect(source.downloadUrl).toBe('https://dl/redirected');
  });

  it('refuses a file with no size rather than guessing the byte ranges', async () => {
    graph(() => json(200, { id: '01HISTORY', name: 'History.mp4', '@microsoft.graph.downloadUrl': 'https://dl/x' }));
    await expect(resolveRecordingSourceByIds('b!library', '01HISTORY')).rejects.toThrow('RECORDING_SIZE_UNKNOWN');
  });

  it('fails when SharePoint cannot find the file by its ids', async () => {
    graph(() => json(404, { error: { code: 'itemNotFound' } }));
    await expect(resolveRecordingSourceByIds('b!library', '01GONE')).rejects.toThrow('RECORDING_ITEM_404');
  });
});
