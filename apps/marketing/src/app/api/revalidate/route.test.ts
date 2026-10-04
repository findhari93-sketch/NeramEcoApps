// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag: (tag: string) => revalidateTag(tag) }));

import { POST } from './route';

const SECRET = 'test-revalidate-secret-1234567890';

function req(body: unknown, secret?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (secret !== undefined) headers['x-revalidate-secret'] = secret;
  return new NextRequest('http://localhost/api/revalidate', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('POST /api/revalidate', () => {
  const original = process.env.REVALIDATE_SECRET;
  beforeEach(() => {
    revalidateTag.mockClear();
    process.env.REVALIDATE_SECRET = SECRET;
  });
  afterEach(() => {
    process.env.REVALIDATE_SECRET = original;
  });

  it('refuses when the secret header is missing', async () => {
    const res = await POST(req({ tags: ['reviews'] }));
    expect(res.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('refuses a wrong secret, including one of a different length', async () => {
    expect((await POST(req({ tags: ['reviews'] }, 'nope'))).status).toBe(401);
    expect((await POST(req({ tags: ['reviews'] }, SECRET.replace(/.$/, 'x')))).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('is disabled (503) when REVALIDATE_SECRET is not configured', async () => {
    delete process.env.REVALIDATE_SECRET;
    const res = await POST(req({ tags: ['reviews'] }, ''));
    expect(res.status).toBe(503);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects a body without a tags array', async () => {
    expect((await POST(req({}, SECRET))).status).toBe(400);
    expect((await POST(req('not json', SECRET))).status).toBe(400);
    expect((await POST(req({ tags: 'reviews' }, SECRET))).status).toBe(400);
  });

  it('revalidates only allowlisted tags, once each', async () => {
    const res = await POST(req({ tags: ['reviews', 'public-review-stats', 'reviews', 'everything', '/'] }, SECRET));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.revalidated).toEqual(['reviews', 'public-review-stats']);
    expect(json.ignored).toEqual(['everything', '/']);
    expect(revalidateTag.mock.calls.map((c) => c[0])).toEqual(['reviews', 'public-review-stats']);
  });

  it('answers 400 when no tag is allowlisted', async () => {
    const res = await POST(req({ tags: ['unknown'] }, SECRET));
    expect(res.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
