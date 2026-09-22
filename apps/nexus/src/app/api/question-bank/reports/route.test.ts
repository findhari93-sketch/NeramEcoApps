// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Reports list: staff get the grouped queue (managers included, whom the
 * old user_type check refused), students get only their own reports.
 */

const mocks = vi.hoisted(() => ({ access: vi.fn(), queue: vi.fn(), mine: vi.fn() }));
vi.mock('@/lib/qb-auth', () => ({ verifyQBAccessAnyClassroom: (...a: unknown[]) => mocks.access(...a) }));
vi.mock('@neram/database', () => ({
  getQBReportQueue: (...a: unknown[]) => mocks.queue(...a),
  getStudentQBReports: (...a: unknown[]) => mocks.mine(...a),
}));

import { GET } from './route';

const req = (qs = '') =>
  new NextRequest(`http://localhost/api/question-bank/reports${qs}`, { headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queue.mockResolvedValue({ items: [{ question_id: 'q31' }], counts: { open: 1, resolved: 0, dismissed: 0 } });
  mocks.mine.mockResolvedValue([{ id: 'r1' }]);
});

describe('GET /api/question-bank/reports', () => {
  it('gives a manager the whole queue', async () => {
    mocks.access.mockResolvedValue({ ok: true, caller: { id: 'm1', user_type: 'student', staff_role: 'manager' } });
    const res = await GET(req('?status=resolved'));
    expect(mocks.queue).toHaveBeenCalledWith('resolved');
    expect((await res.json()).counts.open).toBe(1);
  });

  it('falls back to the open queue for a status it does not know', async () => {
    mocks.access.mockResolvedValue({ ok: true, caller: { id: 't1', user_type: 'teacher' } });
    await GET(req('?status=everything'));
    expect(mocks.queue).toHaveBeenCalledWith('open');
  });

  it('gives a student only their own reports', async () => {
    mocks.access.mockResolvedValue({ ok: true, caller: { id: 's1', user_type: 'student', staff_role: null } });
    const res = await GET(req());
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.mine).toHaveBeenCalledWith('s1');
    expect((await res.json()).data).toEqual([{ id: 'r1' }]);
  });
});
