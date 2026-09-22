// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Staff closing a reported problem: every open report on that part of the
 * question at once, each reporter told once, and the stamp only when they were.
 */

const mocks = vi.hoisted(() => ({
  staff: vi.fn(),
  context: vi.fn(),
  resolve: vi.fn(),
  markNotified: vi.fn(),
  tell: vi.fn(),
}));

vi.mock('@/lib/qb-auth', () => ({ verifyQBStaff: (...a: unknown[]) => mocks.staff(...a) }));
vi.mock('@/lib/qb-report-notify', () => ({ tellReportersTheOutcome: (...a: unknown[]) => mocks.tell(...a) }));
vi.mock('@neram/database', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neram/database')>();
  return {
    ...actual,
    getQBReportContext: (...a: unknown[]) => mocks.context(...a),
    resolveQBReportGroup: (...a: unknown[]) => mocks.resolve(...a),
    markQBReportsNotified: (...a: unknown[]) => mocks.markNotified(...a),
  };
});

import { POST } from './route';

const req = (body: unknown) =>
  new NextRequest('http://localhost/api/question-bank/questions/q31/reports/resolve', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const params = { params: Promise.resolve({ id: 'q31' }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.staff.mockResolvedValue({ ok: true, caller: { id: 'manager-1', user_type: 'student', staff_role: 'manager' } });
  mocks.context.mockResolvedValue({
    question: { id: 'q31', display_order: 31 },
    paper: { id: 'p2015', label: 'JEE Paper 2 2015', uploaded_by: 'founder' },
  });
  mocks.resolve.mockResolvedValue({ reportIds: ['r1', 'r2', 'r3'], studentIds: ['s1', 's2'] });
  mocks.tell.mockResolvedValue(2);
  mocks.markNotified.mockResolvedValue(undefined);
});

describe('POST /api/question-bank/questions/[id]/reports/resolve', () => {
  it('marks the video fixed for everyone who reported it, and tells them', async () => {
    const res = await POST(req({ target: 'video', outcome: 'fixed' }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { resolved: 3, notified: 2 } });
    expect(mocks.resolve).toHaveBeenCalledWith('q31', 'video', null, {
      outcome: 'fixed',
      note: null,
      resolvedBy: 'manager-1',
    });
    expect(mocks.tell).toHaveBeenCalledWith(
      expect.objectContaining({
        studentIds: ['s1', 's2'],
        outcome: 'fixed',
        paperLabel: 'JEE Paper 2 2015',
        number: 31,
        teacher: { authHeader: 'Bearer t', userId: 'manager-1' },
      }),
    );
    expect(mocks.markNotified).toHaveBeenCalledWith(['r1', 'r2', 'r3']);
  });

  it('needs a reason before saying it was not a mistake', async () => {
    const res = await POST(req({ target: 'video', outcome: 'not_a_mistake', note: ' ' }), params);
    expect(res.status).toBe(400);
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it('passes the part of a split drawing through', async () => {
    await POST(req({ target: 'video', part_label: 'B', outcome: 'not_a_mistake', note: 'It is right.' }), params);
    expect(mocks.resolve).toHaveBeenCalledWith('q31', 'video', 'B', expect.objectContaining({ note: 'It is right.' }));
  });

  it('tells nobody twice when the problem was already closed', async () => {
    mocks.resolve.mockResolvedValue({ reportIds: [], studentIds: [] });
    const res = await POST(req({ target: 'video', outcome: 'fixed' }), params);
    expect(await res.json()).toEqual({ data: { resolved: 0, notified: 0 } });
    expect(mocks.tell).not.toHaveBeenCalled();
  });

  it('still closes the reports when the message fails, without stamping them told', async () => {
    mocks.tell.mockRejectedValue(new Error('Graph is down'));
    const res = await POST(req({ target: 'video', outcome: 'fixed' }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).data.resolved).toBe(3);
    expect(mocks.markNotified).not.toHaveBeenCalled();
  });

  it('refuses a student', async () => {
    mocks.staff.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    const res = await POST(req({ target: 'video', outcome: 'fixed' }), params);
    expect(res.status).toBe(403);
  });
});
