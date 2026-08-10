/**
 * The second stage of an exam score: the drawings a human has to mark.
 *
 * A JEE Paper 2 drawing section is 100 of its 200 marks and no machine can mark
 * it, so an exam produces a PROVISIONAL score the moment it is submitted (the
 * objective sections only) and a FINAL one once a teacher has been through the
 * drawings.
 *
 * Nothing here is a new queue or a new marks scale. drawing_submissions already
 * carries tutor_marks, tutor_feedback and a review status, and the teacher
 * review screen already works. An exam drawing is one more source_type on it.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../../client';
import { finaliseExamScore } from './exam-score';
import { getComposedTestQuestions } from './test-repository';

const SUBMISSIONS = 'drawing_submissions' as any;
const ATTEMPTS = 'nexus_test_attempts' as any;

/** Formats a human has to mark. Mirrors GRADABLE_FORMATS in question-bank.ts, inverted. */
const HUMAN_MARKED = new Set(['DRAWING_PROMPT', 'IMAGE_BASED']);

/**
 * The full vocabulary of drawing_submissions_status_check, copied from the live
 * constraint. Anything outside this set makes the insert throw at the database,
 * and every caller of queueExamDrawings swallows that throw so the student is
 * not shown an error for a review row. The set is exported so a test can assert
 * membership rather than trusting a string literal.
 */
export const DRAWING_SUBMISSION_STATUSES = [
  'submitted',
  'under_review',
  'redo',
  'completed',
  'reviewed',
] as const;

/** The status a freshly queued, unlooked-at drawing carries. */
export const QUEUED_STATUS: (typeof DRAWING_SUBMISSION_STATUSES)[number] = 'submitted';

function looksLikeUpload(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/**
 * Put every drawing on a submitted exam paper into the review queue.
 *
 * Idempotent through uq_ds_exam_attempt_question, so a retried side effect or a
 * double submit cannot show a teacher the same drawing twice.
 *
 * A drawing question the student left blank is skipped entirely rather than
 * queued as an empty submission: there is nothing for a teacher to look at, and
 * finaliseExamScore already leaves an unmarked drawing out of both the
 * numerator and the denominator.
 */
export async function queueExamDrawings(
  input: {
    attemptId: string;
    studentId: string;
    placement: { context_id: string } | null;
  },
  client?: TypedSupabaseClient,
): Promise<{ queued: number }> {
  const supabase = client || getSupabaseAdminClient();

  const { data: attempt } = await supabase
    .from(ATTEMPTS)
    .select('id, test_id, answers')
    .eq('id', input.attemptId)
    .maybeSingle();
  if (!attempt) return { queued: 0 };

  const questions = await getComposedTestQuestions((attempt as any).test_id, false, supabase);
  const answers = ((attempt as any).answers || {}) as Record<string, string>;

  const rows: any[] = [];
  for (const q of questions) {
    if (!HUMAN_MARKED.has(String(q.question_format).toUpperCase())) continue;
    const answer = answers[q.question_id];
    if (!looksLikeUpload(answer)) continue;

    rows.push({
      student_id: input.studentId,
      // These are bank questions, not drawing_questions rows, so question_id is
      // null and the helper's no-thread branch applies, exactly as assignment
      // drawings already do.
      question_id: null,
      source_type: 'exam',
      original_image_url: answer.trim(),
      exam_attempt_id: input.attemptId,
      exam_qb_question_id: q.question_id,
      // 'submitted', not 'pending'. drawing_submissions_status_check allows only
      // submitted | under_review | redo | completed | reviewed, so 'pending' made
      // every insert here throw, and the caller swallows the throw. That is why
      // no exam drawing ever reached a teacher. See QUEUED_STATUS below.
      status: QUEUED_STATUS,
    });
  }

  if (rows.length === 0) return { queued: 0 };

  const { error } = await supabase
    .from(SUBMISSIONS)
    .upsert(rows, { onConflict: 'exam_attempt_id,exam_qb_question_id', ignoreDuplicates: true });
  if (error) throw error;

  return { queued: rows.length };
}

export interface ExamDrawingRow {
  submission_id: string;
  student_id: string;
  question_id: string;
  image_url: string;
  awarded: number | null;
  max_marks: number;
  status: string | null;
}

/** Every drawing on one exam, with whatever a teacher has awarded so far. */
export async function listExamDrawings(
  examId: string,
  client?: TypedSupabaseClient,
): Promise<ExamDrawingRow[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data: exam } = await supabase
    .from('nexus_exams' as any)
    .select('test_id')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) return [];

  const { data: attempts } = await supabase
    .from(ATTEMPTS)
    .select('id')
    .eq('test_id', (exam as any).test_id)
    .eq('mode', 'official');
  const attemptIds = (attempts || []).map((a: any) => a.id);
  if (attemptIds.length === 0) return [];

  const [subsRes, marksRes] = await Promise.all([
    supabase
      .from(SUBMISSIONS)
      .select('id, student_id, exam_qb_question_id, original_image_url, tutor_marks, status')
      .in('exam_attempt_id', attemptIds),
    supabase
      .from('nexus_test_questions' as any)
      .select('qb_question_id, marks')
      .eq('test_id', (exam as any).test_id),
  ]);

  const maxByQuestion = new Map<string, number>(
    (marksRes.data || []).map((r: any) => [r.qb_question_id, Number(r.marks) || 0]),
  );

  return (subsRes.data || []).map((s: any) => ({
    submission_id: s.id,
    student_id: s.student_id,
    question_id: s.exam_qb_question_id,
    image_url: s.original_image_url,
    awarded: s.tutor_marks == null ? null : Number(s.tutor_marks),
    max_marks: maxByQuestion.get(s.exam_qb_question_id) ?? 0,
    status: s.status ?? null,
  }));
}

/**
 * Recompute one attempt's final score from its marked drawings.
 *
 * Writes the final_* columns and NEVER touches score/percentage. Those are read
 * by getTestResults, getStudentTestStats, listStudentAttempts and the
 * leaderboard, so overwriting them would make a half-marked exam
 * indistinguishable from a real score in all of them at once.
 *
 * finalised_at is only stamped when every drawing has a mark. Until then the
 * attempt stays provisional and effectiveAttemptScore keeps reporting the
 * objective columns, which is the honest answer.
 *
 * Cheap and idempotent, so it is safe to call after every review save and again
 * in the publish preflight.
 */
export async function recomputeExamAttemptScore(
  attemptId: string,
  client?: TypedSupabaseClient,
): Promise<{ finalised: boolean; ungraded: number } | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data: attempt } = await supabase
    .from(ATTEMPTS)
    .select('id, test_id, score, total_marks, status')
    .eq('id', attemptId)
    .maybeSingle();
  if (!attempt || (attempt as any).status !== 'submitted') return null;

  const { data: subs } = await supabase
    .from(SUBMISSIONS)
    .select('exam_qb_question_id, tutor_marks')
    .eq('exam_attempt_id', attemptId);

  if (!subs || subs.length === 0) return null;

  const { data: testQuestions } = await supabase
    .from('nexus_test_questions' as any)
    .select('qb_question_id, marks')
    .eq('test_id', (attempt as any).test_id);
  const maxByQuestion = new Map<string, number>(
    (testQuestions || []).map((r: any) => [r.qb_question_id, Number(r.marks) || 0]),
  );

  const result = finaliseExamScore({
    objective: {
      score: Number((attempt as any).score) || 0,
      total_marks: Number((attempt as any).total_marks) || 0,
    },
    drawings: (subs as any[]).map((s) => ({
      question_id: s.exam_qb_question_id,
      max_marks: maxByQuestion.get(s.exam_qb_question_id) ?? 0,
      awarded: s.tutor_marks == null ? null : Number(s.tutor_marks),
    })),
  });

  const finalised = result.ungraded === 0;

  const { error } = await supabase
    .from(ATTEMPTS)
    .update({
      final_score: result.score,
      final_total_marks: result.total_marks,
      final_percentage: result.percentage,
      // Cleared again if a teacher un-marks one, so the state can go backwards
      // as honestly as it goes forwards.
      finalised_at: finalised ? new Date().toISOString() : null,
    })
    .eq('id', attemptId);
  if (error) throw error;

  return { finalised, ungraded: result.ungraded };
}

/**
 * Recompute every attempt on an exam.
 *
 * Used by the publish preflight, so a teacher who marked the last drawing in
 * another tab still gets final rather than provisional results.
 */
export async function recomputeExamScores(
  examId: string,
  client?: TypedSupabaseClient,
): Promise<{ finalised: number; pending: number }> {
  const supabase = client || getSupabaseAdminClient();

  const { data: exam } = await supabase
    .from('nexus_exams' as any)
    .select('test_id')
    .eq('id', examId)
    .maybeSingle();
  if (!exam) return { finalised: 0, pending: 0 };

  const { data: attempts } = await supabase
    .from(ATTEMPTS)
    .select('id')
    .eq('test_id', (exam as any).test_id)
    .eq('mode', 'official')
    .eq('status', 'submitted');

  let finalised = 0;
  let pending = 0;
  for (const a of (attempts || []) as any[]) {
    const out = await recomputeExamAttemptScore(a.id, supabase);
    if (!out) continue;
    if (out.finalised) finalised += 1;
    else pending += 1;
  }
  return { finalised, pending };
}
