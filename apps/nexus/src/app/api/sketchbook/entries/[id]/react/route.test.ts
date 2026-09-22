import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  getPracticeDrawing: vi.fn(),
  setSketchbookReaction: vi.fn(),
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
  setSketchbookReaction: (...a: unknown[]) => m.setSketchbookReaction(...a),
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
  });

  it('saves a new reaction, records the flip and tells the student', async () => {
    const res = await POST(post({ reaction: 'wow' }), ctx);
    expect(res.status).toBe(200);
    expect(m.setSketchbookReaction).toHaveBeenCalledWith('d1', 'wow');
    expect(m.recordFlip).toHaveBeenCalledWith('t1', 'd1', 'seen');
    expect(m.sendNudge).toHaveBeenCalledTimes(1);
    expect(m.sendNudge.mock.calls[0][0]).toMatchObject({ studentIds: ['s1'], eventType: 'sketch_reaction' });
  });

  it('a comment on its own keeps the reaction already given', async () => {
    const res = await POST(post({ comment: '  Lovely shading on the left apple  ' }), ctx);
    expect(res.status).toBe(200);
    expect(m.setSketchbookReaction).not.toHaveBeenCalled();
    expect(m.addDrawingSubmissionComment).toHaveBeenCalledWith(
      expect.objectContaining({ submission_id: 'd1', author_id: 't1', comment_text: 'Lovely shading on the left apple' }),
    );
    expect(m.sendNudge).toHaveBeenCalledTimes(1);
    expect(m.sendNudge.mock.calls[0][0].subject).toBe('Hari commented on your sketch');
    expect(await res.json()).toEqual({ reaction: 'heart' });
  });

  it('null still clears the reaction on purpose', async () => {
    await POST(post({ reaction: null }), ctx);
    expect(m.setSketchbookReaction).toHaveBeenCalledWith('d1', null);
    expect(m.sendNudge).not.toHaveBeenCalled();
  });

  it('refuses a body with neither a reaction nor a comment', async () => {
    const res = await POST(post({}), ctx);
    expect(res.status).toBe(400);
    expect(m.setSketchbookReaction).not.toHaveBeenCalled();
  });

  it('does not message the student twice for the same reaction', async () => {
    await POST(post({ reaction: 'heart' }), ctx);
    expect(m.sendNudge).not.toHaveBeenCalled();
  });
});
