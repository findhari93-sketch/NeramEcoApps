import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The week read, before it collects a single class, looks up the caller and the
 * classroom together. Both reads threw their `error` away, so a timeout came back
 * as 404 "User not found" or "Classroom not found", and the timetable showed an
 * empty week with nothing to say why. Seen on prod 2026-09-24 alongside four other
 * failed reads in the same minute. The catch also answered 500 for an expired
 * token, which the client cannot act on.
 */

const state = vi.hoisted(() => ({
  authError: null as string | null,
  userResult: { data: { id: 'u-1', user_type: 'teacher', staff_role: null, can_teach: true }, error: null } as {
    data: unknown;
    error: unknown;
  },
  classroomResult: { data: { id: 'c1', is_archived: false }, error: null } as { data: unknown; error: unknown },
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'or', 'is']) b[method] = () => b;
  b.single = () => Promise.resolve(table === 'users' ? state.userResult : state.classroomResult);
  // Past the two lookups this suite is not interested: no enrolment ends it at 403.
  b.maybeSingle = () => Promise.resolve({ data: null, error: null });
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
  extractBearerToken: () => 'token',
}));
// The write paths' collaborators. Nothing on the GET path reaches them.
vi.mock('@/lib/timetable-notifications', () => ({}));
vi.mock('@/lib/plan-shape-query', () => ({}));
vi.mock('@/lib/class-prep-server', () => ({}));
vi.mock('@/lib/notify-students', () => ({}));
vi.mock('@/lib/teams-class-announcements', () => ({}));
vi.mock('@/lib/teams-online-meeting', () => ({}));
vi.mock('@/lib/staff-scope', () => ({}));

const { GET } = await import('./route');

const week = () =>
  GET(
    new NextRequest('http://localhost/api/timetable?classroom=c1&start=2026-09-21&end=2026-10-04', {
      headers: { Authorization: 'Bearer token' },
    }),
  );

beforeEach(() => {
  state.authError = null;
  state.userResult = { data: { id: 'u-1', user_type: 'teacher', staff_role: null, can_teach: true }, error: null };
  state.classroomResult = { data: { id: 'c1', is_archived: false }, error: null };
});

describe('GET /api/timetable, telling a failed read from a missing row', () => {
  it('answers 503, not 404, when the users read fails', async () => {
    state.userResult = { data: null, error: { code: '57014', message: 'statement timeout' } };
    expect((await week()).status).toBe(503);
  });

  it('answers 503, not 404, when the classroom read fails', async () => {
    state.classroomResult = { data: null, error: { message: 'TypeError: fetch failed' } };
    expect((await week()).status).toBe(503);
  });

  it('still answers 404 for a classroom that is not there', async () => {
    state.classroomResult = { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    const res = await week();
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Classroom not found');
  });

  it('answers 401, not 500, for an expired token', async () => {
    state.authError = 'Invalid Microsoft token';
    expect((await week()).status).toBe(401);
  });
});
