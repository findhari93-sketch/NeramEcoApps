// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * "Mark as fixed" and its Undo.
 *
 * The table behind it arrives in migration 20260923090000. Until that is applied
 * the button must say so plainly (503), not fail as a generic 500 a teacher
 * reads as "the app is broken too".
 */

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  results: [] as Result[],
  calls: [] as Array<{ table: string; ops: Array<[string, unknown[]]> }>,
}));

/** A PostgREST chain: every call is recorded, and awaiting it yields the next queued result. */
function chain(table: string) {
  const entry = { table, ops: [] as Array<[string, unknown[]]> };
  mocks.calls.push(entry);
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === 'then') {
          const result = mocks.results.shift() ?? { data: null, error: null };
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
}));

import { DELETE, POST } from './route';

const TEST_ID = 'acf8084d-0000-4000-8000-000000000000';
const req = (method: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/question-bank/tests/${TEST_ID}/health/clear`, {
    method,
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = { params: { id: TEST_ID } };

const staff = { ok: true, caller: { id: 'teacher-1', user_type: 'teacher', staff_role: null } };
const student = { ok: true, caller: { id: 'student-1', user_type: 'student', staff_role: null } };

beforeEach(() => {
  mocks.access.mockReset();
  mocks.results = [];
  mocks.calls = [];
});

describe('POST /api/question-bank/tests/[id]/health/clear', () => {
  it('refuses a student', async () => {
    mocks.access.mockResolvedValue(student);
    const res = await POST(req('POST'), params);
    expect(res.status).toBe(403);
    expect(mocks.calls).toHaveLength(0);
  });

  it('passes an auth refusal straight through', async () => {
    mocks.access.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) });
    const res = await POST(req('POST'), params);
    expect(res.status).toBe(401);
  });

  it('records who cleared the paper and hands the clear back', async () => {
    mocks.access.mockResolvedValue(staff);
    const row = { id: 'c1', test_id: TEST_ID, cleared_at: '2026-09-17T10:00:00Z', cleared_by: 'teacher-1', note: null };
    mocks.results.push({ data: row, error: null });

    const res = await POST(req('POST', { note: '  Submit fix shipped  ' }), params);
    expect(res.status).toBe(201);
    expect((await res.json()).data.clear).toEqual(row);

    const insert = mocks.calls[0].ops.find(([op]) => op === 'insert');
    expect(mocks.calls[0].table).toBe('nexus_test_health_clears');
    expect(insert?.[1][0]).toEqual({ test_id: TEST_ID, cleared_by: 'teacher-1', note: 'Submit fix shipped' });
  });

  it('says plainly that the feature is not switched on when the table is missing', async () => {
    mocks.access.mockResolvedValue(staff);
    mocks.results.push({ data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.nexus_test_health_clears'" } });
    const res = await POST(req('POST'), params);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not available on this server yet/);
  });

  it('answers 404 for a paper that does not exist', async () => {
    mocks.access.mockResolvedValue(staff);
    mocks.results.push({ data: null, error: { code: '23503', message: 'violates foreign key constraint' } });
    const res = await POST(req('POST'), params);
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/question-bank/tests/[id]/health/clear', () => {
  it('refuses a student', async () => {
    mocks.access.mockResolvedValue(student);
    const res = await DELETE(req('DELETE'), params);
    expect(res.status).toBe(403);
  });

  it('removes only the latest clear for this paper', async () => {
    mocks.access.mockResolvedValue(staff);
    mocks.results.push({ data: [{ id: 'latest' }], error: null });
    mocks.results.push({ data: null, error: null });

    const res = await DELETE(req('DELETE'), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data.removed).toBe('latest');

    const [read, del] = mocks.calls;
    expect(read.ops).toContainEqual(['eq', ['test_id', TEST_ID]]);
    expect(read.ops).toContainEqual(['order', ['cleared_at', { ascending: false }]]);
    expect(read.ops).toContainEqual(['limit', [1]]);
    expect(del.ops.map(([op]) => op)).toContain('delete');
    expect(del.ops).toContainEqual(['eq', ['id', 'latest']]);
    expect(del.ops).toContainEqual(['eq', ['test_id', TEST_ID]]);
  });

  it('says there is nothing to undo when the paper was never cleared', async () => {
    mocks.access.mockResolvedValue(staff);
    mocks.results.push({ data: [], error: null });
    const res = await DELETE(req('DELETE'), params);
    expect(res.status).toBe(404);
  });

  it('answers 503 when the table is missing', async () => {
    mocks.access.mockResolvedValue(staff);
    mocks.results.push({ data: null, error: { code: '42P01', message: 'relation "nexus_test_health_clears" does not exist' } });
    const res = await DELETE(req('DELETE'), params);
    expect(res.status).toBe(503);
  });
});
