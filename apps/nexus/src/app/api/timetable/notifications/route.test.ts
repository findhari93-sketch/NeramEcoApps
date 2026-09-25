import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The timetable bell polls this every minute. It answered 404 "User not found"
 * for a users read that failed, and 500 for everything thrown, an expired token
 * included, so the poller could not tell "sign in again" from "try later".
 * Seen on prod 2026-09-24 as two 500s in one catch-up session.
 */

const state = vi.hoisted(() => ({
  authError: null as string | null,
  userResult: { data: { id: 'u-1' }, error: null } as { data: unknown; error: unknown },
  countResult: { count: 3, error: null } as { count: number | null; error: unknown },
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'range', 'update']) b[method] = () => b;
  b.single = () => Promise.resolve(state.userResult);
  b.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve(table === 'nexus_timetable_notifications' ? state.countResult : { data: null, error: null }).then(
      onFulfilled,
    );
  return b;
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (table: string) => builder(table) }),
}));

vi.mock('@/lib/ms-verify', () => ({
  verifyMsToken: async () => {
    if (state.authError) throw new Error(state.authError);
    return { oid: 'ms-oid-1' };
  },
}));

const { GET } = await import('./route');

const count = () =>
  GET(
    new NextRequest('http://localhost/api/timetable/notifications?classroom_id=c1&countOnly=true', {
      headers: { Authorization: 'Bearer token' },
    }),
  );

beforeEach(() => {
  state.authError = null;
  state.userResult = { data: { id: 'u-1' }, error: null };
  state.countResult = { count: 3, error: null };
});

describe('GET /api/timetable/notifications?countOnly', () => {
  it('returns the unread count', async () => {
    const res = await count();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 3 });
  });

  it('answers 401, not 500, for an expired or missing token', async () => {
    state.authError = 'Invalid Microsoft token';
    expect((await count()).status).toBe(401);
  });

  it('answers 503, not 404, when the users read fails', async () => {
    state.userResult = { data: null, error: { code: '57014', message: 'statement timeout' } };
    expect((await count()).status).toBe(503);
  });

  it('still answers 404 when there is no such user', async () => {
    state.userResult = { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    expect((await count()).status).toBe(404);
  });

  it('answers 503 when the count itself fails', async () => {
    state.countResult = { count: null, error: { message: 'TypeError: fetch failed' } };
    expect((await count()).status).toBe(503);
  });
});
