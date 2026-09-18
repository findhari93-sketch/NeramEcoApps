// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * What the take page's error reports turn into.
 *
 * Two kinds of row inflated the health banner on acf8084d and are no longer
 * stored: a teacher previewing the paper (the route stored whoever called it),
 * and the door refusing on purpose.
 */

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('@/lib/qb-auth', () => ({
  verifyQBAccess: (...a: unknown[]) => mocks.access(...a),
}));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({ insert: (rows: unknown) => mocks.insert(rows) }),
  }),
}));

import { POST } from './route';

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/student/tests/errors', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const student = { ok: true, caller: { id: 'student-1', user_type: 'student', staff_role: null } };

beforeEach(() => {
  mocks.access.mockReset();
  mocks.insert.mockReset();
  mocks.insert.mockResolvedValue({ error: null });
});

describe('POST /api/student/tests/errors', () => {
  it('stores a real failure for a student, code and status included', async () => {
    mocks.access.mockResolvedValue(student);
    const res = await POST(
      post({
        test_id: 't1',
        classroom_id: 'c1',
        errors: [{ phase: 'submit', attempt_id: 'a1', message: 'Failed to fetch', detail: { status: null, code: null } }],
      }),
    );
    expect(res.status).toBe(201);
    expect(mocks.insert).toHaveBeenCalledWith([
      expect.objectContaining({ student_id: 'student-1', phase: 'submit', message: 'Failed to fetch', detail: { status: null, code: null } }),
    ]);
  });

  // Kept, and marked. A paper that will not load for the teacher previewing it
  // will not load for the class either, and the health panel counts students by
  // its own staff list, so the row costs no accuracy.
  it('marks a teacher preview as staff rather than dropping it', async () => {
    mocks.access.mockResolvedValue({ ok: true, caller: { id: 'teacher-1', user_type: 'teacher', staff_role: null } });
    const res = await POST(post({ test_id: 't1', errors: [{ phase: 'image', message: 'Question image failed to load' }] }));
    expect(res.status).toBe(201);
    expect((await res.json()).data.recorded).toBe(1);
    expect(mocks.insert).toHaveBeenCalledWith([
      expect.objectContaining({ student_id: 'teacher-1', phase: 'image', detail: { staff: true } }),
    ]);
  });

  it('treats a manager on a student row as staff too', async () => {
    mocks.access.mockResolvedValue({ ok: true, caller: { id: 'm1', user_type: 'student', staff_role: 'manager' } });
    await POST(post({ test_id: 't1', errors: [{ phase: 'image', message: 'x', detail: { status: 500 } }] }));
    expect(mocks.insert).toHaveBeenCalledWith([
      expect.objectContaining({ student_id: 'm1', detail: { status: 500, staff: true } }),
    ]);
  });

  it('drops an expected refusal that reaches it anyway, and keeps the real failure beside it', async () => {
    mocks.access.mockResolvedValue(student);
    await POST(
      post({
        test_id: 't1',
        classroom_id: 'c1',
        errors: [
          { phase: 'load', message: 'You have used all your attempts at this test.', detail: { status: 403, code: 'ATTEMPT_LIMIT_REACHED' } },
          {
            phase: 'submit',
            message: 'This attempt is already finished. Start a new one to try again.',
            detail: { status: 409, code: 'ATTEMPT_CLOSED', attempt_status: 'submitted' },
          },
          { phase: 'submit', message: 'Submit failed (HTTP 502)', detail: { status: 502 } },
        ],
      }),
    );
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    const rows = mocks.insert.mock.calls[0][0] as Array<{ message: string }>;
    expect(rows.map((r) => r.message)).toEqual(['Submit failed (HTTP 502)']);
  });

  it('answers 200 with nothing recorded when every report was an expected refusal', async () => {
    mocks.access.mockResolvedValue(student);
    const res = await POST(
      post({ test_id: 't1', classroom_id: 'c1', errors: [{ phase: 'load', message: 'x', detail: { status: 409, code: 'LIVE_RUN' } }] }),
    );
    expect(res.status).toBe(200);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('passes an auth refusal through', async () => {
    mocks.access.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) });
    const res = await POST(post({ test_id: 't1', errors: [] }));
    expect(res.status).toBe(401);
  });
});
