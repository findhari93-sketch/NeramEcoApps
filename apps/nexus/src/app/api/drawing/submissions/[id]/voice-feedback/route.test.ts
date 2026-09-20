import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  verifyMsToken: vi.fn(),
  rows: {} as Record<string, unknown>,
  createVoiceUploadUrl: vi.fn(),
}));

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: (h: string | null) => m.verifyMsToken(h) }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: m.rows[table] ?? null, error: null }),
          maybeSingle: async () => ({ data: m.rows[table] ?? null, error: null }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/drawing-voice-feedback', () => ({
  createVoiceUploadUrl: (...a: unknown[]) => m.createVoiceUploadUrl(...a),
  deleteVoiceFeedback: vi.fn(),
  saveVoiceDraft: vi.fn(),
  signVoiceFeedback: vi.fn(async () => []),
  voiceObjectExists: vi.fn(async () => true),
}));

import { POST } from './route';

const ctx = { params: Promise.resolve({ id: 'd1' }) };
const start = () =>
  new NextRequest('http://localhost/api/drawing/submissions/d1/voice-feedback', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify({ mime: 'audio/webm', size_bytes: 2048 }),
  });

describe('POST /api/drawing/submissions/[id]/voice-feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.verifyMsToken.mockResolvedValue({ oid: 'oid-1' });
    m.rows = { users: { id: 't1', user_type: 'teacher' } };
    m.createVoiceUploadUrl.mockResolvedValue({ path: 'p', token: 'tok' });
  });

  it('lets a teacher speak over a sketch', async () => {
    m.rows.drawing_submissions = { id: 'd1', student_id: 's1', source_type: 'sketchbook', assignment_id: null, original_image_url: 'u' };
    const res = await POST(start(), ctx);
    expect(res.status).toBe(200);
    expect(m.createVoiceUploadUrl).toHaveBeenCalled();
  });

  it('lets a teacher speak over question bank practice', async () => {
    m.rows.drawing_submissions = { id: 'd1', student_id: 's1', source_type: 'question_bank', assignment_id: null, original_image_url: 'u' };
    expect((await POST(start(), ctx)).status).toBe(200);
  });

  it('still lets a teacher speak over an assignment drawing', async () => {
    m.rows.drawing_submissions = { id: 'd1', student_id: 's1', source_type: 'assignment', assignment_id: 'a1', original_image_url: 'u' };
    expect((await POST(start(), ctx)).status).toBe(200);
  });

  it('refuses a test drawing, whose marking is embargoed', async () => {
    m.rows.drawing_submissions = { id: 'd1', student_id: 's1', source_type: 'exam', assignment_id: null, original_image_url: 'u' };
    const res = await POST(start(), ctx);
    expect(res.status).toBe(400);
    expect(m.createVoiceUploadUrl).not.toHaveBeenCalled();
  });

  it('refuses a student', async () => {
    m.rows.users = { id: 's1', user_type: 'student' };
    m.rows.drawing_submissions = { id: 'd1', student_id: 's1', source_type: 'sketchbook', assignment_id: null };
    expect((await POST(start(), ctx)).status).toBe(403);
  });

  it('answers an expired sign-in with 401, not 500', async () => {
    m.verifyMsToken.mockRejectedValue(new Error('Invalid Microsoft token'));
    expect((await POST(start(), ctx)).status).toBe(401);
  });

  it('does not turn a broken database into a 401 because it says "author"', async () => {
    m.rows.drawing_submissions = { id: 'd1', student_id: 's1', source_type: 'sketchbook', assignment_id: null, original_image_url: 'u' };
    m.createVoiceUploadUrl.mockRejectedValue(new Error('column authored_by does not exist'));
    expect((await POST(start(), ctx)).status).toBe(500);
  });
});
