// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The answer-key gate holds whichever way the history is asked for.
 *
 * With ?placement_id=<exam door> an unpublished exam was refused. Without it,
 * the route skipped the gate and replayed every attempt on the paper, exam
 * sittings included, correct answers and all. The student Performance tab asks
 * without a placement_id, so a student who had sat the unpublished 18 Aug exam
 * could read its key while 22 classmates still had a reopen to sit it.
 */

const mocks = vi.hoisted(() => ({
  placements: new Map<string, any>(),
  exams: new Map<string, any>(),
  attempts: [] as any[],
}));

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'oid-1' }) }));

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: async () => ({ data: { id: 'student-1', name: 'Bavishiya', avatar_url: null } }) }),
      }),
    }),
  }),
  getPlacementById: async (id: string) => mocks.placements.get(id) ?? null,
  getExam: async (id: string) => mocks.exams.get(id) ?? null,
  getStudentTestAttemptReview: async (input: { placementId?: string | null }) => ({
    test: { test_id: 'test-1', title: 'History of Architecture Test', passing_pct: 80 },
    attempts: input.placementId
      ? mocks.attempts.filter((a) => a.placement_id === input.placementId)
      : mocks.attempts,
  }),
}));

import { GET } from './route';

const DAY = 86_400_000;
const ask = (qs = '') =>
  GET(new NextRequest(`http://localhost/api/student/tests/test-1/attempts${qs}`, { headers: { Authorization: 'Bearer t' } }), {
    params: { testId: 'test-1' },
  });

const attempt = (id: string, placementId: string | null) => ({
  attempt_id: id,
  placement_id: placementId,
  review: [{ question_id: 'q1', correct_answer: 'b', selected: 'b' }],
});

beforeEach(() => {
  mocks.placements = new Map([
    ['exam-door', { id: 'exam-door', test_id: 'test-1', context_type: 'exam', gating: { exam_id: 'exam-1' } }],
    ['study-door', { id: 'study-door', test_id: 'test-1', context_type: 'study_file', gating: {} }],
  ]);
  mocks.exams = new Map([
    ['exam-1', { id: 'exam-1', results_state: 'unpublished', closes_at: new Date(Date.now() - 30 * DAY).toISOString() }],
  ]);
  mocks.attempts = [attempt('practice-1', 'study-door'), attempt('exam-1-sitting', 'exam-door')];
});

describe('GET /api/student/tests/[testId]/attempts', () => {
  it('still refuses the exam door itself while results are unpublished', async () => {
    const body = await (await ask('?placement_id=exam-door')).json();
    expect(body.data.code).toBe('RESULTS_NOT_PUBLISHED');
    expect(body.data.attempts).toEqual([]);
  });

  it('leaves an unpublished exam sitting out of the whole-paper history, and keeps the practice', async () => {
    const body = await (await ask()).json();
    const ids = body.data.attempts.map((a: any) => a.attempt_id);
    expect(ids).toEqual(['practice-1']);
    expect(JSON.stringify(body)).not.toContain('exam-1-sitting');
  });

  it('keeps an exam sitting out while its window is still open, even once published', async () => {
    mocks.exams.set('exam-1', {
      id: 'exam-1',
      results_state: 'final',
      closes_at: new Date(Date.now() + DAY).toISOString(),
    });
    const body = await (await ask()).json();
    expect(body.data.attempts.map((a: any) => a.attempt_id)).toEqual(['practice-1']);
  });

  it('shows the exam sitting in the whole-paper history once results are out and the exam has closed', async () => {
    mocks.exams.set('exam-1', {
      id: 'exam-1',
      results_state: 'final',
      closes_at: new Date(Date.now() - DAY).toISOString(),
    });
    const body = await (await ask()).json();
    expect(body.data.attempts.map((a: any) => a.attempt_id)).toEqual(['practice-1', 'exam-1-sitting']);
  });

  it('fails closed on an exam door it cannot find the exam for', async () => {
    mocks.exams = new Map();
    const body = await (await ask()).json();
    expect(body.data.attempts.map((a: any) => a.attempt_id)).toEqual(['practice-1']);
  });
});
