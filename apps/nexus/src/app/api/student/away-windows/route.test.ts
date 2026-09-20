import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The one place a student writes their own attendance record.
 *
 * Three things this file is really for: a teacher must not be able to declare a
 * window here (that is the staff route, which stamps a different source), a
 * student must not be able to backdate one (which would rewrite a register a
 * teacher has already read), and two overlapping windows must be refused rather
 * than silently merged into a third range nobody asked for.
 */

const state = vi.hoisted(() => ({
  user: { id: 'stu-1', name: 'Yahul' } as Record<string, unknown> | null,
  enrollment: { role: 'student', classroom_id: 'c1' } as Record<string, unknown> | null,
  windows: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  teachers: [{ user_id: 'teach-1' }] as Record<string, unknown>[],
  nudges: [] as Record<string, unknown>[],
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const rows = () => {
    if (table === 'nexus_student_away_windows') return state.windows;
    if (table === 'nexus_enrollments') {
      // The route asks this table two different questions: the caller's own
      // enrolment (filtered to role student) and the classroom's teachers.
      return lastRoleFilter === 'teacher' ? state.teachers : state.enrollment ? [state.enrollment] : [];
    }
    return state.user ? [state.user] : [];
  };
  let lastRoleFilter = '';
  const chain = () => b;
  for (const m of ['select', 'in', 'gte', 'lte', 'is', 'or', 'order', 'limit', 'not']) b[m] = chain;
  b.eq = (col: string, val: unknown) => {
    if (col === 'role') lastRoleFilter = String(val);
    return b;
  };
  b.insert = (row: Record<string, unknown>) => {
    const saved = { id: `w-${state.inserted.length + 1}`, cancelled_at: null, created_at: 'now', ...row };
    state.inserted.push(saved);
    state.windows.push(saved);
    return {
      select: () => ({ single: () => Promise.resolve({ data: saved, error: null }) }),
    };
  };
  b.update = (patch: Record<string, unknown>) => {
    const target = state.windows[0];
    const merged = { ...target, ...patch };
    if (target) Object.assign(target, patch);
    return {
      eq: function () {
        return this;
      },
      select: () => ({ single: () => Promise.resolve({ data: merged, error: null }) }),
    };
  };
  b.maybeSingle = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  b.single = () => Promise.resolve({ data: rows()[0] ?? null, error: null });
  b.then = (onFulfilled: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows(), error: null }).then(onFulfilled);
  return b;
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (t: string) => builder(t) }),
  istTodayYmd: () => '2026-10-01',
}));
vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'ms-1' }) }));
vi.mock('@/lib/nudge-delivery', () => ({
  sendNudge: async (input: Record<string, unknown>) => {
    state.nudges.push(input);
    return { results: [], counts: {} };
  },
}));

const { GET, POST } = await import('./route');

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('http://localhost/api/student/away-windows', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const EXAMS = { reason_code: 'clash', starts_on: '2026-10-10', ends_on: '2026-10-20' };

beforeEach(() => {
  state.user = { id: 'stu-1', name: 'Yahul' };
  state.enrollment = { role: 'student', classroom_id: 'c1' };
  state.windows = [];
  state.inserted = [];
  state.teachers = [{ user_id: 'teach-1' }];
  state.nudges = [];
});

describe('POST /api/student/away-windows', () => {
  it('saves a window a student declares', async () => {
    const res = await post(EXAMS);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.window.starts_on).toBe('2026-10-10');
    expect(body.window.ends_on).toBe('2026-10-20');
    expect(body.window.source).toBe('student');
    expect(body.window.summary).toBe('Away 10 Oct to 20 Oct');
  });

  it('accepts an open-ended window and gives it a review date a month out', async () => {
    const res = await post({ reason_code: 'clash', starts_on: '2026-10-10', ends_on: null });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.window.ends_on).toBeNull();
    expect(body.window.review_on).toBe('2026-11-09');
  });

  it('sets the review date to the return date for a closed window', async () => {
    const body = await (await post(EXAMS)).json();
    expect(body.window.review_on).toBe('2026-10-20');
  });

  /**
   * A student who could backdate could rewrite a register a teacher has already
   * read and acted on. A class already missed has its own path: the per-class
   * reason on the catch-up screen.
   */
  it('refuses to backdate', async () => {
    const res = await post({ reason_code: 'clash', starts_on: '2026-09-01', ends_on: '2026-09-10' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/only start from today/i);
    expect(state.inserted).toHaveLength(0);
  });

  it('allows a window starting today', async () => {
    const res = await post({ reason_code: 'unwell', starts_on: '2026-10-01', ends_on: '2026-10-03' });
    expect(res.status).toBe(200);
  });

  it('refuses a return date before the start', async () => {
    const res = await post({ reason_code: 'clash', starts_on: '2026-10-20', ends_on: '2026-10-10' });
    expect(res.status).toBe(400);
    expect(state.inserted).toHaveLength(0);
  });

  it('refuses a window longer than the cap, so a typo cannot swallow a year', async () => {
    const res = await post({ reason_code: 'clash', starts_on: '2026-10-10', ends_on: '2027-10-10' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/more than 120 days/i);
  });

  it('needs a reason, and a note when the reason is other', async () => {
    expect((await post({ starts_on: '2026-10-10' })).status).toBe(400);
    expect((await post({ reason_code: 'nonsense', starts_on: '2026-10-10' })).status).toBe(400);
    expect((await post({ reason_code: 'other', starts_on: '2026-10-10' })).status).toBe(400);
    expect(
      (await post({ reason_code: 'other', reason_note: 'wedding', starts_on: '2026-10-10' })).status,
    ).toBe(200);
  });

  /**
   * Refused, not merged. Merging would invent a third range the student never
   * asked for; refusing points them at the one they already have.
   */
  it('refuses a second window that overlaps a live one', async () => {
    await post(EXAMS);
    const res = await post({ reason_code: 'unwell', starts_on: '2026-10-15', ends_on: '2026-10-25' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already told us/i);
    expect(body.existing_id).toBe('w-1');
    expect(state.inserted).toHaveLength(1);
  });

  it('allows a second window that does not overlap', async () => {
    await post(EXAMS);
    const res = await post({ reason_code: 'family', starts_on: '2026-10-21', ends_on: '2026-10-25' });
    expect(res.status).toBe(200);
    expect(state.inserted).toHaveLength(2);
  });

  it('refuses a caller who is not an enrolled student', async () => {
    state.enrollment = null;
    const res = await post(EXAMS);
    expect(res.status).toBe(403);
    expect(state.inserted).toHaveLength(0);
  });

  /**
   * Through sendNudge, not notifyRsvpToTeacher. Stepping out of one class is
   * bell-sized news; vanishing for a fortnight is something a teacher needs
   * before they start chasing.
   */
  it('tells the teachers through the one door, as staff', async () => {
    await post(EXAMS);
    expect(state.nudges).toHaveLength(1);
    expect(state.nudges[0].audience).toBe('staff');
    expect(state.nudges[0].eventType).toBe('away_window_declared');
    expect(state.nudges[0].studentIds).toEqual(['teach-1']);
    expect(String(state.nudges[0].plain)).toMatch(/Yahul/);
  });

  it('still saves the window when the notification fails', async () => {
    state.teachers = [];
    const res = await post(EXAMS);
    expect(res.status).toBe(200);
    expect(state.inserted).toHaveLength(1);
    expect(state.nudges).toHaveLength(0);
  });
});

describe('GET /api/student/away-windows', () => {
  it('returns the student own windows with a sentence each', async () => {
    await post(EXAMS);
    const res = await GET(
      new NextRequest('http://localhost/api/student/away-windows', {
        headers: { Authorization: 'Bearer t' },
      }),
    );
    const body = await res.json();
    expect(body.today).toBe('2026-10-01');
    expect(body.windows).toHaveLength(1);
    expect(body.windows[0].summary).toBe('Away 10 Oct to 20 Oct');
  });
});
