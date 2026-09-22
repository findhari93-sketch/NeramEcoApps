// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  staff: vi.fn(),
  resolve: vi.fn(),
  context: vi.fn(),
  markNotified: vi.fn(),
  tell: vi.fn(),
}));
vi.mock('@/lib/qb-auth', () => ({ verifyQBStaff: (...a: unknown[]) => mocks.staff(...a) }));
vi.mock('@/lib/qb-report-notify', () => ({ tellReportersTheOutcome: (...a: unknown[]) => mocks.tell(...a) }));
vi.mock('@neram/database', () => ({
  resolveQBReport: (...a: unknown[]) => mocks.resolve(...a),
  getQBReportContext: (...a: unknown[]) => mocks.context(...a),
  markQBReportsNotified: (...a: unknown[]) => mocks.markNotified(...a),
}));

import { PATCH } from './route';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/question-bank/reports/r1', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: 'r1' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.staff.mockResolvedValue({ ok: true, caller: { id: 'm1', user_type: 'student', staff_role: 'manager' } });
  mocks.resolve.mockResolvedValue({
    id: 'r1',
    question_id: 'q31',
    student_id: 's1',
    target: 'answer_key',
    part_label: null,
  });
  mocks.context.mockResolvedValue({ question: { display_order: 31 }, paper: { label: 'JEE Paper 2 2015' } });
  mocks.tell.mockResolvedValue(1);
});

describe('PATCH /api/question-bank/reports/[id]', () => {
  it('lets a manager close a report, and tells the student', async () => {
    const res = await PATCH(req({ status: 'resolved' }), params);
    expect(res.status).toBe(200);
    expect(mocks.resolve).toHaveBeenCalledWith('r1', { status: 'resolved', resolution_note: null, resolved_by: 'm1' });
    expect(mocks.tell).toHaveBeenCalledWith(expect.objectContaining({ studentIds: ['s1'], outcome: 'fixed' }));
    expect(mocks.markNotified).toHaveBeenCalledWith(['r1']);
  });

  it('needs a reason to call it not a mistake', async () => {
    const res = await PATCH(req({ status: 'dismissed' }), params);
    expect(res.status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('tells nobody when a report is only picked up for review', async () => {
    await PATCH(req({ status: 'in_review' }), params);
    expect(mocks.tell).not.toHaveBeenCalled();
  });

  it('refuses a student', async () => {
    mocks.staff.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await PATCH(req({ status: 'resolved' }), params)).status).toBe(403);
  });
});
