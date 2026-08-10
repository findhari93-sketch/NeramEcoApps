import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';

/**
 * Practising a drawing from the bank.
 *
 * Three rules are worth pinning, because breaking any of them is silent:
 *
 *   1. The solution is not unlocked until the student has either uploaded an
 *      attempt or explicitly asked to see it. `unlocked` is computed once, on
 *      the server, and sent as a single boolean. A gate assembled twice is a
 *      gate that disagrees with itself.
 *   2. A student who reads the answer first is flagged, so the teacher marking
 *      the sheet knows what they are looking at.
 *   3. The mirror is minted lazily. 27 real drawing prompts in production have
 *      no mirror because paper activation only bridges questions that are
 *      already active, and their Practice button was permanently disabled.
 */

const MIRROR = 'mirror-1';
const QB_Q = 'qb-1';
const STUDENT = 'student-1';

const createDrawingQuestionFromQB = vi.fn(async () => MIRROR);
const getLinkedDrawingQuestionId = vi.fn(async () => MIRROR as string | null);
const createDrawingSubmissionWithThread = vi.fn(async (data: any) => ({
  submission: { id: 'sub-1', ...data },
  attemptNumber: 1,
  isRedo: false,
}));

vi.mock('./question-bank', () => ({
  createDrawingQuestionFromQB: (...a: any[]) => (createDrawingQuestionFromQB as any)(...a),
  getLinkedDrawingQuestionId: (...a: any[]) => (getLinkedDrawingQuestionId as any)(...a),
}));
vi.mock('./drawings', () => ({
  createDrawingSubmissionWithThread: (...a: any[]) => (createDrawingSubmissionWithThread as any)(...a),
}));

function seed(over: Record<string, any[]> = {}) {
  return createFakeDb({
    nexus_qb_questions: [{ id: QB_Q, question_format: 'DRAWING_PROMPT' }],
    nexus_qb_drawing_reveals: [],
    drawing_submissions: [],
    ...over,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getLinkedDrawingQuestionId.mockResolvedValue(MIRROR);
  createDrawingQuestionFromQB.mockResolvedValue(MIRROR);
});

describe('getStudentQBDrawingState: the gate', () => {
  it('stays locked for a student who has done nothing', async () => {
    const { getStudentQBDrawingState } = await import('./qb-drawing-practice');
    const state = await getStudentQBDrawingState(QB_Q, STUDENT, seed().client);

    expect(state.unlocked).toBe(false);
    expect(state.submission).toBeNull();
    expect(state.revealed_at).toBeNull();
  });

  it('unlocks once the student has uploaded an attempt', async () => {
    const db = seed({
      drawing_submissions: [
        { id: 'sub-1', student_id: STUDENT, question_id: MIRROR, status: 'submitted', attempt_number: 1 },
      ],
    });
    const { getStudentQBDrawingState } = await import('./qb-drawing-practice');
    const state = await getStudentQBDrawingState(QB_Q, STUDENT, db.client);

    expect(state.unlocked).toBe(true);
    expect(state.submission?.id).toBe('sub-1');
  });

  it('unlocks for a student who asked to see it without attempting', async () => {
    const db = seed({
      nexus_qb_drawing_reveals: [
        { id: 'r1', student_id: STUDENT, question_id: QB_Q, revealed_at: '2026-08-10T00:00:00Z' },
      ],
    });
    const { getStudentQBDrawingState } = await import('./qb-drawing-practice');
    const state = await getStudentQBDrawingState(QB_Q, STUDENT, db.client);

    expect(state.unlocked).toBe(true);
    expect(state.revealed_at).toBe('2026-08-10T00:00:00Z');
    expect(state.submission).toBeNull();
  });

  it('does not unlock because SOMEONE ELSE attempted it', async () => {
    const db = seed({
      drawing_submissions: [
        { id: 'sub-1', student_id: 'other-student', question_id: MIRROR, status: 'submitted' },
      ],
    });
    const { getStudentQBDrawingState } = await import('./qb-drawing-practice');
    const state = await getStudentQBDrawingState(QB_Q, STUDENT, db.client);

    expect(state.unlocked).toBe(false);
  });

  it('reports no mirror without falling over', async () => {
    getLinkedDrawingQuestionId.mockResolvedValue(null);
    const { getStudentQBDrawingState } = await import('./qb-drawing-practice');
    const state = await getStudentQBDrawingState(QB_Q, STUDENT, seed().client);

    expect(state.drawing_question_id).toBeNull();
    expect(state.unlocked).toBe(false);
  });
});

describe('submitQBDrawingAttempt', () => {
  it('refuses a question that is not a drawing', async () => {
    const db = seed({ nexus_qb_questions: [{ id: QB_Q, question_format: 'MCQ' }] });
    const { submitQBDrawingAttempt } = await import('./qb-drawing-practice');

    await expect(
      submitQBDrawingAttempt(
        { qbQuestionId: QB_Q, studentId: STUDENT, originalImageUrl: 'https://x/a.jpg' },
        db.client,
      ),
    ).rejects.toThrow('This question is not a drawing.');
  });

  it('mints the mirror on the first attempt when none exists', async () => {
    getLinkedDrawingQuestionId.mockResolvedValue(null);
    const { submitQBDrawingAttempt } = await import('./qb-drawing-practice');

    await submitQBDrawingAttempt(
      { qbQuestionId: QB_Q, studentId: STUDENT, originalImageUrl: 'https://x/a.jpg' },
      seed().client,
    );

    expect(createDrawingQuestionFromQB).toHaveBeenCalledWith(QB_Q, expect.anything());
  });

  it('does not mint a second mirror when one already exists', async () => {
    const { submitQBDrawingAttempt } = await import('./qb-drawing-practice');
    await submitQBDrawingAttempt(
      { qbQuestionId: QB_Q, studentId: STUDENT, originalImageUrl: 'https://x/a.jpg' },
      seed().client,
    );

    expect(createDrawingQuestionFromQB).not.toHaveBeenCalled();
  });

  it('files the submission against the practice module as question_bank work', async () => {
    const { submitQBDrawingAttempt } = await import('./qb-drawing-practice');
    await submitQBDrawingAttempt(
      { qbQuestionId: QB_Q, studentId: STUDENT, originalImageUrl: 'https://x/a.jpg' },
      seed().client,
    );

    expect(createDrawingSubmissionWithThread).toHaveBeenCalledWith(
      expect.objectContaining({
        student_id: STUDENT,
        question_id: MIRROR,
        source_type: 'question_bank',
        original_image_url: 'https://x/a.jpg',
      }),
      expect.anything(),
    );
  });

  it('flags an attempt made after the student read the answer', async () => {
    const db = seed({
      nexus_qb_drawing_reveals: [{ id: 'r1', student_id: STUDENT, question_id: QB_Q }],
    });
    const { submitQBDrawingAttempt, SOLUTION_FIRST_PREFIX } = await import('./qb-drawing-practice');

    await submitQBDrawingAttempt(
      { qbQuestionId: QB_Q, studentId: STUDENT, originalImageUrl: 'https://x/a.jpg', selfNote: 'tried my best' },
      db.client,
    );

    const [[arg]] = createDrawingSubmissionWithThread.mock.calls as any;
    expect(arg.self_note).toBe(`${SOLUTION_FIRST_PREFIX} tried my best`);
  });

  it('flags it even when the student left no note of their own', async () => {
    const db = seed({
      nexus_qb_drawing_reveals: [{ id: 'r1', student_id: STUDENT, question_id: QB_Q }],
    });
    const { submitQBDrawingAttempt, SOLUTION_FIRST_PREFIX } = await import('./qb-drawing-practice');

    await submitQBDrawingAttempt(
      { qbQuestionId: QB_Q, studentId: STUDENT, originalImageUrl: 'https://x/a.jpg' },
      db.client,
    );

    const [[arg]] = createDrawingSubmissionWithThread.mock.calls as any;
    expect(arg.self_note).toBe(SOLUTION_FIRST_PREFIX);
  });

  it('leaves an honest attempt unflagged', async () => {
    const { submitQBDrawingAttempt } = await import('./qb-drawing-practice');
    await submitQBDrawingAttempt(
      { qbQuestionId: QB_Q, studentId: STUDENT, originalImageUrl: 'https://x/a.jpg', selfNote: 'my try' },
      seed().client,
    );

    const [[arg]] = createDrawingSubmissionWithThread.mock.calls as any;
    expect(arg.self_note).toBe('my try');
  });
});

describe('revealQBDrawingSolution', () => {
  it('records the reveal', async () => {
    const db = seed();
    const { revealQBDrawingSolution } = await import('./qb-drawing-practice');

    await revealQBDrawingSolution(QB_Q, STUDENT, db.client);

    expect(db.tables.nexus_qb_drawing_reveals).toHaveLength(1);
  });

  it('is idempotent, so pressing it twice does not create a second row', async () => {
    const db = seed();
    const { revealQBDrawingSolution } = await import('./qb-drawing-practice');

    await revealQBDrawingSolution(QB_Q, STUDENT, db.client);
    const second = await revealQBDrawingSolution(QB_Q, STUDENT, db.client);

    expect(db.tables.nexus_qb_drawing_reveals).toHaveLength(1);
    expect(second.revealed_at).toBeTruthy();
  });
});
