import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A teacher recording away dates on a student's behalf.
 *
 * The WhatsApp case: a parent rings, and the teacher is the only person who will
 * ever type it in. Two things separate this from the student's own route, and
 * both are deliberate: it may backdate (writing down what you were told is not
 * the same act as rewriting your own record), and it cannot end a window early
 * (that is the student's action, and a teacher who wants a class not to count
 * has the audited lever for it, excusing).
 */

const state = vi.hoisted(() => ({
  capability: true,
  windows: [] as Record<string, unknown>[],
  inserted: [] as Record<string, unknown>[],
  studentExists: true,
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  let usersQuery: 'staff' | 'student' = 'staff';
  const rows = () => {
    if (table === 'nexus_student_away_windows') return state.windows;
    if (usersQuery === 'student') {
      return state.studentExists ? [{ id: 'stu-9' }] : [];
    }
    return [{ id: 'staff-1', user_type: 'teacher', staff_role: 'teacher', can_teach: true }];
  };
  const chain = () => b;
  for (const m of ['select', 'in', 'gte', 'lte', 'is', 'or', 'order', 'limit', 'not']) b[m] = chain;
  b.eq = (col: string) => {
    // The staff lookup filters on ms_oid; the student lookup on id.
    if (table === 'users' && col === 'id') usersQuery = 'student';
    return b;
  };
  b.insert = (row: Record<string, unknown>) => {
    const saved = { id: `w-${state.inserted.length + 1}`, cancelled_at: null, created_at: 'now', ...row };
    state.inserted.push(saved);
    state.windows.push(saved);
    return { select: () => ({ single: () => Promise.resolve({ data: saved, error: null }) }) };
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
vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'ms-staff' }) }));
vi.mock('@/lib/staff-capabilities', () => ({ canUser: () => state.capability }));

const { GET, POST } = await import('./route');

const post = (body: Record<string, unknown>) =>
  POST(
    new NextRequest('http://localhost/api/students/stu-9/away-windows', {
      method: 'POST',
      headers: { Authorization: 'Bearer t', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: { id: 'stu-9' } },
  );

beforeEach(() => {
  state.capability = true;
  state.windows = [];
  state.inserted = [];
  state.studentExists = true;
});

describe('POST /api/students/[id]/away-windows', () => {
  it('records a window and marks who told us', async () => {
    const res = await post({ starts_on: '2026-10-10', ends_on: '2026-10-20', reason_code: 'clash' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.window.source).toBe('teacher');
    expect(body.window.created_by).toBe('staff-1');
    expect(body.window.student_id).toBe('stu-9');
  });

  /**
   * The difference from the student route. A teacher told on Tuesday about an
   * absence that began on Monday is recording history, not rewriting their own
   * record, so this is allowed. It is still bounded.
   */
  it('allows backdating, unlike the student route', async () => {
    const res = await post({ starts_on: '2026-09-25', ends_on: '2026-09-30', reason_code: 'unwell' });
    expect(res.status).toBe(200);
  });

  it('refuses to backdate beyond the cap', async () => {
    const res = await post({ starts_on: '2026-01-01', ends_on: '2026-01-10', reason_code: 'unwell' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/more than 45 days back/i);
  });

  it('refuses a caller without the attendance capability', async () => {
    state.capability = false;
    const res = await post({ starts_on: '2026-10-10', ends_on: '2026-10-20', reason_code: 'clash' });
    expect(res.status).toBe(403);
    expect(state.inserted).toHaveLength(0);
  });

  it('refuses a student who does not exist', async () => {
    state.studentExists = false;
    const res = await post({ starts_on: '2026-10-10', ends_on: '2026-10-20', reason_code: 'clash' });
    expect(res.status).toBe(404);
    expect(state.inserted).toHaveLength(0);
  });

  it('needs a reason, and a note when the reason is other', async () => {
    expect((await post({ starts_on: '2026-10-10' })).status).toBe(400);
    expect((await post({ starts_on: '2026-10-10', reason_code: 'other' })).status).toBe(400);
  });

  it('refuses a window overlapping one they already have', async () => {
    await post({ starts_on: '2026-10-10', ends_on: '2026-10-20', reason_code: 'clash' });
    const res = await post({ starts_on: '2026-10-15', ends_on: '2026-10-25', reason_code: 'family' });
    expect(res.status).toBe(409);
    expect(state.inserted).toHaveLength(1);
  });

  it('refuses a return date before the start', async () => {
    const res = await post({ starts_on: '2026-10-20', ends_on: '2026-10-10', reason_code: 'clash' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/students/[id]/away-windows', () => {
  it('reads a student windows with a sentence each', async () => {
    await post({ starts_on: '2026-10-10', ends_on: '2026-10-20', reason_code: 'clash' });
    const res = await GET(
      new NextRequest('http://localhost/api/students/stu-9/away-windows', {
        headers: { Authorization: 'Bearer t' },
      }),
      { params: { id: 'stu-9' } },
    );
    const body = await res.json();
    expect(body.windows).toHaveLength(1);
    expect(body.windows[0].summary).toBe('Away 10 Oct to 20 Oct');
  });

  it('refuses a caller without the attendance capability', async () => {
    state.capability = false;
    const res = await GET(
      new NextRequest('http://localhost/api/students/stu-9/away-windows', {
        headers: { Authorization: 'Bearer t' },
      }),
      { params: { id: 'stu-9' } },
    );
    expect(res.status).toBe(403);
  });
});
