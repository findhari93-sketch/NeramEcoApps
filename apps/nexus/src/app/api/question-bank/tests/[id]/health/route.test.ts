// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The health banner's data, for paper acf8084d as it stood on 2026-09-17.
 *
 * The banner read "21 students could not submit" and "12 students failed to open
 * the paper". Four students really could not submit. These pin the route to that
 * answer, and to "Mark as fixed" hiding what came before it.
 */

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  byTable: {} as Record<string, Result[]>,
  calls: [] as Array<{ table: string; ops: Array<[string, unknown[]]> }>,
}));

function chain(table: string) {
  const entry = { table, ops: [] as Array<[string, unknown[]]> };
  mocks.calls.push(entry);
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          const queue = mocks.byTable[table] || [];
          const result = queue.length > 1 ? queue.shift()! : queue[0] ?? { data: [], error: null };
          return (resolve: (v: Result) => void) => resolve(result);
        }
        return (...args: unknown[]) => {
          entry.ops.push([prop, args]);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

vi.mock('@/lib/qb-auth', () => ({
  verifyQBAccess: (...a: unknown[]) => mocks.access(...a),
}));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (table: string) => chain(table) }),
  // The real pager, minus the paging: one page is all these fixtures hold.
  fetchAllRows: async (build: () => any) => {
    const { data, error } = await build().range(0, 999);
    if (error) throw error;
    return data || [];
  },
}));

import { GET } from './route';

const TEST_ID = 'acf8084d';
const request = () =>
  new NextRequest(`http://localhost/api/question-bank/tests/${TEST_ID}/health`, {
    headers: { Authorization: 'Bearer t' },
  });
const params = { params: { id: TEST_ID } };

const at = (minute: number) => `2026-09-11T10:${String(minute).padStart(2, '0')}:00Z`;

function errorRows() {
  const rows: any[] = [];
  ['r1', 'r2', 'r3', 'r4'].forEach((s, i) => {
    for (let n = 0; n < 3; n++) {
      rows.push({ phase: 'submit', student_id: s, attempt_id: `open-${s}`, message: 'EXAM_CLOSED', detail: { status: 500 }, created_at: at(i * 3 + n) });
    }
  });
  ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8', 'd8'].forEach((s, i) =>
    rows.push({
      phase: 'submit',
      student_id: s,
      attempt_id: `done-${s}`,
      message: 'This attempt is already finished. Start a new one to try again.',
      detail: { status: 409 },
      created_at: at(20 + i),
    }),
  );
  ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l1', 'l2'].forEach((s, i) =>
    rows.push({ phase: 'load', student_id: s, message: 'You have used all your attempts at this test.', detail: { status: 403 }, created_at: at(30 + i) }),
  );
  // A teacher previewing the paper, stored before the errors route stopped doing that.
  rows.push({ phase: 'submit', student_id: 'teacher-1', attempt_id: 'preview', message: 'Failed to fetch', detail: null, created_at: at(50) });
  return rows;
}

function seed(over: Partial<Record<string, Result[]>> = {}) {
  mocks.byTable = {
    nexus_tests: [{ data: { id: TEST_ID, title: 'History of Architecture Test' }, error: null }],
    nexus_test_questions: [{ data: [], error: null }],
    nexus_test_health_clears: [{ data: [], error: null }],
    nexus_test_attempt_errors: [{ data: errorRows(), error: null }],
    nexus_test_attempts: [
      {
        data: ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'].map((s) => ({ id: `done-${s}`, status: 'submitted' })),
        error: null,
      },
    ],
    users: [
      {
        data: [
          ...['r1', 'r2', 'r3', 'r4'].map((id) => ({ id, name: `Student ${id}`, avatar_url: null, user_type: 'student', staff_role: null })),
          { id: 'teacher-1', name: 'Ms Teacher', avatar_url: null, user_type: 'teacher', staff_role: null },
        ],
        error: null,
      },
    ],
    nexus_qb_question_reports: [{ data: [], error: null }],
    ...over,
  };
}

beforeEach(() => {
  mocks.access.mockReset();
  mocks.access.mockResolvedValue({ ok: true, caller: { id: 'teacher-1', user_type: 'teacher', staff_role: null } });
  mocks.calls = [];
  seed();
});

describe('GET /api/question-bank/tests/[id]/health', () => {
  it('refuses a student', async () => {
    mocks.access.mockResolvedValue({ ok: true, caller: { id: 's', user_type: 'student', staff_role: null } });
    const res = await GET(request(), params);
    expect(res.status).toBe(403);
  });

  it('counts the four students who really could not submit, and nothing else', async () => {
    const res = await GET(request(), params);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const technical = data.issues.filter((i: any) => i.stream === 'technical');
    expect(technical.map((i: any) => i.title)).toEqual(['4 students could not submit their answers']);
    expect(data.blocking).toBe(true);
  });

  it('names who it happened to, with their face data, latest first', async () => {
    const { data } = await (await GET(request(), params)).json();
    expect(data.affected.submit.map((s: any) => s.student_id)).toEqual(['r4', 'r3', 'r2', 'r1']);
    expect(data.affected.submit[0]).toMatchObject({
      name: 'Student r4',
      avatar_url: null,
      message: 'EXAM_CLOSED',
      times: 3,
      last_at: at(11),
    });
    expect(data.affected.load).toBeUndefined();
  });

  it('asks the attempts table only about the closed-attempt submits', async () => {
    await GET(request(), params);
    const attemptsRead = mocks.calls.find((c) => c.table === 'nexus_test_attempts');
    const inCall = attemptsRead?.ops.find(([op]) => op === 'in');
    expect((inCall?.[1][1] as string[]).sort()).toEqual(
      ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'].map((s) => `done-${s}`),
    );
  });

  it('reads only the errors after the latest "Mark as fixed" and reports when that was', async () => {
    seed({
      nexus_test_health_clears: [{ data: [{ id: 'c1', cleared_at: '2026-09-17T10:00:00Z', cleared_by: 'teacher-1' }], error: null }],
      nexus_test_attempt_errors: [{ data: [], error: null }],
    });
    const { data } = await (await GET(request(), params)).json();
    const errorsRead = mocks.calls.find((c) => c.table === 'nexus_test_attempt_errors');
    expect(errorsRead?.ops).toContainEqual(['gt', ['created_at', '2026-09-17T10:00:00Z']]);
    expect(data.issues.filter((i: any) => i.stream === 'technical')).toEqual([]);
    expect(data.cleared).toEqual({ cleared_at: '2026-09-17T10:00:00Z', cleared_by: 'teacher-1' });
  });

  it('behaves as if never cleared when the clears table has not been created yet', async () => {
    seed({
      nexus_test_health_clears: [{ data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }],
    });
    const res = await GET(request(), params);
    expect(res.status).toBe(200);
    const { data } = await res.json();
    const errorsRead = mocks.calls.find((c) => c.table === 'nexus_test_attempt_errors');
    expect(errorsRead?.ops.some(([op]) => op === 'gt')).toBe(false);
    expect(data.cleared).toBeNull();
    expect(data.issues.some((i: any) => i.title === '4 students could not submit their answers')).toBe(true);
  });
});
