/**
 * Who is ready for this class, and who is not.
 *
 * Pure. The route does the two queries and hands the rows here.
 *
 * Two rules borrowed from surfaces that already got this wrong once:
 *
 *   * A student with no prep-state row is 'not_started', NEVER 'failed'. The RSVP
 *     dashboard makes the same choice and for the same reason: inventing a
 *     "failed to respond" bucket hands the teacher a list to chase that should
 *     not exist.
 *
 *   * A missing attendance row is not_measured, not "did not attend". Attendance
 *     sync can be late, degraded or never run, and parent-attendance.ts exists
 *     because this team already learned that the expensive way.
 */

export type PrepRosterStatus =
  | 'ready'
  | 'test_pending'
  | 'prework_pending'
  | 'not_started'
  | 'reason_given'
  | 'attended_unprepared';

export interface PrepStateRow {
  student_id: string;
  test_best_pct: number | null;
  test_attempts: number;
  test_passed_at: string | null;
  assignments_required: number;
  assignments_submitted: number;
  unlocked_at: string | null;
  unlocked_via: string | null;
  prepared_at_class_start: boolean | null;
  blocked_attempts: number;
  last_blocked_at: string | null;
  joined_via_nexus_at: string | null;
  test_reason_code: string | null;
  test_reason_at: string | null;
  updated_at: string | null;
}

export interface RosterStudent {
  student_id: string;
  name: string | null;
  avatar_url: string | null;
  /**
   * nexus_enrollments.current_standard, carried through untouched so the roster
   * can show who is a break-year or Class 12 student. It never affects status:
   * readiness is readiness whatever year they are in.
   */
  study_stage?: string | null;
}

export interface PrepRosterRow {
  student_id: string;
  name: string | null;
  avatar_url: string | null;
  study_stage: string | null;
  status: PrepRosterStatus;
  test_best_pct: number | null;
  test_attempts: number;
  assignments_required: number;
  assignments_submitted: number;
  reason_code: string | null;
  blocked_attempts: number;
  last_activity_at: string | null;
}

export interface BuildPrepRosterInput {
  students: RosterStudent[];
  states: PrepStateRow[];
  /** Whether this class has a prep test at all. */
  hasTest: boolean;
  preworkRequired: number;
  /** student_id -> attended. Absent id means not measured. */
  attendance?: Map<string, boolean>;
}

export function buildPrepRoster(input: BuildPrepRosterInput): PrepRosterRow[] {
  const stateById = new Map(input.states.map((s) => [s.student_id, s]));

  return input.students.map((student) => {
    const s = stateById.get(student.student_id);
    const attended = input.attendance?.get(student.student_id);

    const base = {
      student_id: student.student_id,
      name: student.name,
      avatar_url: student.avatar_url,
      study_stage: student.study_stage ?? null,
      test_best_pct: s?.test_best_pct ?? null,
      test_attempts: s?.test_attempts ?? 0,
      assignments_required: s?.assignments_required ?? input.preworkRequired,
      assignments_submitted: s?.assignments_submitted ?? 0,
      reason_code: s?.test_reason_code ?? null,
      blocked_attempts: s?.blocked_attempts ?? 0,
      last_activity_at: s?.updated_at ?? null,
    };

    // The honest record first, and deliberately ahead of 'ready'. A student who
    // sat in the class unprepared and then did the work afterwards is still
    // someone who sat in it unprepared, and prepared_at_class_start is written by
    // comparing timestamps against the class start so it cannot be undone later.
    if (attended === true && s?.prepared_at_class_start === false) {
      return { ...base, status: 'attended_unprepared' as const };
    }

    if (!s) return { ...base, status: 'not_started' as const };

    const testDone = !input.hasTest || !!s.test_passed_at;
    const preworkDone = base.assignments_submitted >= base.assignments_required;

    if (testDone && preworkDone) return { ...base, status: 'ready' as const };

    // A reason outranks the individual blockers in the teacher's list, because
    // "they told us why" needs a different response from "they have not started".
    if (s.test_reason_at) return { ...base, status: 'reason_given' as const };

    // Nothing attempted at all is a different problem from a failed attempt: one
    // needs a nudge, the other needs help with the topic.
    if (!testDone && s.test_attempts === 0 && base.assignments_submitted === 0) {
      return { ...base, status: 'not_started' as const };
    }

    // Test first, matching the gate's blocker order.
    if (!testDone) return { ...base, status: 'test_pending' as const };
    return { ...base, status: 'prework_pending' as const };
  });
}

export interface PrepRosterSummary {
  ready: number;
  pending: number;
  reasonGiven: number;
  unprepared: number;
  total: number;
  /** Null when the roster is empty. Never 0 in that case. */
  readyRate: number | null;
}

export function summarisePrepRoster(rows: PrepRosterRow[]): PrepRosterSummary {
  const ready = rows.filter((r) => r.status === 'ready').length;
  const reasonGiven = rows.filter((r) => r.status === 'reason_given').length;
  const unprepared = rows.filter((r) => r.status === 'attended_unprepared').length;
  const pending = rows.filter(
    (r) => r.status === 'test_pending' || r.status === 'prework_pending' || r.status === 'not_started',
  ).length;

  return {
    ready,
    pending,
    reasonGiven,
    unprepared,
    total: rows.length,
    // Null, not 0. An empty roster has no ready rate, and showing "0% ready" for
    // a class nobody is enrolled in is a bug report waiting to happen.
    readyRate: rows.length > 0 ? ready / rows.length : null,
  };
}

/** One line for the teacher, phrased the way they would say it out loud. */
export function prepRosterHeadline(summary: PrepRosterSummary): string {
  if (summary.total === 0) return 'Nobody is enrolled in this class yet';

  const parts = [`${summary.ready} ready`];
  if (summary.pending > 0) parts.push(`${summary.pending} to go`);
  if (summary.reasonGiven > 0) parts.push(`${summary.reasonGiven} explained`);
  if (summary.unprepared > 0) parts.push(`${summary.unprepared} joined unprepared`);
  return parts.join(', ');
}
