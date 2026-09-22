// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Two answers the take page needs from the attempt route.
 *
 * 1. A submit refused because the attempt is closed says whether that attempt is
 *    in fact submitted. On acf8084d, 8 students saw nothing when their second tap
 *    (or the timer racing their own tap) got a 409; their papers were in. The
 *    student attempts route cannot answer this for an exam, because it hides
 *    attempts until results are published.
 * 2. Opening a paper says how many more sittings this door allows after this
 *    one, so an exam result does not offer a "Try again" that can only fail.
 */

const mocks = vi.hoisted(() => ({
  submitAttempt: vi.fn(),
  getAttemptById: vi.fn(),
  getTestMeta: vi.fn(),
  getPlacementById: vi.fn(),
  startOrResumeAttempt: vi.fn(),
  getComposedTestQuestions: vi.fn(),
  countResult: { count: 0, error: null as unknown },
  countOps: [] as Array<[string, unknown[]]>,
}));

vi.mock('@/lib/ms-verify', () => ({ verifyMsToken: async () => ({ oid: 'oid-1' }) }));
vi.mock('@/lib/live-run', () => ({ findLiveRunForStudent: async () => null, describeLiveRun: () => ({}) }));
vi.mock('@/lib/catchup-test-gate', () => ({ decideCatchupGate: () => ({ blocked: false, outstanding: [] }), describeCatchupGate: () => '' }));

function usersOrAttempts(table: string) {
  if (table === 'users') {
    return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'student-1' } }) }) }) };
  }
  const chain: any = {
    select: (...a: unknown[]) => (mocks.countOps.push(['select', a]), chain),
    eq: (...a: unknown[]) => (mocks.countOps.push(['eq', a]), chain),
    then: (resolve: (v: unknown) => void) => resolve(mocks.countResult),
  };
  return chain;
}

vi.mock('@neram/database', () => ({
  getSupabaseAdminClient: () => ({ from: (t: string) => usersOrAttempts(t) }),
  submitAttempt: (...a: unknown[]) => mocks.submitAttempt(...a),
  getAttemptById: (...a: unknown[]) => mocks.getAttemptById(...a),
  getTestMeta: (...a: unknown[]) => mocks.getTestMeta(...a),
  getPlacementById: (...a: unknown[]) => mocks.getPlacementById(...a),
  startOrResumeAttempt: (...a: unknown[]) => mocks.startOrResumeAttempt(...a),
  getComposedTestQuestions: (...a: unknown[]) => mocks.getComposedTestQuestions(...a),
  applyTestDraw: (questions: unknown[]) => questions,
  resolveExamTimer: (_exam: unknown, test: any) => ({ test_type: test.test_type, duration_minutes: test.duration_minutes }),
  saveAttemptAnswers: vi.fn(),
  getStudyVideoState: vi.fn(),
  getExam: vi.fn(),
  getExamMakeup: vi.fn(),
  resolveExamWindowForStudent: vi.fn(),
  getExamAttemptOverride: vi.fn(),
  getLiveAccessRequest: vi.fn(),
  resolveTestRunWindow: vi.fn(),
  loadAttendanceAndAbsences: vi.fn(),
  listRunCoveredClasses: vi.fn(),
}));

import { GET, POST } from './route';

const submit = () =>
  new NextRequest('http://localhost/api/tests/attempt', {
    method: 'POST',
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify({ attempt_id: 'attempt-1', answers: { q1: 'a' }, action: 'submit' }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.countOps = [];
  mocks.countResult = { count: 0, error: null };
});

describe('POST submit on a closed attempt', () => {
  it('says the attempt is submitted when it is, so the student is shown their paper went in', async () => {
    mocks.submitAttempt.mockRejectedValue(new Error('ATTEMPT_ALREADY_SUBMITTED'));
    mocks.getAttemptById.mockResolvedValue({ id: 'attempt-1', status: 'submitted' });

    const res = await POST(submit());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      error: 'This attempt is already finished. Start a new one to try again.',
      code: 'ATTEMPT_CLOSED',
      attempt_status: 'submitted',
    });
    expect(mocks.getAttemptById).toHaveBeenCalledWith('attempt-1', 'student-1');
  });

  it('says abandoned when the attempt was closed without being submitted', async () => {
    mocks.submitAttempt.mockRejectedValue(new Error('ATTEMPT_ALREADY_SUBMITTED'));
    mocks.getAttemptById.mockResolvedValue({ id: 'attempt-1', status: 'abandoned' });
    const body = await (await POST(submit())).json();
    expect(body.attempt_status).toBe('abandoned');
  });

  it('still answers 409 when the lookup itself fails, with the status unknown', async () => {
    mocks.submitAttempt.mockRejectedValue(new Error('ATTEMPT_ALREADY_SUBMITTED'));
    mocks.getAttemptById.mockRejectedValue(new Error('network'));
    const res = await POST(submit());
    expect(res.status).toBe(409);
    expect((await res.json()).attempt_status).toBeNull();
  });

  it('leaves the closed-exam refusal as it was', async () => {
    mocks.submitAttempt.mockRejectedValue(new Error('EXAM_CLOSED'));
    const res = await POST(submit());
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('EXAM_CLOSED');
    expect(mocks.getAttemptById).not.toHaveBeenCalled();
  });
});

describe('POST submit review', () => {
  it('returns the solution video beside the explanation, per question', async () => {
    mocks.submitAttempt.mockResolvedValue({
      attempt_id: 'attempt-1',
      attempt_number: 1,
      test_id: 'test-1',
      score: 4,
      total_marks: 8,
      percentage: 50,
      draw: null,
      review: [
        { question_id: 'q1', correct_answer: 'a', selected: 'a', is_correct: true, is_gradable: true },
        { question_id: 'q2', correct_answer: 'b', selected: 'a', is_correct: false, is_gradable: true },
      ],
    });
    mocks.getComposedTestQuestions.mockResolvedValue([
      {
        question_id: 'q1',
        question_text: 'Find x',
        options: [],
        explanation_brief: 'Because.',
        solution_videos: [{ label: null, url: 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ' }],
      },
      { question_id: 'q2', question_text: 'Find y', options: [], explanation_brief: null },
    ]);

    const body = await (await POST(submit())).json();

    expect(body.result.review[0].solution_videos).toEqual([
      { label: null, url: 'https://www.youtube.com/watch?v=U1X9MmLh-ZQ' },
    ]);
    // A question with no video says so with an empty list, not a missing key.
    expect(body.result.review[1].solution_videos).toEqual([]);
  });
});

describe('GET attempts_left_after_this', () => {
  const open = (placementId: string | null) =>
    new NextRequest(
      `http://localhost/api/tests/attempt?test_id=test-1${placementId ? `&placement_id=${placementId}` : ''}`,
      { headers: { Authorization: 'Bearer t' } },
    );

  beforeEach(() => {
    mocks.getTestMeta.mockResolvedValue({
      id: 'test-1',
      title: 'Paper',
      is_active: true,
      is_published: true,
      test_type: 'untimed',
      duration_minutes: null,
    });
    mocks.startOrResumeAttempt.mockResolvedValue({
      attempt: { id: 'attempt-2', attempt_number: 2, answers: {}, started_at: '2026-09-17T10:00:00Z' },
      draw: null,
      previous_attempts: 1,
      best_percentage: 50,
      resumed: false,
    });
    mocks.getComposedTestQuestions.mockResolvedValue([]);
  });

  it('is null (unlimited) for a paper opened without a door', async () => {
    const body = await (await GET(open(null))).json();
    expect(body.attempts_left_after_this).toBeNull();
    expect(mocks.countOps).toEqual([]);
  });

  it('counts what this door has left once the sitting being opened is used', async () => {
    mocks.getPlacementById.mockResolvedValue({
      id: 'door-1',
      test_id: 'test-1',
      context_type: 'practice',
      is_active: true,
      is_visible: true,
      gating: { attempt_limit: 3 },
    });
    mocks.countResult = { count: 1, error: null };

    const body = await (await GET(open('door-1'))).json();
    expect(body.attempts_left_after_this).toBe(1);
    expect(mocks.countOps).toContainEqual(['eq', ['placement_id', 'door-1']]);
    expect(mocks.countOps).toContainEqual(['eq', ['status', 'submitted']]);
  });

  it('is 0 for a one-shot door, so no Try again is offered after it', async () => {
    mocks.getPlacementById.mockResolvedValue({
      id: 'door-1',
      test_id: 'test-1',
      context_type: 'practice',
      is_active: true,
      is_visible: true,
      gating: { attempt_limit: 1 },
    });
    const body = await (await GET(open('door-1'))).json();
    expect(body.attempts_left_after_this).toBe(0);
  });

  it('is null when the count cannot be read, which leaves Try again to find out', async () => {
    mocks.getPlacementById.mockResolvedValue({
      id: 'door-1',
      test_id: 'test-1',
      context_type: 'practice',
      is_active: true,
      is_visible: true,
      gating: { attempt_limit: 1 },
    });
    mocks.countResult = { count: null as unknown as number, error: { message: 'boom' } };
    const body = await (await GET(open('door-1'))).json();
    expect(body.attempts_left_after_this).toBeNull();
  });
});
