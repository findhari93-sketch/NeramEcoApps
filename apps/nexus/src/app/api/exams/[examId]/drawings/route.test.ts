import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ access: vi.fn(), list: vi.fn(), people: [] as unknown[] }));

vi.mock('@/lib/exam-access', () => ({ requireExamStaff: (...a: unknown[]) => m.access(...a) }));
vi.mock('@neram/database/queries/nexus', () => ({ listExamDrawings: (...a: unknown[]) => m.list(...a) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: () => ({ select: () => ({ in: async () => ({ data: m.people, error: null }) }) }) }),
}));

import { GET } from './route';

const req = () => new NextRequest('http://localhost/api/exams/e1/drawings', { headers: { Authorization: 'Bearer t' } });
const ctx = { params: { examId: 'e1' } };

describe('GET /api/exams/[examId]/drawings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses anyone the exam access check refuses', async () => {
    m.access.mockResolvedValue({ ok: false, response: NextResponse.json({ error: 'Staff only' }, { status: 403 }) });
    const res = await GET(req(), ctx);
    expect(res.status).toBe(403);
    expect(m.list).not.toHaveBeenCalled();
  });

  it('lists unmarked drawings first, each with its student', async () => {
    m.access.mockResolvedValue({ ok: true, caller: {}, exam: { id: 'e1' } });
    m.list.mockResolvedValue([
      { submission_id: 'd1', student_id: 's1', question_id: 'q', image_url: 'https://x/1.jpg', awarded: 8, max_marks: 10, status: 'completed' },
      { submission_id: 'd2', student_id: 's2', question_id: 'q', image_url: 'https://x/2.jpg', awarded: null, max_marks: 10, status: 'submitted' },
    ]);
    m.people = [{ id: 's1', name: 'Asha', avatar_url: null }, { id: 's2', name: 'Bala', avatar_url: null }];
    const res = await GET(req(), ctx);
    const body = await res.json();
    expect(body.drawings.map((d: { submission_id: string }) => d.submission_id)).toEqual(['d2', 'd1']);
    expect(body.drawings[0].student_name).toBe('Bala');
  });

  it('falls back to a plain label when the student row is missing', async () => {
    m.access.mockResolvedValue({ ok: true, caller: {}, exam: { id: 'e1' } });
    m.list.mockResolvedValue([
      { submission_id: 'd3', student_id: 's3', question_id: 'q', image_url: 'https://x/3.jpg', awarded: null, max_marks: 10, status: 'submitted' },
    ]);
    m.people = [];
    const res = await GET(req(), ctx);
    const body = await res.json();
    expect(body.drawings[0].student_name).toBe('Student');
    expect(body.drawings[0].avatar_url).toBeNull();
  });
});
