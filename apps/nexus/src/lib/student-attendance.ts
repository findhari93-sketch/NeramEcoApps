/**
 * A student's own attendance, loaded the one way.
 *
 * Two surfaces read it: the Attendance page and the dashboard's headline card.
 * They must never disagree, because they are one tap apart and the second one
 * is what a student checks before deciding whether the first is worth opening.
 * So the window, the scoping and the summary all live here rather than being
 * written out twice.
 *
 * Everything underneath is loadChildAttendance, the same loader the parent
 * portal and the staff student profile use, for the reasons its own header
 * explains: classroom AND batch scoping, and classes nobody synced excluded
 * from every count instead of being read as absences.
 */

import { loadChildAttendance, istDaysAgo, istToday } from '@/lib/parent-data';
import { summarise, describeAttendance } from '@/lib/parent-attendance';
import type { AttendanceSummary, ClassAttendanceView } from '@/lib/parent-attendance';

/** Cap on how far back a window may reach, matching the staff performance route. */
export const MAX_WINDOW_DAYS = 730;

export interface StudentEnrollmentScope {
  classroom_id: string;
  batch_id: string | null;
  /** ISO timestamp or 'YYYY-MM-DD'. */
  enrolled_at?: string | null;
}

/**
 * The first date to count from.
 *
 * "So far" means since they joined, which is the question a student is actually
 * asking, and it is also the only start date that cannot make a late joiner
 * look like they missed a term before they arrived. `days` narrows it for a
 * range toggle. Either way it is clamped, so a bad parameter cannot walk the
 * whole table.
 */
export function attendanceWindowFrom(
  enrolledAt: string | null | undefined,
  days?: number,
): string {
  const floor = istDaysAgo(MAX_WINDOW_DAYS);
  if (typeof days === 'number' && Number.isFinite(days) && days > 0) {
    return istDaysAgo(Math.min(Math.round(days), MAX_WINDOW_DAYS));
  }
  const enrolledOn = typeof enrolledAt === 'string' ? enrolledAt.slice(0, 10) : null;
  return enrolledOn && enrolledOn >= floor ? enrolledOn : floor;
}

export interface OwnAttendance {
  from: string;
  to: string;
  summary: AttendanceSummary;
  sentence: string;
  classes: ClassAttendanceView[];
}

export async function loadOwnAttendance(
  studentId: string,
  enrollment: StudentEnrollmentScope,
  days?: number,
): Promise<OwnAttendance> {
  const from = attendanceWindowFrom(enrollment.enrolled_at, days);
  const to = istToday();

  // Batch scoping matters: a student moved to a new exam-year batch must not be
  // measured against the classes of the one they left.
  const { views } = await loadChildAttendance(
    studentId,
    enrollment.classroom_id,
    from,
    { batchId: enrollment.batch_id ?? null },
    to,
  );

  const summary = summarise(views);
  return { from, to, summary, sentence: describeAttendance(summary), classes: views };
}
