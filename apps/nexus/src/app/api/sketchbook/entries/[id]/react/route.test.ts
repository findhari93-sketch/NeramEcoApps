import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  getPracticeDrawing: vi.fn(),
  savePracticeEvaluation: vi.fn(),
  recordFlip: vi.fn(),
  addDrawingSubmissionComment: vi.fn(),
  assertStaffSeesStudent: vi.fn(),
  sendNudge: vi.fn(),
}));

vi.mock('@/lib/study-materials', () => ({ getRequestUser: (h: string | null) => m.getRequestUser(h) }));
vi.mock('@/lib/sketchbook-access', () => ({ assertStaffSeesStudent: (...a: unknown[]) => m.assertStaffSeesStudent(...a) }));
vi.mock('@/lib/nudge-delivery', () => ({ sendNudge: (...a: unknown[]) => m.sendNudge(...a) }));
vi.mock('@neram/database/queries/nexus', () => ({
  getPracticeDrawing: (...a: unknown[]) => m.getPracticeDrawing(...a),
  savePracticeEvaluation: (...a: unknown[]) => m.savePracticeEvaluation(...a),
  isDrawingGrade: (v: unknown) => ['top', 'mid', 'needs_practice'].includes(v as string),
  recordFlip: (...a: unknown[]) => m.recordFlip(...a),
  addDrawingSubmissionComment: (...a: unknown[]) => m.addDrawingSubmissionComment(...a),
}));

import { POST } from './route';

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/sketchbook/entries/d1/react', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const ctx = { params: { id: 'd1' } };

describe('POST /api/sketchbook/entries/[id]/react', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getRequestUser.mockResolvedValue({ id: 't1', name: 'Hari Babu', user_type: 'teacher' });
    m.getPracticeDrawing.mockResolvedValue({ id: 'd1', student_id: 's1', reaction: 'heart' });
    m.sendNudge.mockResolvedValue({ results: [], counts: {} });
    m.savePracticeEvaluation.mockImplementation(async (before: any, change: any) => ({
      reaction: change.reaction === undefined ? before.reaction : change.reaction,
      drawing_grade: change.grade === undefined ? (before.drawing_grade ?? null) : change.grade,
      evaluated_at: null,
    }));
  });

  it('saves a new reaction, records the flip and tells the student', async () => {
    const res = await POST(post({ reaction: 'wow' }), ctx);
    expect(res.status).toBe(200);
    expect(m.savePracticeEvaluation).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }), { reaction: 'wow', grade: undefined }, 't1');
    expect(m.recordFlip).toHaveBeenCalledWith('t1', 'd1', 'seen');
    expect(m.sendNudge).toHaveBeenCalledTimes(1);
    expect(m.sendNudge.mock.calls[0][0]).toMatchObject({ studentIds: ['s1'], eventType: 'sketch_reaction' });
  });

  it('a comment on its own keeps the reaction already given', async () => {
    const res = await POST(post({ comment: '  Lovely shading on the left apple  ' }), ctx);
    expect(res.status).toBe(200);
    expect(m.savePracticeEvaluation).not.toHaveBeenCalled();
    expect(m.addDrawingSubmissionComment).toHaveBeenCalledWith(
      expect.objectContaining({ submission_id: 'd1', author_id: 't1', comment_text: 'Lovely shading on the left apple' }),
    );
    expect(m.sendNudge).toHaveBeenCalledTimes(1);
    expect(m.sendNudge.mock.calls[0][0].subject).toBe('Hari commented on your sketch');
    expect(await res.json()).toMatchObject({ reaction: 'heart' });
  });

  it('null still clears the reaction on purpose', async () => {
    await POST(post({ reaction: null }), ctx);
    expect(m.savePracticeEvaluation).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }), { reaction: null, grade: undefined }, 't1');
    expect(m.sendNudge).not.toHaveBeenCalled();
  });

  it('refuses a body with neither a reaction nor a comment', async () => {
    const res = await POST(post({}), ctx);
    expect(res.status).toBe(400);
    expect(m.savePracticeEvaluation).not.toHaveBeenCalled();
  });

  it('saves a grade, a reaction and a comment as one save and one message', async () => {
    const res = await POST(post({ grade: 'mid', reaction: 'wow', comment: 'Softer shadow' }), ctx);
    expect(res.status).toBe(200);
    expect(m.savePracticeEvaluation).toHaveBeenCalledWith(expect.objectContaining({ id: 'd1' }), { reaction: 'wow', grade: 'mid' }, 't1');
    expect(m.addDrawingSubmissionComment).toHaveBeenCalledTimes(1);
    expect(m.sendNudge).toHaveBeenCalledTimes(1);
    expect(m.sendNudge.mock.calls[0][0].plain).toBe('Hari said Wow to a sketch in your sketchbook. Grade: Mid. Hari wrote: Softer shadow');
    expect(await res.json()).toMatchObject({ reaction: 'wow', grade: 'mid' });
  });

  it('a grade on its own keeps the reaction and tells the student the grade', async () => {
    await POST(post({ grade: 'top' }), ctx);
    expect(m.savePracticeEvaluation).toHaveBeenCalledWith(expect.anything(), { reaction: undefined, grade: 'top' }, 't1');
    expect(m.sendNudge.mock.calls[0][0].subject).toBe('Hari graded your sketch');
  });

  it('refuses a grade that is not one of the three', async () => {
    const res = await POST(post({ grade: 'excellent' }), ctx);
    expect(res.status).toBe(400);
    expect(m.savePracticeEvaluation).not.toHaveBeenCalled();
  });

  it('does not message the student twice for the same reaction', async () => {
    await POST(post({ reaction: 'heart' }), ctx);
    expect(m.sendNudge).not.toHaveBeenCalled();
  });
});
