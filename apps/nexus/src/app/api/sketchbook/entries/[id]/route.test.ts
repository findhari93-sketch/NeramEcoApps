import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ getRequestUser: vi.fn(), getSketchbookSketch: vi.fn(), hasAnyLiveFeature: vi.fn(), repairPracticeDay: vi.fn(), del: vi.fn() }));

vi.mock('@/lib/study-materials', () => ({ getRequestUser: (h: string | null) => m.getRequestUser(h) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: () => ({ delete: () => ({ eq: async () => { m.del(); return { error: null }; } }) }) }),
}));
vi.mock('@neram/database/queries/nexus', () => ({
  getSketchbookSketch: (...a: unknown[]) => m.getSketchbookSketch(...a),
  hasAnyLiveFeature: (...a: unknown[]) => m.hasAnyLiveFeature(...a),
  repairPracticeDay: (...a: unknown[]) => m.repairPracticeDay(...a),
}));

import { DELETE } from './route';

const del = () => new NextRequest('http://localhost/api/sketchbook/entries/d1', { method: 'DELETE', headers: { Authorization: 'Bearer t' } });
const ctx = { params: { id: 'd1' } };

describe('DELETE /api/sketchbook/entries/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getRequestUser.mockResolvedValue({ id: 's1', user_type: 'student' });
    m.hasAnyLiveFeature.mockResolvedValue(false);
  });

  it('keeps a sketch the teacher has reviewed', async () => {
    m.getSketchbookSketch.mockResolvedValue({ id: 'd1', student_id: 's1', reviewed_at: '2026-09-16T10:00:00Z', submitted_at: '2026-09-15T10:00:00Z' });
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(409);
    expect(m.del).not.toHaveBeenCalled();
  });

  it('deletes an unreviewed sketch and recounts the day', async () => {
    m.getSketchbookSketch.mockResolvedValue({ id: 'd1', student_id: 's1', reviewed_at: null, submitted_at: '2026-09-15T10:00:00Z' });
    const res = await DELETE(del(), ctx);
    expect(res.status).toBe(204);
    expect(m.del).toHaveBeenCalled();
    expect(m.repairPracticeDay).toHaveBeenCalled();
  });
});
