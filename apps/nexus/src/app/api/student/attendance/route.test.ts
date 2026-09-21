import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A student reading their own attendance.
 *
 * Two rules, and the second one is the whole reason this route exists rather
 * than a client-side Supabase query. Nexus authenticates through MSAL, so
 * auth.uid() is always null and every RLS policy on the nexus_* tables is dead
 * code; the service-role client bypasses RLS anyway. This route is the only
 * thing between one student and another student's record.
 */

const state = vi.hoisted(() => ({
  flagOn: true,
  enrollment: { classroom_id: 'c1', batch_id: 'b1', enrolled_at: '2026-06-01' } as
    | Record<string, unknown>
    | null,
  /** Whose id loadOwnAttendance was actually called with. */
  loadedFor: [] as string[],
  writes: [] as string[],
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const chain = () => b;
  for (const m of ['select', 'eq', 'gte', 'lte', 'not', 'is', 'or', 'order', 'limit', 'in']) {
    b[m] = chain;
  }
  for (const m of ['insert', 'update', 'upsert', 'delete']) {
    b[m] = () => {
      state.writes.push(`${table}.${m}`);
      return Promise.resolve({ data: null, error: null });
    };
  }
  const row = () => {
    if (table === 'users') return { id: 'student-1' };
    if (table === 'nexus_enrollments') return state.enrollment;
    return null;
  };
  b.maybeSingle = () => Promise.resolve({ data: row(), error: null });
  b.single = () => Promise.resolve({ data: row(), error: null });
  b.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return b;
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (t: string) => builder(t) }),
  getNexusSetting: async () => ({ value: { 'student.attendance': state.flagOn } }),
}));
vi.mock('@/lib/ms-verify', () => ({
  verifyMsToken: async (header: string | null) => {
    // The real verifyMsToken fails closed on a par_ token for any route that
    // did not pass allowParent, and this one deliberately does not.
    if (header?.includes('par_')) throw new Error('Parent accounts cannot access this resource.');
    return { oid: 'ms-1' };
  },
}));
vi.mock('@/lib/student-attendance', () => ({
  loadOwnAttendance: async (studentId: string) => {
    state.loadedFor.push(studentId);
    return {
      from: '2026-06-01',
      to: '2026-09-20',
      summary: {
        totalClasses: 3,
        measuredClasses: 2,
        notMeasuredClasses: 1,
        attended: 1,
        missed: 1,
        missedNoReason: 1,
        missedWithReason: 0,
        missedAway: 0,
        excused: 0,
        late: 0,
        leftEarly: 0,
        droppedMidClass: 0,
        presentMinutes: 80,
        attendanceRate: 50,
      },
      sentence: 'Attended 1 of 2 classes.',
      classes: [],
    };
  },
}));

const { GET } = await import('./route');

const call = (url = 'http://localhost/api/student/attendance', auth = 'Bearer tok') =>
  GET(new NextRequest(url, { headers: { Authorization: auth } }));

beforeEach(() => {
  state.flagOn = true;
  state.enrollment = { classroom_id: 'c1', batch_id: 'b1', enrolled_at: '2026-06-01' };
  state.loadedFor = [];
  state.writes = [];
});

describe('GET /api/student/attendance', () => {
  it('returns the caller their own summary', async () => {
    const res = await call();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.summary.attended).toBe(1);
    expect(body.sentence).toBe('Attended 1 of 2 classes.');
    expect(state.loadedFor).toEqual(['student-1']);
  });

  /**
   * The one that matters. There is no database-level safety net behind this
   * route, so a `?student=` parameter would be a data breach rather than a
   * feature. The id must come from the token and from nowhere else.
   */
  it('ignores any student id in the query string', async () => {
    const res = await call(
      'http://localhost/api/student/attendance?student=someone-else&studentId=someone-else&id=someone-else',
    );

    expect(res.status).toBe(200);
    expect(state.loadedFor).toEqual(['student-1']);
    expect(state.loadedFor).not.toContain('someone-else');
  });

  it('never writes', async () => {
    await call();
    expect(state.writes).toEqual([]);
  });

  it('404s while the feature is switched off, with no payload to find', async () => {
    state.flagOn = false;
    const res = await call();

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.summary).toBeUndefined();
    expect(body.classes).toBeUndefined();
    // The expensive read must not even run for someone who cannot see it.
    expect(state.loadedFor).toEqual([]);
  });

  it('refuses a parent token', async () => {
    const res = await call('http://localhost/api/student/attendance', 'Bearer par_abc');
    // 403, not 500: a wrong-role request is not a broken server.
    expect(res.status).toBe(403);
    expect(state.loadedFor).toEqual([]);
  });

  it('tells someone with no student enrolment why, rather than showing zeroes', async () => {
    state.enrollment = null;
    const res = await call();

    expect(res.status).toBe(403);
    expect(state.loadedFor).toEqual([]);
  });
});
