import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * The badge poller must be able to tell "signed out" from "server trouble".
 *
 * Every failure other than "User not found" used to answer 401, including a Graph
 * timeout or a failed users lookup, so a stalled dependency looked exactly like an
 * expired session.
 */

const getRequestUser = vi.fn();
const staffStudentIds = vi.fn();

vi.mock('@/lib/study-materials', () => ({ getRequestUser: (...a: unknown[]) => getRequestUser(...a) }));
vi.mock('@neram/database/queries/nexus', () => ({
  listUnflipped: vi.fn(async () => ({ rows: [{ id: 's1' }], remaining: 2 })),
}));
vi.mock('@/lib/sketchbook-access', () => ({ staffStudentIds: (...a: unknown[]) => staffStudentIds(...a) }));
vi.mock('@/lib/owed-drawings', () => ({ countOwedDrawings: vi.fn(async () => ({ assignment: 4, test: 1 })) }));

/** Just enough of the Supabase client for the staff branch: two RPCs and one head count. */
const countQuery = { select: () => countQuery, is: () => countQuery, gte: async () => ({ count: 0 }) };
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    rpc: async () => ({ data: 0 }),
    from: () => countQuery,
  }),
  // Questions with an open student report: the Question Bank badge.
  getOpenQBReportQuestionCount: async () => 2,
}));

import { GET } from './route';

const request = () => new NextRequest('http://localhost/api/nav-badges', { headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  getRequestUser.mockReset();
  staffStudentIds.mockReset();
  staffStudentIds.mockResolvedValue(['s1', 's2']);
});

describe('GET /api/nav-badges staff poll cost', () => {
  it('resolves the caller once and computes the staff roster once per poll', async () => {
    // Polled every 60s by every signed-in staff member: the roster (an enrolment
    // query per classroom) used to be computed twice, and the caller re-resolved
    // twice, on every poll.
    getRequestUser.mockResolvedValue({ id: 'u1', user_type: 'teacher' });
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect(getRequestUser).toHaveBeenCalledTimes(1);
    expect(staffStudentIds).toHaveBeenCalledTimes(1);
    const { badges } = await res.json();
    expect(badges).toMatchObject({ assignment_drawings: 4, test_drawings: 1, sketchbook_inbox: 3, qb_reports: 2 });
  });

  it('zeroes only the roster badges when the roster cannot be loaded', async () => {
    getRequestUser.mockResolvedValue({ id: 'u1', user_type: 'teacher' });
    staffStudentIds.mockRejectedValue(new Error('enrolments query failed'));
    const res = await GET(request());
    expect(res.status).toBe(200);
    expect((await res.json()).badges).toMatchObject({ assignment_drawings: 0, test_drawings: 0, sketchbook_inbox: 0 });
  });
});

describe('GET /api/nav-badges status codes', () => {
  it('answers 401 for a rejected token', async () => {
    getRequestUser.mockRejectedValueOnce(new Error('Invalid Microsoft token: 401'));
    expect((await GET(request())).status).toBe(401);
  });

  it('answers 404 when the caller has no users row', async () => {
    getRequestUser.mockRejectedValueOnce(new Error('User not found'));
    expect((await GET(request())).status).toBe(404);
  });

  it('answers 500, not 401, when identity cannot be checked', async () => {
    getRequestUser.mockRejectedValueOnce(new Error('Microsoft identity check timed out'));
    expect((await GET(request())).status).toBe(500);
    getRequestUser.mockRejectedValueOnce(new Error('Could not load the signed-in user'));
    expect((await GET(request())).status).toBe(500);
  });
});
