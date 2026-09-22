// @vitest-environment node
import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ staff: vi.fn(), reports: vi.fn() }));
vi.mock('@/lib/qb-auth', () => ({ verifyQBStaff: (...a: unknown[]) => mocks.staff(...a) }));
vi.mock('@neram/database', () => ({ getPaperQBReports: (...a: unknown[]) => mocks.reports(...a) }));

import { GET } from './route';

const req = () =>
  new NextRequest('http://localhost/api/question-bank/papers/p2015/reports', { headers: { Authorization: 'Bearer t' } });
const params = { params: { id: 'p2015' } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reports.mockResolvedValue({ q31: [{ target: 'video', students: 2 }] });
});

describe('GET /api/question-bank/papers/[id]/reports', () => {
  it("gives staff the paper's open problems, keyed by question", async () => {
    mocks.staff.mockResolvedValue({ ok: true, caller: { id: 't1', user_type: 'teacher' } });
    const res = await GET(req(), params);
    expect(mocks.reports).toHaveBeenCalledWith('p2015');
    expect((await res.json()).data.q31[0].students).toBe(2);
  });

  it('refuses a student, who must never see who reported what', async () => {
    mocks.staff.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    expect((await GET(req(), params)).status).toBe(403);
    expect(mocks.reports).not.toHaveBeenCalled();
  });
});
