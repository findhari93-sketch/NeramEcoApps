import { describe, expect, test, vi } from 'vitest';
import { GbpClient } from './client';
import { mapCentresToLocations, runGbpSync } from './sync';

/**
 * A tiny in-memory stand-in for the Supabase builder: enough for the sync's
 * select / insert / update / upsert with eq, is and not.
 */
function fakeDb(seed: Record<string, any[]>) {
  const tables: Record<string, any[]> = JSON.parse(JSON.stringify(seed));
  let seq = 0;
  const t = (name: string) => (tables[name] = tables[name] || []);
  function builder(name: string) {
    const filters: Array<(r: any) => boolean> = [];
    let mode: 'select' | 'insert' | 'update' | 'upsert' = 'select';
    let payload: any = null;
    let conflict = '';
    const run = () => {
      if (mode === 'insert') {
        const rows = (Array.isArray(payload) ? payload : [payload]).map((r: any) => ({ id: `${name}-${++seq}`, ...r }));
        t(name).push(...rows);
        return { data: rows, error: null };
      }
      if (mode === 'upsert') {
        for (const r of payload as any[]) {
          const hit = t(name).find((x) => x[conflict] === r[conflict]);
          if (hit) Object.assign(hit, r);
          else t(name).push({ id: `${name}-${++seq}`, ...r });
        }
        return { data: null, error: null };
      }
      const rows = t(name).filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') rows.forEach((r) => Object.assign(r, payload));
      return { data: rows, error: null };
    };
    const b: any = {
      select: () => b,
      insert: (p: any) => ((mode = 'insert'), (payload = p), b),
      update: (p: any) => ((mode = 'update'), (payload = p), b),
      upsert: (p: any, o: { onConflict: string }) => ((mode = 'upsert'), (payload = p), (conflict = o.onConflict), b),
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
      is: (c: string, v: any) => (filters.push((r) => (r[c] ?? null) === v), b),
      not: (c: string, _op: string, v: any) => (filters.push((r) => (r[c] ?? null) !== v), b),
      single: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (resolve: any) => resolve(run()),
    };
    return b;
  }
  return { client: { from: builder }, tables };
}

const CENTRES = [
  { id: 'c-cbe', name: 'Coimbatore', google_place_id: 'PLACE_CBE', gbp_location_name: null, is_active: true },
  { id: 'c-mdu', name: 'Madurai', google_place_id: null, gbp_location_name: null, is_active: true },
];

describe('mapCentresToLocations', () => {
  test('maps by saved name first, then by Place ID', () => {
    const m = mapCentresToLocations(
      [
        { id: 'a', name: 'A', google_place_id: 'P1', gbp_location_name: null },
        { id: 'b', name: 'B', google_place_id: 'P9', gbp_location_name: 'locations/2' },
        { id: 'c', name: 'C', google_place_id: null, gbp_location_name: null },
      ],
      [
        { name: 'locations/1', metadata: { placeId: 'P1' } },
        { name: 'locations/2', metadata: { placeId: 'P2' } },
      ],
    );
    expect(m.map((x) => [x.centre.id, x.location.name, x.isNew])).toEqual([
      ['a', 'locations/1', true],
      ['b', 'locations/2', false],
    ]);
  });
});

describe('runGbpSync', () => {
  test('upserts reviews, copies Google totals, saves the mapping and matches a student', async () => {
    const { client: db, tables } = fakeDb({
      offline_centers: CENTRES,
      review_requests: [
        { id: 'rr-1', student_name: 'Priya Sharma', google_clicked_at: '2026-10-01T10:00:00Z', google_review_id: null, testimonial: null },
      ],
      gbp_reviews: [{ id: 'old', google_review_name: 'accounts/1/locations/9/reviews/a', reply_draft: 'kept draft', star_rating: 3 }],
    });
    const api = {
      listLocations: vi.fn().mockResolvedValue([{ name: 'locations/9', metadata: { placeId: 'PLACE_CBE' } }]),
      listReviews: vi.fn().mockResolvedValue({
        averageRating: 4.94,
        totalReviewCount: 101,
        reviews: [
          { name: 'accounts/1/locations/9/reviews/a', reviewer: { displayName: 'Priya Sharma' }, starRating: 'FIVE', comment: 'Great', createTime: '2026-10-01T10:30:00Z' },
          { name: 'accounts/1/locations/9/reviews/b', reviewer: { displayName: 'Someone Else' }, starRating: 'FOUR', comment: 'Nice', createTime: '2026-10-02T10:30:00Z' },
        ],
      }),
    };

    const summary = await runGbpSync({ supabase: db, client: api, trigger: 'manual', now: new Date('2026-10-10T00:00:00Z') });

    expect(summary).toMatchObject({ status: 'ok', locations: 1, reviewsUpserted: 2, matched: 1, unmappedCentres: ['Madurai'] });
    const cbe = tables.offline_centers.find((c) => c.id === 'c-cbe');
    expect(cbe).toMatchObject({ gbp_location_name: 'locations/9', rating: 4.9, review_count: 101 });
    const a = tables.gbp_reviews.find((r) => r.google_review_name.endsWith('/a'));
    expect(a).toMatchObject({ star_rating: 5, reply_draft: 'kept draft', review_request_id: 'rr-1' });
    expect(tables.review_requests[0].google_review_id).toBe('accounts/1/locations/9/reviews/a');
    expect(tables.gbp_sync_runs[0]).toMatchObject({ trigger: 'manual', status: 'ok', reviews_upserted: 2, matched: 1 });
  });

  test('a location that fails makes the run partial, not lost', async () => {
    const { client: db, tables } = fakeDb({
      offline_centers: [
        { ...CENTRES[0] },
        { id: 'c-two', name: 'Two', google_place_id: 'P2', gbp_location_name: null, is_active: true },
      ],
      review_requests: [],
    });
    const api = {
      listLocations: vi.fn().mockResolvedValue([
        { name: 'locations/9', metadata: { placeId: 'PLACE_CBE' } },
        { name: 'locations/2', metadata: { placeId: 'P2' } },
      ]),
      listReviews: vi
        .fn()
        .mockResolvedValueOnce({ averageRating: 5, totalReviewCount: 1, reviews: [{ name: 'r/1', starRating: 'FIVE', createTime: '2026-10-01T00:00:00Z' }] })
        .mockRejectedValueOnce(new Error('quota')),
    };
    const summary = await runGbpSync({ supabase: db, client: api, trigger: 'cron' });
    expect(summary.status).toBe('partial');
    expect(summary.errors[0]).toMatch(/Two: quota/);
    expect(tables.gbp_sync_runs[0].status).toBe('partial');
  });

  test('cannot list locations: the run fails with the reason', async () => {
    const { client: db, tables } = fakeDb({ offline_centers: CENTRES });
    const api = { listLocations: vi.fn().mockRejectedValue(new Error('PERMISSION_DENIED')), listReviews: vi.fn() };
    const summary = await runGbpSync({ supabase: db, client: api, trigger: 'cron' });
    expect(summary.status).toBe('failed');
    expect(tables.gbp_sync_runs[0].error).toMatch(/PERMISSION_DENIED/);
  });
});

describe('GbpClient', () => {
  const config = { clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh', accountId: '123' };

  test('refreshes the token once and pages through reviews', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }));
      if (url.includes('pageToken=p2')) return new Response(JSON.stringify({ reviews: [{ name: 'r2' }], averageRating: 4.8, totalReviewCount: 2 }));
      return new Response(JSON.stringify({ reviews: [{ name: 'r1' }], nextPageToken: 'p2' }));
    });
    const client = new GbpClient(config, fetchImpl as any);
    const out = await client.listReviews('locations/9');
    expect(out).toEqual({ reviews: [{ name: 'r1' }, { name: 'r2' }], averageRating: 4.8, totalReviewCount: 2 });
    expect(calls.filter((c) => c.includes('oauth2'))).toHaveLength(1);
    expect(calls[1]).toContain('/v4/accounts/123/locations/9/reviews');
  });

  test('a rejected sign-in names the reason', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    await expect(new GbpClient(config, fetchImpl as any).listLocations()).rejects.toThrow(/invalid_grant/);
  });

  test('posts a reply to the review resource', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'tok' }));
      expect(url).toBe('https://mybusiness.googleapis.com/v4/accounts/123/locations/9/reviews/a/reply');
      expect(init?.method).toBe('PUT');
      return new Response(JSON.stringify({ comment: 'Thanks!' }));
    });
    await expect(new GbpClient(config, fetchImpl as any).updateReply('accounts/123/locations/9/reviews/a', 'Thanks!')).resolves.toMatchObject({ comment: 'Thanks!' });
  });
});
