// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MARKETING_CACHE_TAGS, revalidateMarketing } from './marketing-revalidate';

describe('revalidateMarketing', () => {
  const env = { ...process.env };
  beforeEach(() => {
    process.env.REVALIDATE_SECRET = 'sekret';
    delete process.env.NEXT_PUBLIC_MARKETING_URL;
  });
  afterEach(() => {
    process.env = { ...env };
    vi.useRealTimers();
  });

  it('POSTs the tags to the marketing origin paired with this admin host', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const ok = await revalidateMarketing([MARKETING_CACHE_TAGS.reviews, MARKETING_CACHE_TAGS.reviewStats], {
      adminOrigin: 'https://staging-admin.neramclasses.com',
      fetchImpl,
    });
    expect(ok).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://staging.neramclasses.com/api/revalidate');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-revalidate-secret']).toBe('sekret');
    expect(JSON.parse(String(init.body))).toEqual({ tags: ['reviews', 'public-review-stats'] });
  });

  it('uses NEXT_PUBLIC_MARKETING_URL when it is set', async () => {
    process.env.NEXT_PUBLIC_MARKETING_URL = 'https://example.test/';
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    await revalidateMarketing(['reviews'], { adminOrigin: 'https://admin.neramclasses.com', fetchImpl });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('https://example.test/api/revalidate');
  });

  it('does nothing without REVALIDATE_SECRET', async () => {
    delete process.env.REVALIDATE_SECRET;
    const fetchImpl = vi.fn();
    expect(await revalidateMarketing(['reviews'], { adminOrigin: 'https://admin.neramclasses.com', fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never throws: network errors and non-2xx answers return false', async () => {
    const boom = vi.fn(async () => {
      throw new Error('down');
    });
    expect(await revalidateMarketing(['reviews'], { adminOrigin: 'https://admin.neramclasses.com', fetchImpl: boom })).toBe(false);
    const bad = vi.fn(async () => new Response('no', { status: 401 }));
    expect(await revalidateMarketing(['reviews'], { adminOrigin: 'https://admin.neramclasses.com', fetchImpl: bad })).toBe(false);
  });

  it('gives up after the timeout so a slow marketing site never holds the save', async () => {
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const started = Date.now();
    const ok = await revalidateMarketing(['reviews'], { adminOrigin: 'https://admin.neramclasses.com', fetchImpl: hang as unknown as typeof fetch, timeoutMs: 50 });
    expect(ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});
