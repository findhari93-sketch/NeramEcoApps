/**
 * Fetch the rows the exam countdown resolves from. Nothing else.
 *
 * Every decision lives in the pure module next door, so the resolution ladder is
 * unit-testable with plain objects and no Supabase mock. This file only knows how
 * to ask the database.
 *
 * All three consumers are already classroom-scoped: both dashboards take
 * ?classroom=, and the parent route gets the id from resolveChildContext. So one
 * query shape serves student, teacher and parent, and listActivePlansForStudent
 * does not need to change.
 *
 * Cost: 1 query for a teacher, 2 for a student or parent, both foldable into the
 * caller's existing Promise.all. No new route, no extra function invocation.
 */

import { pickCountdownTarget, type ExamCountdownTarget } from './exam-countdown';

/**
 * The plan -> exam date embed. Named on the FK added by
 * 20260804090000_exam_target_and_date_confidence.sql, because an unnamed embed is
 * ambiguous once a table has more than one FK to the same target.
 *
 * If this 400s with "could not find a relationship", the migration's
 * NOTIFY pgrst, 'reload schema' has not run against that database yet.
 */
const PLAN_SELECT = `
  id, title, exam_type, status, start_date, expected_end_date, exam_date,
  target_exam_date_id, created_at,
  target:nexus_exam_dates!nexus_teaching_plans_target_exam_date_id_fkey(
    id, exam_type, year, phase, exam_date, label, is_active, date_confidence, date_note
  )
`;

/**
 * Resolve the exam countdown target for one classroom.
 *
 * @param studentId the student whose personal exam slot may override the cohort
 *   date: the student themselves, or the child a parent is viewing. Pass null for
 *   teachers, who see the cohort date only.
 */
export async function resolveExamCountdown(
  supabase: unknown,
  opts: { classroomId: string; studentId: string | null },
): Promise<ExamCountdownTarget | null> {
  // nexus_teaching_plans is absent from database.generated.ts, which is why the
  // house idiom for these tables is an untyped client.
  const db = supabase as any;

  try {
    const [plansResult, attemptsResult] = await Promise.all([
      db
        .from('nexus_teaching_plans')
        .select(PLAN_SELECT)
        .eq('classroom_id', opts.classroomId)
        .eq('status', 'active'),

      opts.studentId
        ? db
            .from('nexus_student_exam_attempts')
            .select('student_id, exam_type, phase, exam_date, exam_date_id, deleted_at')
            .eq('student_id', opts.studentId)
            .is('deleted_at', null)
            .not('exam_date', 'is', null)
        : Promise.resolve({ data: [] }),
    ]);

    return pickCountdownTarget(
      { plans: plansResult?.data || [], attempts: attemptsResult?.data || [] },
      { viewerStudentId: opts.studentId },
    );
  } catch (err) {
    // A countdown is decoration. It must never take a dashboard down with it, so
    // this degrades to "no target", which every surface already renders honestly.
    console.error('Exam countdown resolve failed:', err);
    return null;
  }
}
