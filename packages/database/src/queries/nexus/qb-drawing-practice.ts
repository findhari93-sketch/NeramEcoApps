/**
 * Practising a drawing question straight from the Question Bank.
 *
 * WHERE THE EVALUATION LIVES
 *
 * Not here. drawing_submissions is the one evaluation table in the app, and
 * /teacher/drawing-reviews is the one review screen. A Question Bank drawing is
 * one more source_type on it, exactly as an exam drawing is. There is no second
 * queue, no second marks scale, and no drawing-specific review UI inside the
 * bank.
 *
 * WHY A drawing_questions MIRROR RATHER THAN A DIRECT LINK
 *
 * Exams point straight at the bank question through
 * drawing_submissions.exam_qb_question_id, because minting a practice-bank row
 * per exam prompt would fill the practice bank with copies of exam questions.
 * Practice is the opposite case and takes the mirror, because redo threads are
 * the point of practice and drawing_thread_status.question_id is a NOT NULL FK
 * to drawing_questions. Without a mirror there is no thread, and without a
 * thread there is no "your teacher asked you to try again".
 *
 * The mirror is minted lazily, on the student's first attempt. Paper activation
 * also mints them, but only for questions that are already is_active, which is
 * how 27 real drawing prompts ended up with no mirror and a permanently
 * disabled Practice button.
 *
 * ONE MIRROR PER OPTION
 *
 * A JEE drawing question is printed as a choice: Q81 is "draw a frame of cubes
 * and cones" OR "rotate the graphic below", two unrelated tasks that share a
 * number only because the exam lets you pick one. In practice a student wants
 * to draw both. They cannot share a mirror: a thread refuses a second upload
 * until a teacher asks for a redo, so uploading 81A would lock 81B behind
 * "wait for your teacher". Each option therefore gets its own mirror, keyed by
 * `partId`, and with it its own thread, attempt numbering and redo cycle. The
 * empty string is the whole question, which is every question but two.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { createDrawingQuestionFromQB, getLinkedDrawingQuestionId } from './question-bank';
import { createDrawingSubmissionWithThread } from './drawings';

/** What a student had in front of them while they drew. */
export type QBDrawingHelp = 'solution' | 'peers';

/** Which option of an "attempt any one of N" drawing is being practised. */
export interface QBDrawingScope {
  /** A part key from drawing_parts. The empty string, the default, is the whole question. */
  partId?: string;
}

export interface QBDrawingState {
  /** The practice-module mirror for this option, if one exists yet. */
  drawing_question_id: string | null;
  /** The student's latest submission on this option, if any. */
  submission: {
    id: string;
    status: string | null;
    attempt_number: number | null;
    submitted_at: string | null;
    original_image_url: string | null;
    reviewed_image_url: string | null;
    corrected_image_url: string | null;
    tutor_rating: number | null;
    tutor_marks: number | null;
    tutor_feedback: string | null;
  } | null;
  /** When the student unlocked the solution without attempting first. */
  revealed_at: string | null;
  /** When the student opened other students' work without attempting first. */
  peers_revealed_at: string | null;
  /**
   * Whether the solution and focus points may be shown.
   *
   * Computed on the SERVER and sent as one boolean. The client must not
   * re-derive it from the pieces: a gate assembled twice is a gate that
   * disagrees with itself, and the half that leaks is the one that ships.
   */
  unlocked: boolean;
  /** Whether other students' attempts at this question may be shown. Same rule. */
  peers_unlocked: boolean;
}

/** What a student is allowed to see, and what they have already done. */
export async function getStudentQBDrawingState(
  qbQuestionId: string,
  studentId: string,
  scope: QBDrawingScope = {},
  client?: TypedSupabaseClient,
): Promise<QBDrawingState> {
  const supabase: any = client || getSupabaseAdminClient();
  const partId = scope.partId || '';

  const mirrorId = await getLinkedDrawingQuestionId(qbQuestionId, partId, client);

  let submission: QBDrawingState['submission'] = null;
  if (mirrorId) {
    const { data } = await supabase
      .from('drawing_submissions')
      .select(
        'id, status, attempt_number, submitted_at, original_image_url, reviewed_image_url, corrected_image_url, tutor_rating, tutor_marks, tutor_feedback',
      )
      .eq('student_id', studentId)
      .eq('question_id', mirrorId)
      .order('attempt_number', { ascending: false })
      .limit(1);
    submission = (data || [])[0] ?? null;
  }

  // Both kinds in one read. Two round trips for two booleans is two round
  // trips too many on a route a student hits on every question they open.
  const { data: reveals } = await supabase
    .from('nexus_qb_drawing_reveals')
    .select('kind, revealed_at')
    .eq('student_id', studentId)
    .eq('question_id', qbQuestionId)
    .eq('part_id', partId);

  const rows: Array<{ kind?: string | null; revealed_at?: string | null }> = reveals || [];
  const at = (kind: QBDrawingHelp) =>
    rows.find((r) => (r.kind || 'solution') === kind)?.revealed_at ?? null;

  const revealedAt = at('solution');
  const peersRevealedAt = at('peers');

  return {
    drawing_question_id: mirrorId,
    submission,
    revealed_at: revealedAt,
    peers_revealed_at: peersRevealedAt,
    unlocked: submission !== null || revealedAt !== null,
    peers_unlocked: submission !== null || peersRevealedAt !== null,
  };
}

/**
 * Record that a student chose to see help before drawing it themselves.
 *
 * Two kinds of help, one table. 'solution' is the teacher's model answer;
 * 'peers' is what classmates drew for the same question. Neither is refused,
 * because learning from a worked example and learning from a classmate are
 * both real ways to learn drawing. Both are recorded, because the teacher
 * marking the sheet has to be able to tell which of the three it was.
 */
export async function revealQBDrawingSolution(
  qbQuestionId: string,
  studentId: string,
  scope: QBDrawingScope & { kind?: QBDrawingHelp } = {},
  client?: TypedSupabaseClient,
): Promise<{ revealed_at: string }> {
  const supabase: any = client || getSupabaseAdminClient();
  const partId = scope.partId || '';
  const kind: QBDrawingHelp = scope.kind || 'solution';

  const { data, error } = await supabase
    .from('nexus_qb_drawing_reveals')
    .upsert(
      { student_id: studentId, question_id: qbQuestionId, part_id: partId, kind },
      { onConflict: 'student_id,question_id,part_id,kind', ignoreDuplicates: true },
    )
    .select('revealed_at');
  if (error) throw error;

  // ignoreDuplicates returns nothing on a repeat press, which is not an error:
  // the student already had it open. Read the existing row back.
  if (data && data[0]?.revealed_at) return { revealed_at: data[0].revealed_at };

  const { data: existing } = await supabase
    .from('nexus_qb_drawing_reveals')
    .select('revealed_at')
    .eq('student_id', studentId)
    .eq('question_id', qbQuestionId)
    .eq('part_id', partId)
    .eq('kind', kind)
    .maybeSingle();

  return { revealed_at: existing?.revealed_at ?? new Date().toISOString() };
}

/**
 * Take a student's drawing for a bank question into the review queue.
 *
 * Throws when the question is not a drawing, and when the thread is open but
 * not in redo (the helper's own rule: one attempt at a time until a teacher
 * asks for another).
 */
export async function submitQBDrawingAttempt(
  input: {
    qbQuestionId: string;
    studentId: string;
    /** Which option of an "any one of N" drawing. '' is the whole question. */
    partId?: string;
    originalImageUrl: string;
    selfNote?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<{ submissionId: string; attemptNumber: number; isRedo: boolean; helpUsed: QBDrawingHelp[] }> {
  const supabase: any = client || getSupabaseAdminClient();
  const partId = input.partId || '';

  const { data: question, error } = await supabase
    .from('nexus_qb_questions')
    .select('id, question_format')
    .eq('id', input.qbQuestionId)
    .single();
  if (error) throw error;
  if (String(question.question_format || '').toUpperCase() !== 'DRAWING_PROMPT') {
    throw new Error('This question is not a drawing.');
  }

  let mirrorId = await getLinkedDrawingQuestionId(input.qbQuestionId, partId, client);
  if (!mirrorId) {
    mirrorId = await createDrawingQuestionFromQB(input.qbQuestionId, partId, client);
  }
  if (!mirrorId) {
    throw new Error(
      'This drawing question is not set up for practice yet. Ask a teacher to activate its paper.',
    );
  }

  /**
   * What the student had open when they drew this.
   *
   * Read now and written onto the row, rather than joined at read time. A
   * student who opens the solution AFTER submitting has not copied anything,
   * and deriving this later would say they had. It used to be pushed into the
   * student's own self_note as a "[Solution viewed first]" prefix, which put
   * system text inside a private reflection and could be typed by hand.
   */
  const { data: reveals } = await supabase
    .from('nexus_qb_drawing_reveals')
    .select('kind')
    .eq('student_id', input.studentId)
    .eq('question_id', input.qbQuestionId)
    .eq('part_id', partId);

  const helpUsed = Array.from(
    new Set<QBDrawingHelp>(
      ((reveals || []) as Array<{ kind?: string | null }>).map(
        (r) => (r.kind || 'solution') as QBDrawingHelp,
      ),
    ),
  ).sort();

  const { submission, attemptNumber, isRedo } = await createDrawingSubmissionWithThread(
    {
      student_id: input.studentId,
      question_id: mirrorId,
      assignment_id: null,
      source_type: 'question_bank',
      original_image_url: input.originalImageUrl,
      self_note: (input.selfNote || '').trim() || null,
    },
    client,
  );

  // Written after the insert so the shared thread helper keeps its signature
  // and nothing else that calls it has to learn a bank-only column.
  const { error: stampError } = await supabase
    .from('drawing_submissions')
    .update({ qb_help_used: helpUsed })
    .eq('id', submission.id);
  if (stampError) {
    // The drawing is safe in the queue; only the provenance chip is missing.
    // Losing that is much better than losing the sheet.
    console.error('[QB drawing attempt] could not stamp help used:', stampError.message);
  }

  return { submissionId: submission.id, attemptNumber, isRedo, helpUsed };
}
