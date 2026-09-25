import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The teacher's reported-questions inbox. On prod it answered 500 on every load
 * (the query's users embed was ambiguous; fixed in @neram/database), and the
 * client rendered that as "no reports". This file pins the route's own half:
 * a failed classroom read is not an empty inbox, and an expired token is a 401.
 */

const state = vi.hoisted(() => ({
  authError: null as string | null,
  roomsResult: { data: [{ id: 'c1' }], error: null } as { data: unknown; error: unknown },
  listed: [] as string[][],
}));

vi.mock('@/lib/verify-teacher', () => ({
  verifyTeacher: async () => {
    if (state.authError) throw new Error(state.authError);
    return { id: 't-1' };
  },
}));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: () => ({ select: () => Promise.resolve(state.roomsResult) }) }),
  listOpenRecapQuestionReports: async (ids: string[]) => {
    state.listed.push(ids);
    return [{ id: 'r-1' }];
  },
  resolveRecapQuestionReport: async () => undefined,
}));

const { GET } = await import('./route');

const inbox = () =>
  GET(new NextRequest('http://localhost/api/class-recaps/question-reports', { headers: { Authorization: 'Bearer t' } }));

beforeEach(() => {
  state.authError = null;
  state.roomsResult = { data: [{ id: 'c1' }], error: null };
  state.listed = [];
});

describe('GET /api/class-recaps/question-reports', () => {
  it('lists open reports across the classrooms', async () => {
    const res = await inbox();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [{ id: 'r-1' }], count: 1 });
    expect(state.listed).toEqual([['c1']]);
  });

  it('answers 503 rather than an empty inbox when the classrooms cannot be read', async () => {
    state.roomsResult = { data: null, error: { message: 'TypeError: fetch failed' } };
    expect((await inbox()).status).toBe(503);
    expect(state.listed).toEqual([]);
  });

  it('answers 401, not 500, for a missing token', async () => {
    state.authError = 'Missing or invalid Authorization header';
    expect((await inbox()).status).toBe(401);
  });
});
