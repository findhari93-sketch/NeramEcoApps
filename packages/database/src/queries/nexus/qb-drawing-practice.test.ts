import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from './testing/fake-supabase';

/**
 * Practising a drawing from the bank.
 *
 * Rules worth pinning, because breaking any of them is silent:
 *
 *   1. The solution is not unlocked until the student has either uploaded an
 *      attempt or explicitly asked to see it. `unlocked` is computed once, on
 *      the server, and sent as a single boolean. A gate assembled twice is a
 *      gate that disagrees with itself.
 *   2. A student who reads the answer first, or looks at classmates' work
 *      first, is recorded on the attempt, so the teacher marking the sheet
 *      knows what they are looking at.
 *   3. The mirror is minted lazily. 27 real drawing prompts in production have
 *      no mirror because paper activation only bridges questions that are
 *      already active, and their Practice button was permanently disabled.
 *   4. An "attempt any one of two" drawing has a mirror, a thread, a reveal and
 *      an attempt PER OPTION. Sharing them would mean uploading 81A locks 81B
 *      behind "wait for your teacher", and unlocking 81B's solution would hand
 *      over 81A's too.
 */

const MIRROR = 'mirror-1';
const PART_MIRROR = 'mirror-1b';
const QB_Q = 'qb-1';
const STUDENT = 'student-1';

const createDrawingQuestionFromQB = vi.fn(async () => MIRROR);
const getLinkedDrawingQuestionId = vi.fn(async (_q: string, part?: string) =>
  (part ? PART_MIRROR : MIRROR) as string | null,
);
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

/** A reveal row as Postgres stores it: part_id and kind are NOT NULL. */
const revealRow = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  student_id: STUDENT,
  question_id: QB_Q,
  part_id: '',
  kind: 'solution',
  ...over,
});

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
  getLinkedDrawingQuestionId.mockImplementation(async (_q: string, part?: string) =>
    part ? PART_MIRROR : MIRROR,
  );
  createDrawingQuestionFromQB.mockResolvedValue(MIRROR);
});

describe('getStudentQBDrawingState: the gate', () => {
  it('stays locked for a student who has done nothing', async () => {
    const { getStudentQBDrawingState } = await import('./qb-drawing-practice');
    const state = await getStudentQBDrawingState(QB_Q, STUDENT, {}, seed().client);

    expect(state.unlocked).toBe(false);
    expect(state.peers_unlocked).toBe(false);
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
    const state = await getStudentQBDrawingState(QB_Q, STUDENT, {}, db.client);

    expect(state.unlocked).toBe(true);
    expect(state.peers_unlocked).toBe(true);
    expect(state.submission?.id).toBe('sub-1');
  });

  it('unlocks for a student who asked to see it without attempting', async () => {
    const db = seed({
      nexus_qb_drawing_reveals: [revealRow({ revealed_at: '2026-08-10T00:00:00Z' })],
    });
    const { getStudentQBDrawingState } = await import('./qb-drawing-practice');
    const state = await getStudentQBDrawingState(QB_Q, STUDENT, {}, db.client);

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
    const state = await getStudentQBDrawingState(QB_Q, STUDENT, {}, db.client);

    expect(state.unlocked).toBe(false);
  });

  it('reports no mirror without falling over', async () => {
    getLinkedDrawingQuestionId.mockResolvedValue(null);
    const { getStudentQBDrawingState } = await import('./qb-drawing-practice');
    const state = await getStudentQBDrawingState(QB_Q, STUDENT, {}, seed().client);

    expect(state.drawing_question_id).toBeNull();
    expect(state.unlocked).toBe(false);
  });

  it('opens peers without opening the solution', async () => {
    const db = seed({
      nexus_qb_drawing_reveals: [
        revealRow({ kind: 'peers', revealed_at: '2026-08-10T00:00:00Z' }),
      ],
    });
    const { getStudentQBDrawingState } = await import('./qb-drawing-practice');
    const state = await getStudentQBDrawingState(QB_Q, STUDENT, {}, db.client);

    expect(state.peers_unlocked).toBe(true);
    expect(state.peers_revealed_at).toBe('2026-08-10T00:00:00Z');
    // Looking at what classmates drew is not the same as being handed the
    // teacher's answer, and must not hand it over.
    expect(state.unlocked).toBe(false);
  });
});

describe('getStudentQBDrawingState: one option of two', () => {
  it('reads the option own mirror, not the question one', async () => {
    const db = seed({
      drawing_submissions: [
        { id: 'sub-b', student_id: STUDENT, question_id: PART_MIRROR, status: 'submitted' },
      ],
    });
    const { getStudentQBDrawingState } = await import('./qb-drawing-practice');
    const state = await getStudentQBDrawingState(QB_Q, STUDENT, { partId: 'b' }, db.client);

    expect(getLinkedDrawingQuestionId).toHaveBeenCalledWith(QB_Q, 'b', db.client);
    expect(state.submission?.id).toBe('sub-b');
  });

  it('does not unlock option A because option B was unlocked', async () => {
    const db = seed({
      nexus_qb_drawing_reveals: [
        revealRow({ part_id: 'b', revealed_at: '2026-08-10T00:00:00Z' }),
      ],
    });
    const { getStudentQBDrawingState } = await import('./qb-drawing-practice');

    const b = await getStudentQBDrawingState(QB_Q, STUDENT, { partId: 'b' }, db.client);
    const a = await getStudentQBDrawingState(QB_Q, STUDENT, { partId: 'a' }, db.client);

    expect(b.unlocked).toBe(true);
    expect(a.unlocked).toBe(false);
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

    expect(createDrawingQuestionFromQB).toHaveBeenCalledWith(QB_Q, '', expect.anything());
  });

  it('mints a mirror of its own for one option of two', async () => {
    getLinkedDrawingQuestionId.mockResolvedValue(null);
    const { submitQBDrawingAttempt } = await import('./qb-drawing-practice');

    await submitQBDrawingAttempt(
      { qbQuestionId: QB_Q, studentId: STUDENT, partId: 'b', originalImageUrl: 'https://x/a.jpg' },
      seed().client,
    );

    // Sharing 81A's mirror would put both options on one thread, and a thread
    // refuses a second upload until a teacher asks for a redo.
    expect(createDrawingQuestionFromQB).toHaveBeenCalledWith(QB_Q, 'b', expect.anything());
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
});

describe('submitQBDrawingAttempt: what the student leaned on', () => {
  it('records that the answer was open, and leaves the note alone', async () => {
    const db = seed({
      nexus_qb_drawing_reveals: [revealRow()],
      drawing_submissions: [{ id: 'sub-1' }],
    });
    const { submitQBDrawingAttempt } = await import('./qb-drawing-practice');

    const out = await submitQBDrawingAttempt(
      { qbQuestionId: QB_Q, studentId: STUDENT, originalImageUrl: 'https://x/a.jpg', selfNote: 'tried my best' },
      db.client,
    );

    expect(out.helpUsed).toEqual(['solution']);
    expect(db.tables.drawing_submissions[0].qb_help_used).toEqual(['solution']);

    // The marker used to be pushed into the student's own words as a
    // "[Solution viewed first]" prefix. A private reflection is not a place to
    // keep system state, and a student could type the prefix by hand.
    const [[arg]] = createDrawingSubmissionWithThread.mock.calls as any;
    expect(arg.self_note).toBe('tried my best');
  });

  it('records both kinds of help when both were open', async () => {
    const db = seed({
      nexus_qb_drawing_reveals: [
        revealRow({ id: 'r1', kind: 'solution' }),
        revealRow({ id: 'r2', kind: 'peers' }),
      ],
      drawing_submissions: [{ id: 'sub-1' }],
    });
    const { submitQBDrawingAttempt } = await import('./qb-drawing-practice');

    const out = await submitQBDrawingAttempt(
      { qbQuestionId: QB_Q, studentId: STUDENT, originalImageUrl: 'https://x/a.jpg' },
      db.client,
    );

    expect(out.helpUsed).toEqual(['peers', 'solution']);
  });

  it('leaves an honest attempt unmarked', async () => {
    const db = seed({ drawing_submissions: [{ id: 'sub-1' }] });
    const { submitQBDrawingAttempt } = await import('./qb-drawing-practice');

    const out = await submitQBDrawingAttempt(
      { qbQuestionId: QB_Q, studentId: STUDENT, originalImageUrl: 'https://x/a.jpg', selfNote: 'my try' },
      db.client,
    );

    expect(out.helpUsed).toEqual([]);
    expect(db.tables.drawing_submissions[0].qb_help_used).toEqual([]);
    const [[arg]] = createDrawingSubmissionWithThread.mock.calls as any;
    expect(arg.self_note).toBe('my try');
  });

  it('does not count help opened on the OTHER option', async () => {
    const db = seed({
      nexus_qb_drawing_reveals: [revealRow({ part_id: 'a' })],
      drawing_submissions: [{ id: 'sub-1' }],
    });
    const { submitQBDrawingAttempt } = await import('./qb-drawing-practice');

    const out = await submitQBDrawingAttempt(
      { qbQuestionId: QB_Q, studentId: STUDENT, partId: 'b', originalImageUrl: 'https://x/a.jpg' },
      db.client,
    );

    expect(out.helpUsed).toEqual([]);
  });
});

describe('revealQBDrawingSolution', () => {
  it('records the reveal', async () => {
    const db = seed();
    const { revealQBDrawingSolution } = await import('./qb-drawing-practice');

    await revealQBDrawingSolution(QB_Q, STUDENT, {}, db.client);

    expect(db.tables.nexus_qb_drawing_reveals).toHaveLength(1);
    expect(db.tables.nexus_qb_drawing_reveals[0].kind).toBe('solution');
    expect(db.tables.nexus_qb_drawing_reveals[0].part_id).toBe('');
  });

  it('is idempotent, so pressing it twice does not create a second row', async () => {
    const db = seed();
    const { revealQBDrawingSolution } = await import('./qb-drawing-practice');

    await revealQBDrawingSolution(QB_Q, STUDENT, {}, db.client);
    const second = await revealQBDrawingSolution(QB_Q, STUDENT, {}, db.client);

    expect(db.tables.nexus_qb_drawing_reveals).toHaveLength(1);
    expect(second.revealed_at).toBeTruthy();
  });

  it('keeps solution, peers and each option apart', async () => {
    const db = seed();
    const { revealQBDrawingSolution } = await import('./qb-drawing-practice');

    await revealQBDrawingSolution(QB_Q, STUDENT, { kind: 'solution' }, db.client);
    await revealQBDrawingSolution(QB_Q, STUDENT, { kind: 'peers' }, db.client);
    await revealQBDrawingSolution(QB_Q, STUDENT, { kind: 'solution', partId: 'b' }, db.client);

    expect(db.tables.nexus_qb_drawing_reveals).toHaveLength(3);
  });
});
