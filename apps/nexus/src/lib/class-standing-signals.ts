/**
 * Turn the loaded per-student data into ClassStandingSignals.
 *
 * Split deliberately into a PURE builder and one tiny impure loader:
 *
 *   buildClassStandingSignals  pure, unit-testable, no Supabase. Both the staff
 *                              performance route and the parent overview route
 *                              call it with data they already fetched, so
 *                              neither pays for the other's queries and the two
 *                              can never compute a different number.
 *   loadExcusedClassIds        one query, for the one fact the attendance views
 *                              do not carry.
 *
 * If a third surface ever needs Class Standing, it calls the same builder. The
 * moment two surfaces derive their own signals, a parent and a teacher start
 * seeing different numbers for the same child, which is the exact failure the
 * parent-* modules were written to prevent.
 */

import { getSupabaseAdminClient } from '@neram/database';
import type { AssignmentEngagementRow } from '@neram/database';
import type { AttendanceSummary, ClassAttendanceView } from './parent-attendance';
import type { ParentCatchupRollup } from './parent-catchup';
import type { ParentTestWithClass } from './parent-tests';
import type { ClassStandingSignals } from './class-standing';

/**
 * A test set fewer than this many days ago is not counted yet.
 *
 * Without it, publishing a test on a Monday drops the standing of every student
 * in the class until they get round to sitting it.
 */
export const TEST_GRACE_DAYS = 3;

/**
 * Class ids where a teacher explicitly excused this student's absence.
 *
 * `excused_at` is a deliberate staff action and it is not carried on
 * ClassAttendanceView, so it needs its own read. An excused absence leaves the
 * attendance denominator entirely: a member of staff made a judgement and the
 * score must respect it rather than quietly overrule it.
 */
export async function loadExcusedClassIds(
  studentId: string,
  classIds: string[],
): Promise<Set<string>> {
  if (!classIds.length) return new Set();

  const supabase = getSupabaseAdminClient();

  // nexus_class_absences is absent from database.generated.ts. Documented
  // `as any` pattern, same as lib/parent-catchup.ts and lib/parent-data.ts.
  const { data, error } = await (supabase.from('nexus_class_absences' as any) as any)
    .select('scheduled_class_id, excused_at')
    .eq('student_id', studentId)
    .in('scheduled_class_id', classIds)
    .not('excused_at', 'is', null);

  if (error) {
    // Fail towards counting the absence. Silently treating an unknown as
    // excused would inflate the score, which is the more damaging mistake.
    console.error('[class-standing] excused read failed:', error);
    return new Set();
  }

  return new Set(
    ((data || []) as Array<{ scheduled_class_id: string }>).map((r) => r.scheduled_class_id),
  );
}

export interface StandingSignalInput {
  enrolledAt: string | null;
  /** YYYY-MM-DD. Injected so the whole chain stays deterministic. */
  today: string;
  windowDays: number;
  views: ClassAttendanceView[];
  summary: AttendanceSummary;
  excusedClassIds: Set<string>;
  /** This student's row from getAssignmentEngagement, or null. */
  engagement: AssignmentEngagementRow | null;
  tests: ParentTestWithClass[];
  catchup: ParentCatchupRollup | null;
}

/** PURE. Every null below means "not measured", never "scored nothing". */
export function buildClassStandingSignals(input: StandingSignalInput): ClassStandingSignals {
  const measured = input.views.filter((v) => v.measurement === 'measured');

  const excused = measured.filter((v) => input.excusedClassIds.has(v.classId)).length;

  // Someone gave a reason but no teacher signed it off. Half credit, handled by
  // the scorer, so a family explaining an absence is acknowledged without
  // making absence free.
  const selfExplained = measured.filter(
    (v) =>
      v.attended === false &&
      !input.excusedClassIds.has(v.classId) &&
      v.reasonCode !== null &&
      v.reasonSource !== 'teacher',
  ).length;

  const attendedViews = measured.filter((v) => v.attended === true);
  const cleanClasses = attendedViews.filter(
    (v) => !v.late && !v.leftEarly && !v.droppedMidClass,
  ).length;

  // Only tests that have had time to be sat.
  const cutoff = Date.parse(`${input.today}T00:00:00Z`) - TEST_GRACE_DAYS * 86_400_000;
  const ripe = input.tests.filter((t) => {
    if (!t.classDate) return true; // no date to defer against, so judge it now
    const at = Date.parse(t.classDate);
    return Number.isNaN(at) ? true : at <= cutoff;
  });
  const attemptedRipe = ripe.filter((t) => t.attempts > 0);
  const scored = attemptedRipe
    .map((t) => t.bestPct)
    .filter((p): p is number => typeof p === 'number');

  return {
    enrolledAt: input.enrolledAt,
    today: input.today,
    windowDays: input.windowDays,

    attendance:
      input.summary.measuredClasses > 0
        ? {
            measuredClasses: input.summary.measuredClasses,
            attended: input.summary.attended,
            excusedByTeacher: excused,
            selfExplained,
          }
        : null,

    assignments:
      input.engagement && input.engagement.applicable > 0
        ? {
            applicable: input.engagement.applicable,
            submitted: input.engagement.submitted,
            onTime: input.engagement.on_time,
            avgMarksPct: input.engagement.avg_marks_pct,
          }
        : null,

    tests:
      ripe.length > 0
        ? {
            total: ripe.length,
            attempted: attemptedRipe.length,
            // An average of no scores is not zero.
            averageBestPct: scored.length
              ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length)
              : null,
          }
        : null,

    catchup: input.catchup
      ? {
          total: input.catchup.total,
          done: input.catchup.done,
          excused: input.catchup.excused,
        }
      : null,

    punctuality:
      attendedViews.length > 0
        ? { attendedClasses: attendedViews.length, cleanClasses }
        : null,
  };
}
