import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  tables: {} as Record<string, { data: unknown; error: unknown }>,
  save: vi.fn(),
  sendNudge: vi.fn(),
  recordFlip: vi.fn(),
  roster: vi.fn(),
  markVoiceSent: vi.fn(),
  updates: [] as Array<{ table: string; values: any }>,
}));

function chain(result: { data: unknown; error: unknown }, table = '') {
  const c: any = new Proxy({}, {
    get: (_t, p: string) => {
      if (p === 'then') return (res: (v: unknown) => void) => res(result);
      if (p === 'update') return (values: unknown) => { m.updates.push({ table, values }); return c; };
      return () => c;
    },
  });
  return c;
}

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'oid' }), extractBearerToken: () => 'test_token' }));
vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (name: string) => chain(m.tables[name] ?? { data: null, error: null }, name) }),
  getAssignmentDrawingRoster: (...a: unknown[]) => m.roster(...a),
}));
vi.mock('@neram/database/queries/nexus', () => ({
  saveDrawingReviewWithAction: (...a: unknown[]) => m.save(...a),
  recordGamificationEvent: async () => undefined,
  setSubmissionTags: async () => undefined,
  recomputeExamAttemptScore: async () => undefined,
  recordFlip: (...a: unknown[]) => m.recordFlip(...a),
}));
vi.mock('@/lib/nudge-delivery', () => ({ sendNudge: (...a: unknown[]) => m.sendNudge(...a), plainToHtmlWithLink: () => '<p>html</p>' }));
vi.mock('@/lib/teams-assignment-announcements', () => ({ canPostToGraph: () => false }));
vi.mock('@/lib/class-share-links', () => ({ shareBaseUrl: () => 'https://nexus.test' }));
vi.mock('@/lib/drawing-voice-feedback', () => ({ markVoiceSent: (...a: unknown[]) => m.markVoiceSent(...a) }));
vi.mock('@/lib/drawing-eval/db', () => ({ evalTables: () => ({}) }));
vi.mock('@/lib/drawing-hold', () => ({ releaseModeFor: async () => 'immediate', heldSubmissionIds: async () => new Set(), holdReview: async () => ({}) }));
vi.mock('@/lib/drawing-region-sync', () => ({ syncRegionMarks: async () => undefined }));

import { PATCH } from './route';

const ctx = { params: Promise.resolve({ id: 'd1' }) };
const patch = (body: unknown) =>
  new NextRequest('http://localhost/api/drawing/submissions/d1/review', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer test_token', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const sketch = { id: 'd1', student_id: 's1', source_type: 'sketchbook', status: 'completed', assignment_id: null, reviewed_at: null, tutor_rating: null, tutor_feedback: null, original_image_url: 'https://x/d1.jpg' };

describe('PATCH review for practice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.updates = [];
    m.tables = { users: { data: { id: 't1', user_type: 'teacher', name: 'Hari Babu' }, error: null } };
    m.save.mockImplementation(async (id: string) => ({ id, student_id: 's1' }));
    m.sendNudge.mockResolvedValue({ results: [{ chat: true, teams: false, inapp: true }] });
    m.recordFlip.mockResolvedValue(undefined);
    m.roster.mockResolvedValue({ rows: [] });
    m.markVoiceSent.mockResolvedValue(null);
  });

  it('tells the student about a first review of a sketch and marks it seen', async () => {
    m.tables.drawing_submissions = { data: sketch, error: null };
    const res = await PATCH(patch({ tutor_rating: 4, tutor_feedback: 'Good lines', action: 'complete' }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notified).toBe(true);
    expect(body.next_submission_id).toBeNull();
    expect(m.sendNudge).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'practice_reviewed',
      studentIds: ['s1'],
      subject: 'Hari reviewed your sketch',
    }));
    expect(m.recordFlip).toHaveBeenCalledWith('t1', 'd1', 'seen');
  });

  it('stays quiet when the same review is saved again', async () => {
    m.tables.drawing_submissions = { data: { ...sketch, reviewed_at: '2026-09-16T10:00:00Z', tutor_rating: null, tutor_feedback: 'Good lines' }, error: null };
    const res = await PATCH(patch({ tutor_rating: 4, tutor_feedback: 'Good lines', action: 'complete' }), ctx);
    expect(res.status).toBe(200);
    expect(m.sendNudge).not.toHaveBeenCalled();
  });

  // A sketch never carries a grade: CHECK drawing_submissions_sketch_ungraded
  // refuses the row. The review page still scores a sketch on the rubric and
  // sends the stars, so the save failed with "Failed to save review" every time.
  it('saves a sketch without a grade even when the page sends one', async () => {
    m.tables.drawing_submissions = { data: sketch, error: null };
    const res = await PATCH(patch({ tutor_rating: 4, tutor_marks: 7, tutor_feedback: 'Good lines', action: 'complete' }), ctx);
    expect(res.status).toBe(200);
    expect(m.save).toHaveBeenCalledWith('d1', expect.objectContaining({ tutor_rating: null, tutor_marks: null }), 'complete');
  });

  it('drafts a sketch without a grade', async () => {
    m.tables.drawing_submissions = { data: sketch, error: null };
    const res = await PATCH(patch({ tutor_rating: 4, tutor_marks: 7, action: 'draft' }), ctx);
    expect(res.status).toBe(200);
    const write = m.updates.find((u) => u.table === 'drawing_submissions');
    expect(write?.values).toMatchObject({ tutor_rating: null, tutor_marks: null });
  });

  it('keeps the grade on practice that is not a sketch', async () => {
    m.tables.drawing_submissions = { data: { ...sketch, source_type: 'question_bank' }, error: null };
    await PATCH(patch({ tutor_rating: 4, tutor_feedback: 'Good lines', action: 'complete' }), ctx);
    expect(m.save).toHaveBeenCalledWith('d1', expect.objectContaining({ tutor_rating: 4 }), 'complete');
  });

  it('refuses a redo on a sketch without saving anything', async () => {
    m.tables.drawing_submissions = { data: sketch, error: null };
    const res = await PATCH(patch({ action: 'redo' }), ctx);
    expect(res.status).toBe(400);
    expect(m.save).not.toHaveBeenCalled();
  });

  it('sends the voice note recorded on a sketch', async () => {
    // Recording one is now allowed (the voice route asks reviewKindOf), so the
    // review has to hand it over. It used to require an assignment_id, which a
    // sketch never has, so the note stayed a draft and the student, who was told
    // their sketch had been reviewed, found nothing to play.
    m.tables.drawing_submissions = { data: sketch, error: null };
    await PATCH(patch({ tutor_rating: 4, tutor_feedback: 'Good lines', action: 'complete' }), ctx);
    expect(m.markVoiceSent).toHaveBeenCalledWith('d1');
  });

  it('never sends a voice note on a test drawing', async () => {
    m.tables.drawing_submissions = { data: { ...sketch, source_type: 'exam', status: 'submitted' }, error: null };
    await PATCH(patch({ tutor_marks: 8, action: 'complete' }), ctx);
    expect(m.markVoiceSent).not.toHaveBeenCalled();
  });

  it('keeps assignment drawings on the assignment message', async () => {
    m.tables.drawing_submissions = { data: { ...sketch, source_type: 'assignment', assignment_id: 'a1', status: 'submitted' }, error: null };
    m.tables.nexus_class_assignments = { data: { id: 'a1', title: 'Line Practice', evaluation_type: 'stars', max_marks: 5 }, error: null };
    const res = await PATCH(patch({ tutor_rating: 4, tutor_feedback: 'ok', action: 'complete' }), ctx);
    expect(res.status).toBe(200);
    expect(m.sendNudge).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'assignment_reviewed' }));
    expect(m.recordFlip).not.toHaveBeenCalled();
  });
});
