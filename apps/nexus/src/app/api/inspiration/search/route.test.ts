import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api-errors';
import { makeRow } from '@/lib/inspiration-test-rows';

const mocks = vi.hoisted(() => ({
  resolveCaller: vi.fn(),
  searchInspiration: vi.fn(),
  getInspirationFacets: vi.fn(),
}));

vi.mock('@/lib/inspiration-access', () => ({
  resolveInspirationCaller: (h: string | null) => mocks.resolveCaller(h),
}));
vi.mock('@neram/database/queries/nexus', () => ({
  searchInspiration: (...a: unknown[]) => mocks.searchInspiration(...a),
  getInspirationFacets: (...a: unknown[]) => mocks.getInspirationFacets(...a),
}));

import { GET } from './route';

const request = (qs: string) =>
  new NextRequest(`http://localhost/api/inspiration/search?${qs}`, { headers: { Authorization: 'Bearer token' } });

describe('GET /api/inspiration/search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchInspiration.mockResolvedValue({
      rows: [makeRow({ is_visible: false, auto_eligible: false, score_pct: 0.6 })],
      total: 31,
      matchKind: 'text',
    });
    mocks.getInspirationFacets.mockResolvedValue([{ facet: 'type', value: 'still_life', label: 'Still Life', item_count: 4 }]);
  });

  it('holds a student to the visible scope and sends nothing a teacher sees', async () => {
    mocks.resolveCaller.mockResolvedValue({ user: { id: 's1' }, staff: false });
    const res = await GET(request('q=bag&type=still_life&scope=hidden'));
    expect(res.status).toBe(200);
    expect(mocks.searchInspiration).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'bag', types: ['still_life'], scope: 'visible', savedOnly: false, limit: 30, offset: 0 }),
      's1',
    );
    const body = await res.json();
    expect(body.items[0].staff).toBeUndefined();
    expect(JSON.stringify(body.items)).not.toMatch(/score|curation|authorId|author_id|tutor/i);
    expect(body).toMatchObject({ total: 31, matchKind: 'text', hasMore: true });
    expect(body.facets).toHaveLength(1);
  });

  it('gives staff the hidden scope and the reason a drawing is hidden', async () => {
    mocks.resolveCaller.mockResolvedValue({ user: { id: 't1' }, staff: true });
    const body = await (await GET(request('scope=hidden'))).json();
    expect(mocks.searchInspiration.mock.calls[0][0]).toMatchObject({ scope: 'hidden' });
    expect(body.items[0].staff).toMatchObject({ hiddenReason: 'Below 4 stars or 80%' });
  });

  it('skips facets after the first page and for Saved', async () => {
    mocks.resolveCaller.mockResolvedValue({ user: { id: 's1' }, staff: false });
    const later = await (await GET(request('offset=30'))).json();
    const saved = await (await GET(request('saved=1'))).json();
    expect(mocks.getInspirationFacets).not.toHaveBeenCalled();
    expect(later.facets).toBeNull();
    expect(saved.facets).toBeNull();
    expect(mocks.searchInspiration.mock.calls[1][0]).toMatchObject({ savedOnly: true });
  });

  it('answers 404 while the feature is off', async () => {
    mocks.resolveCaller.mockRejectedValue(new ApiError('Inspiration is not available yet.', 404));
    const res = await GET(request(''));
    expect(res.status).toBe(404);
    expect(mocks.searchInspiration).not.toHaveBeenCalled();
  });
});
