// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), tree: vi.fn() }));
vi.mock('@/lib/qb-auth', () => ({ verifyQBAccess: (...a: unknown[]) => mocks.access(...a) }));
vi.mock('@neram/database', async () => {
  const { parseSessionKey } = await vi.importActual<typeof import('@neram/database')>('@neram/database');
  return { getQBSubjectTagTree: (...a: unknown[]) => mocks.tree(...a), parseSessionKey };
});

import { GET } from './route';

const req = (qs: string) =>
  new NextRequest(`http://localhost/api/question-bank/category-counts?${qs}`, {
    headers: { Authorization: 'Bearer t' },
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ ok: true });
  mocks.tree.mockResolvedValue({ tree: [], counts: {} });
});

describe('GET /api/question-bank/category-counts', () => {
  it('counts only the shift and section being practised', async () => {
    // Without these the drawer counted both 2019 Session 1 shifts and every
    // section: Mathematics (60), Aptitude (100), Drawing (6) beside a 30-question list.
    const res = await GET(
      req('classroom_id=c&exam_type=JEE_PAPER_2&year=2019&session=Session%201&shift=forenoon&section=math_mcq'),
    );
    expect(res.status).toBe(200);
    expect(mocks.tree).toHaveBeenCalledWith({
      exam_type: 'JEE_PAPER_2',
      year: 2019,
      session: 'Session 1',
      shift: 'forenoon',
      section: ['math_mcq'],
    });
  });

  it('still reads a shift folded into the session key', async () => {
    await GET(req('exam_type=JEE_PAPER_2&year=2019&session=Session%201%20(Afternoon)'));
    expect(mocks.tree).toHaveBeenCalledWith(
      expect.objectContaining({ session: 'Session 1', shift: 'afternoon', section: null }),
    );
  });

  it('asks for the whole bank when nothing is scoped', async () => {
    await GET(req('classroom_id=c'));
    expect(mocks.tree).toHaveBeenCalledWith(undefined);
  });
});
