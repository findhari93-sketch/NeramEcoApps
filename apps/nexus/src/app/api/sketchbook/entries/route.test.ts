import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ITEM = '11111111-1111-4111-8111-111111111111';

const m = vi.hoisted(() => ({
  getRequestUser: vi.fn(),
  createDrawingSubmission: vi.fn(),
  update: vi.fn(),
  upsertPracticeDay: vi.fn(),
  getStudentPrimaryClassroom: vi.fn(),
  recordGamificationEvent: vi.fn(),
  loadStudentRhythm: vi.fn(),
  getInspirationItem: vi.fn(),
}));

vi.mock('@/lib/study-materials', () => ({ getRequestUser: (h: string | null) => m.getRequestUser(h) }));
vi.mock('@/lib/sketchbook-payload', () => ({ loadStudentRhythm: (...a: unknown[]) => m.loadStudentRhythm(...a) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      update: (patch: unknown) => ({ eq: async () => { m.update(patch); return { error: null }; } }),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));
vi.mock('@neram/database/queries/nexus', () => ({
  createDrawingSubmission: (...a: unknown[]) => m.createDrawingSubmission(...a),
  getStudentPrimaryClassroom: (...a: unknown[]) => m.getStudentPrimaryClassroom(...a),
  recordGamificationEvent: (...a: unknown[]) => m.recordGamificationEvent(...a),
  upsertPracticeDay: (...a: unknown[]) => m.upsertPracticeDay(...a),
  getInspirationItem: (...a: unknown[]) => m.getInspirationItem(...a),
}));

import { POST } from './route';

const post = (body: unknown) =>
  new NextRequest('http://localhost/api/sketchbook/entries', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const BASE = { original_image_url: 'https://db.neramclasses.com/storage/v1/object/public/drawing-uploads/s1/a.jpg' };

describe('POST /api/sketchbook/entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.getRequestUser.mockResolvedValue({ id: 's1', user_type: 'student' });
    m.createDrawingSubmission.mockResolvedValue({ id: 'd1', submitted_at: '2026-09-17T10:00:00Z' });
    m.upsertPracticeDay.mockResolvedValue({ isNewDay: false });
    m.getStudentPrimaryClassroom.mockResolvedValue(null);
    m.recordGamificationEvent.mockResolvedValue(undefined);
    m.loadStudentRhythm.mockResolvedValue({ rhythm: { week: { count: 1, goal: 3 } } });
  });

  it('links a sketch practised from a visible Inspiration drawing', async () => {
    m.getInspirationItem.mockResolvedValue({ item: { id: ITEM }, pair: null });
    const res = await POST(post({ ...BASE, inspiration_item_id: ITEM }));
    expect(res.status).toBe(201);
    expect(m.getInspirationItem).toHaveBeenCalledWith(ITEM, 's1', 'visible');
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed', inspiration_item_id: ITEM }));
  });

  it('refuses a drawing the student cannot see, before saving anything', async () => {
    m.getInspirationItem.mockResolvedValue({ item: null, pair: null });
    const res = await POST(post({ ...BASE, inspiration_item_id: ITEM }));
    expect(res.status).toBe(400);
    expect(m.createDrawingSubmission).not.toHaveBeenCalled();
  });

  it('refuses an id that is not an id', async () => {
    const res = await POST(post({ ...BASE, inspiration_item_id: 'nope' }));
    expect(res.status).toBe(400);
    expect(m.getInspirationItem).not.toHaveBeenCalled();
  });

  it('stores no link for a plain sketch', async () => {
    const res = await POST(post(BASE));
    expect(res.status).toBe(201);
    expect(m.update).toHaveBeenCalledWith(expect.objectContaining({ inspiration_item_id: null }));
  });
});
