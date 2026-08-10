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
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { createDrawingQuestionFromQB, getLinkedDrawingQuestionId } from './question-bank';
import { createDrawingSubmissionWithThread } from './drawings';

/**
 * Prefix stamped on a student's note when they saw the solution before drawing.
 *
 * It lives in the note because there is nowhere else a teacher already looks.
 * Exported so the review UI can strip it for display and render a chip instead
 * of showing the raw marker.
 */
export const SOLUTION_FIRST_PREFIX = '[Solution viewed first]';

export interface QBDrawingState {
  /** The practice-module mirror, if one exists yet. */
  drawing_question_id: string | null;
  /** The student's latest submission on this question, if any. */
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
  /**
   * Whether the solution and focus points may be shown.
   *
   * Computed on the SERVER and sent as one boolean. The client must not
   * re-derive it from the pieces: a gate assembled twice is a gate that
   * disagrees with itself, and the half that leaks is the one that ships.
   */
  unlocked: boolean;
}

/** What a student is allowed to see, and what they have already done. */
export async function getStudentQBDrawingState(
  qbQuestionId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<QBDrawingState> {
  const supabase: any = client || getSupabaseAdminClient();

  const mirrorId = await getLinkedDrawingQuestionId(qbQuestionId, client);

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

  const { data: reveal } = await supabase
    .from('nexus_qb_drawing_reveals')
    .select('revealed_at')
    .eq('student_id', studentId)
    .eq('question_id', qbQuestionId)
    .maybeSingle();

  const revealedAt = reveal?.revealed_at ?? null;

  return {
    drawing_question_id: mirrorId,
    submission,
    revealed_at: revealedAt,
    unlocked: submission !== null || revealedAt !== null,
  };
}

/** Record that a student chose to see the answer before drawing it. */
export async function revealQBDrawingSolution(
  qbQuestionId: string,
  studentId: string,
  client?: TypedSupabaseClient,
): Promise<{ revealed_at: string }> {
  const supabase: any = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('nexus_qb_drawing_reveals')
    .upsert(
      { student_id: studentId, question_id: qbQuestionId },
      { onConflict: 'student_id,question_id', ignoreDuplicates: true },
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
    originalImageUrl: string;
    selfNote?: string | null;
  },
  client?: TypedSupabaseClient,
): Promise<{ submissionId: string; attemptNumber: number; isRedo: boolean }> {
  const supabase: any = client || getSupabaseAdminClient();

  const { data: question, error } = await supabase
    .from('nexus_qb_questions')
    .select('id, question_format')
    .eq('id', input.qbQuestionId)
    .single();
  if (error) throw error;
  if (String(question.question_format || '').toUpperCase() !== 'DRAWING_PROMPT') {
    throw new Error('This question is not a drawing.');
  }

  let mirrorId = await getLinkedDrawingQuestionId(input.qbQuestionId, client);
  if (!mirrorId) {
    mirrorId = await createDrawingQuestionFromQB(input.qbQuestionId, client);
  }
  if (!mirrorId) {
    throw new Error(
      'This drawing question is not set up for practice yet. Ask a teacher to activate its paper.',
    );
  }

  // A note left by a student who read the answer first carries the marker, so
  // the teacher marking it knows what they are looking at.
  const { data: reveal } = await supabase
    .from('nexus_qb_drawing_reveals')
    .select('id')
    .eq('student_id', input.studentId)
    .eq('question_id', input.qbQuestionId)
    .maybeSingle();

  const note = (input.selfNote || '').trim();
  const selfNote = reveal ? `${SOLUTION_FIRST_PREFIX} ${note}`.trim() : note || null;

  const { submission, attemptNumber, isRedo } = await createDrawingSubmissionWithThread(
    {
      student_id: input.studentId,
      question_id: mirrorId,
      assignment_id: null,
      source_type: 'question_bank',
      original_image_url: input.originalImageUrl,
      self_note: selfNote,
    },
    client,
  );

  return { submissionId: submission.id, attemptNumber, isRedo };
}
