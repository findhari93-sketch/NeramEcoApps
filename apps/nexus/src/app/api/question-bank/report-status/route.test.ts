// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), status: vi.fn() }));
vi.mock('@/lib/qb-auth', () => ({ verifyQBAccessAnyClassroom: (...a: unknown[]) => mocks.access(...a) }));
vi.mock('@neram/database', () => ({ getQBReportStatus: (...a: unknown[]) => mocks.status(...a) }));

import { GET } from './route';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const req = (qs: string) =>
  new NextRequest(`http://localhost/api/question-bank/report-status?${qs}`, { headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ ok: true, caller: { id: 'student-1', user_type: 'student' } });
  mocks.status.mockResolvedValue({ [A]: { mine: [], flagged: [{ target: 'video', part_label: null }] } });
});

describe('GET /api/question-bank/report-status', () => {
  it('answers for the asking student, and only for real question ids', async () => {
    const res = await GET(req(`question_ids=${A},not-an-id,${B},${A}`));
    expect(res.status).toBe(200);
    expect(mocks.status).toHaveBeenCalledWith([A, B], 'student-1');
    expect((await res.json()).data[A].flagged).toHaveLength(1);
  });

  it('asks the database nothing when there is nothing to ask', async () => {
    const res = await GET(req('question_ids='));
    expect(await res.json()).toEqual({ data: {} });
    expect(mocks.status).not.toHaveBeenCalled();
  });
});
