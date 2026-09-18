import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The language axis of PATCH /api/students/classification.
 *
 * users.knows_tamil is per USER and global, exactly like users.academic_year, so
 * it inherits that axis's two protections: only ids that survive the
 * classroom-scoped enrolment read are ever written, and a write that changes
 * nothing leaves no history and no audit row.
 */

interface Call {
  table: string;
  op: 'select' | 'update' | 'insert';
  columns?: string;
  patch?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
  filters: Array<[string, string, unknown]>;
}

const state = vi.hoisted(() => ({
  calls: [] as unknown[],
  enrollments: [] as Record<string, unknown>[],
  users: [] as Record<string, unknown>[],
  capabilities: [] as string[],
  history: [] as unknown[][],
}));

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] };
  const resolve = () => {
    state.calls.push(call);
    if (call.op !== 'select') return { data: null, error: null };
    const inFilter = call.filters.find((f) => f[0] === 'in');
    const ids = (inFilter?.[2] as string[]) || [];
    if (table === 'nexus_enrollments') {
      return { data: state.enrollments.filter((e) => ids.includes(e.user_id as string)), error: null };
    }
    if (table === 'users') {
      return { data: state.users.filter((u) => ids.includes(u.id as string)), error: null };
    }
    return { data: [], error: null };
  };
  const b = {
    select(columns: string) {
      call.columns = columns;
      return b;
    },
    update(patch: Record<string, unknown>) {
      call.op = 'update';
      call.patch = patch;
      return b;
    },
    insert(rows: Record<string, unknown>[]) {
      call.op = 'insert';
      call.rows = rows;
      return Promise.resolve(resolve());
    },
    eq(column: string, value: unknown) {
      call.filters.push(['eq', column, value]);
      return b;
    },
    in(column: string, value: unknown) {
      call.filters.push(['in', column, value]);
      return b;
    },
    then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(resolve()).then(onFulfilled, onRejected);
    },
  };
  return b;
}

vi.mock('@neram/database', () => ({
  ACADEMIC_YEAR_REGEX: /^[0-9]{4}-[0-9]{2}$/,
  examYearFromAcademicYear: (y: string | null) => (y ? Number(y.slice(0, 4)) + 1 : null),
  startYearOf: (y: string | null | undefined) => (y && /^[0-9]{4}-/.test(y) ? Number(y.slice(0, 4)) : null),
  getCurrentBatch: async () => ({ code: '2026-27' }),
  getSupabaseAdminClient: () => ({ from: (t: string) => builder(t) }),
  recordUserHistory: async (...args: unknown[]) => {
    state.history.push(args.slice(1));
  },
}));

vi.mock('@/lib/study-materials', () => ({
  getRequestUser: async () => ({ id: 'staff-1' }),
  assertCapability: (_user: unknown, capability: string) => {
    state.capabilities.push(capability);
  },
}));

import { PATCH } from './route';

const patch = (body: unknown) =>
  PATCH(
    new NextRequest('http://localhost/api/students/classification', {
      method: 'PATCH',
      headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const calls = () => state.calls as Call[];
const userUpdates = () => calls().filter((c) => c.table === 'users' && c.op === 'update');
const userReads = () => calls().filter((c) => c.table === 'users' && c.op === 'select');
const auditInserts = () =>
  calls().filter((c) => c.table === 'nexus_enrollment_classification_events' && c.op === 'insert');

function enrol(userId: string) {
  return {
    id: `enr-${userId}`,
    user_id: userId,
    current_standard: '12th',
    current_standard_source: 'staff',
    participation_status: 'active',
    dormant_since: null,
    dormant_reason: null,
    dormant_source: null,
  };
}

beforeEach(() => {
  state.calls = [];
  state.capabilities = [];
  state.history = [];
  state.enrollments = [enrol('s1'), enrol('s2')];
  state.users = [
    { id: 's1', academic_year: '2026-27', knows_tamil: null },
    { id: 's2', academic_year: '2026-27', knows_tamil: true },
  ];
});

describe('PATCH /api/students/classification, language', () => {
  it('refuses a value that is not true, false or null', async () => {
    const res = await patch({ classroomId: 'c1', studentIds: ['s1'], knowsTamil: 'yes' });
    expect(res.status).toBe(400);
    expect(userUpdates()).toHaveLength(0);
  });

  it('accepts a language-only edit under the class capability', async () => {
    const res = await patch({ classroomId: 'c1', studentIds: ['s1'], knowsTamil: true });
    expect(res.status).toBe(200);
    expect(state.capabilities).toEqual(['coord.student.stage']);
  });

  it('writes users.knows_tamil, records history, and returns the previous value for Undo', async () => {
    const body = await (await patch({ classroomId: 'c1', studentIds: ['s1'], knowsTamil: true })).json();

    expect(userUpdates()).toHaveLength(1);
    expect(userUpdates()[0].patch).toMatchObject({ knows_tamil: true });
    expect(userUpdates()[0].filters).toContainEqual(['in', 'id', ['s1']]);
    expect(state.history).toEqual([['s1', 'knows_tamil', null, true, 'staff-1']]);

    expect(body.changed).toBe(1);
    expect(body.students[0]).toMatchObject({ id: 's1', knows_tamil: true, previous: { knows_tamil: null } });
  });

  it('never writes an id that is not an active student in this classroom', async () => {
    const body = await (
      await patch({ classroomId: 'c1', studentIds: ['s1', 'outsider'], knowsTamil: false })
    ).json();

    const written = userUpdates().flatMap((c) => c.filters.filter((f) => f[1] === 'id').map((f) => f[2]));
    expect(written).toEqual([['s1']]);
    expect(body.skipped.map((s: { studentId: string }) => s.studentId)).toEqual(['outsider']);
  });

  it('leaves no write, history or audit row when the value is already set', async () => {
    const body = await (await patch({ classroomId: 'c1', studentIds: ['s2'], knowsTamil: true })).json();
    expect(userUpdates()).toHaveLength(0);
    expect(state.history).toHaveLength(0);
    expect(auditInserts()).toHaveLength(0);
    expect(body.changed).toBe(0);
  });

  it('clears the language with null', async () => {
    await patch({ classroomId: 'c1', studentIds: ['s2'], knowsTamil: null });
    expect(userUpdates()[0].patch).toMatchObject({ knows_tamil: null });
    expect(state.history).toEqual([['s2', 'knows_tamil', true, null, 'staff-1']]);
  });

  it('applies different values per student, which is how Undo restores a bulk edit', async () => {
    const res = await patch({
      classroomId: 'c1',
      assignments: [
        { studentId: 's1', knowsTamil: false },
        { studentId: 's2', knowsTamil: null },
      ],
    });
    expect(res.status).toBe(200);
    const byValue = new Map(
      userUpdates().map((c) => [c.patch?.knows_tamil, c.filters.find((f) => f[1] === 'id')?.[2]]),
    );
    expect(byValue.get(false)).toEqual(['s1']);
    expect(byValue.get(null)).toEqual(['s2']);
  });

  it('names knowsTamil when a per-student entry changes nothing', async () => {
    const res = await patch({ classroomId: 'c1', assignments: [{ studentId: 's1' }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('knowsTamil');
  });

  it('audits language in its own insert, in words rather than booleans', async () => {
    await patch({ classroomId: 'c1', studentIds: ['s1'], studyStage: '11th', knowsTamil: true });

    const inserts = auditInserts();
    expect(inserts).toHaveLength(2);
    const language = inserts.find((c) => c.rows?.every((r) => r.axis === 'language'));
    expect(language?.rows).toEqual([
      expect.objectContaining({ student_id: 's1', axis: 'language', from_value: null, to_value: 'tamil' }),
    ]);
    const stage = inserts.find((c) => c !== language);
    expect(stage?.rows?.every((r) => r.axis !== 'language')).toBe(true);
  });

  it('does not read the language column for a year-only edit', async () => {
    await patch({ classroomId: 'c1', studentIds: ['s1'], academicYear: '2027-28' });
    expect(userReads()).toHaveLength(1);
    expect(userReads()[0].columns).not.toContain('knows_tamil');
  });
});
