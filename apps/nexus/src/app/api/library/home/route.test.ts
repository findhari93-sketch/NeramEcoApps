// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const verifyMsToken = vi.fn();
vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: (...a: unknown[]) => verifyMsToken(...a) }));

const getVideosByCategory = vi.fn();
const getTopicCounts = vi.fn();
vi.mock('@neram/database/queries/nexus', () => ({
  getVideosByCategory: (...a: unknown[]) => getVideosByCategory(...a),
  getTopicCounts: (...a: unknown[]) => getTopicCounts(...a),
}));

// Pass-through cache so the test sees the computation; record the options.
const { cacheCalls } = vi.hoisted(() => ({
  cacheCalls: [] as Array<{ keys: string[]; opts: { revalidate?: number; tags?: string[] } }>,
}));
vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...a: unknown[]) => unknown, keys: string[], opts: { revalidate?: number; tags?: string[] }) => {
    cacheCalls.push({ keys, opts });
    return fn;
  },
  revalidateTag: vi.fn(),
}));

import { GET } from './route';

const request = () => new NextRequest('http://localhost/api/library/home', { headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  verifyMsToken.mockReset();
  getVideosByCategory.mockReset();
  getTopicCounts.mockReset();
});

describe('GET /api/library/home', () => {
  it('checks auth before reading anything', async () => {
    verifyMsToken.mockRejectedValue(new Error('Not authorized'));
    const res = await GET(request());
    expect(res.status).toBe(500);
    expect(getVideosByCategory).not.toHaveBeenCalled();
  });

  it('serves the shared rows, dropping empty categories', async () => {
    verifyMsToken.mockResolvedValue({ oid: 'o' });
    getVideosByCategory.mockImplementation(async (key: string) => (key === 'drawing' ? [{ id: 'v1' }] : []));
    getTopicCounts.mockResolvedValue([{ topic: 'perspective', video_count: 3 }]);
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sections).toEqual([{ key: 'drawing', label: 'Drawing', videos: [{ id: 'v1' }] }]);
    expect(body.topics).toHaveLength(1);
  });

  it('is wrapped in a five minute cache tagged library', () => {
    const call = cacheCalls.find((c) => c.keys.includes('library-home-v1'));
    expect(call?.opts).toEqual({ revalidate: 300, tags: ['library'] });
  });
});
