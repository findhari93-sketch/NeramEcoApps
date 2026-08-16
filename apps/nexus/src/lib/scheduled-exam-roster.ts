/**
 * Who is sitting the exam right now, who has finished, and who never turned up.
 *
 * PURE, so the invigilation screen, the summary counters and any test of either
 * read the same rules. Modelled on class-prep-roster.ts and inheriting its two
 * hard-won rules:
 *
 *   1. A STUDENT WITH NO ATTEMPT IS NOT A FAILURE. While the window is open
 *      they are simply "not started". They become "absent" only once the door
 *      has closed. Calling someone absent at 10:01 for an exam that runs to
 *      13:00 is both wrong and the sort of thing a teacher acts on.
 *
 *   2. THE DEADLINE IS THE EARLIER OF THE TWO. A student who starts at 12:50 on
 *      a 180-minute paper that closes at 13:00 has ten minutes, not three
 *      hours. Showing them the duration would be a promise the door will not
 *      keep.
 */

export type ExamRosterStatus =
  | 'not_started'
  | 'in_progress'
  | 'submitted'
  | 'absent'
  | 'makeup_open'
  | 'excused';

export interface ExamRosterStudent {
  id: string;
  name: string;
  avatar_url?: string | null;
}

export interface ExamRosterAttempt {
  student_id: string;
  status: string;
  started_at: string | null;
  submitted_at: string | null;
  score: number | null;
  percentage: number | null;
  final_percentage?: number | null;
  finalised_at?: string | null;
}

export interface ExamRosterMakeup {
  opens_at: string;
  closes_at: string;
  revoked_at: string | null;
}

export interface ExamRosterRow {
  student_id: string;
  name: string;
  avatar_url: string | null;
  status: ExamRosterStatus;
  /** When this student's paper must be in by. Null when they have not started. */
  deadline_at: string | null;
  /** Seconds left against deadline_at. Negative is clamped to 0. */
  seconds_remaining: number | null;
  started_at: string | null;
  submitted_at: string | null;
  percentage: number | null;
  /** True while any drawing on their paper is unmarked. */
  provisional: boolean;
  is_makeup: boolean;
  /** Proctoring signals logged across every attempt this student has made. */
  violation_count: number;
  /** How many attempts this student has SUBMITTED (not counting the live one). */
  attempts_used: number;
  /** Base limit + any teacher-granted override. Null means unlimited. */
  attempts_allowed: number | null;
  /** attempts_allowed reached and nothing currently in progress -- the "+1 attempt" button shows for this row. */
  exhausted: boolean;
}

export interface ExamRosterSummary {
  not_started: number;
  in_progress: number;
  submitted: number;
  absent: number;
  makeup_open: number;
}

export interface BuildExamRosterInput {
  students: ExamRosterStudent[];
  attempts: ExamRosterAttempt[];
  makeups: Map<string, ExamRosterMakeup>;
  window: { opens_at: string; closes_at: string };
  durationMinutes: number | null;
  now: number;
  /** The placement's own gating.attempt_limit. Omit or null for unlimited. */
  baseAttemptLimit?: number | null;
  /** Per-student +N grants from nexus_exam_attempt_overrides (getExamAttemptOverrides). */
  attemptOverrides?: Map<string, number>;
  /** Per-student totals from nexus_test_attempt_violations (getViolationCountsForTest). */
  violationCounts?: Map<string, number>;
  /**
   * True for a student the exam-eligibility engine has excused (still
   * catching up, joined too recently, or a teacher override). Shown as soon
   * as it is known, window open or closed -- a not_started row for someone
   * nobody expects to sit the paper reads as a problem the teacher does not
   * actually have. An excused student who sits it anyway is not stopped: any
   * attempt they make is checked FIRST and always wins over this flag.
   */
  excused?: Map<string, boolean>;
}

export function buildExamRoster(input: BuildExamRosterInput): ExamRosterRow[] {
  const byStudent = new Map<string, ExamRosterAttempt>();
  // How many attempts each student has SUBMITTED, independent of which one
  // "wins" the display row above -- a retake must still count against the limit.
  const submittedCountByStudent = new Map<string, number>();
  for (const a of input.attempts) {
    const prior = byStudent.get(a.student_id);
    // A submitted attempt always wins over an abandoned or in-progress one.
    if (!prior || (prior.status !== 'submitted' && a.status === 'submitted')) {
      byStudent.set(a.student_id, a);
    }
    if (a.status === 'submitted') {
      submittedCountByStudent.set(a.student_id, (submittedCountByStudent.get(a.student_id) || 0) + 1);
    }
  }

  const attemptOverrides = input.attemptOverrides || new Map<string, number>();
  const violationCounts = input.violationCounts || new Map<string, number>();
  const excusedMap = input.excused || new Map<string, boolean>();
  const baseLimit =
    typeof input.baseAttemptLimit === 'number' && input.baseAttemptLimit > 0 ? input.baseAttemptLimit : null;

  const mainClose = new Date(input.window.closes_at).getTime();

  return input.students.map((student) => {
    const attempt = byStudent.get(student.id);
    const makeup = input.makeups.get(student.id);
    const liveMakeup = makeup && !makeup.revoked_at ? makeup : null;

    const closeAt = liveMakeup ? new Date(liveMakeup.closes_at).getTime() : mainClose;
    const windowClosed = input.now > closeAt;

    const violationCount = violationCounts.get(student.id) || 0;
    const attemptsUsed = submittedCountByStudent.get(student.id) || 0;
    const attemptsAllowed = baseLimit === null ? null : baseLimit + (attemptOverrides.get(student.id) || 0);

    if (attempt?.status === 'submitted') {
      const provisional = !attempt.finalised_at;
      return {
        student_id: student.id,
        name: student.name,
        avatar_url: student.avatar_url ?? null,
        status: 'submitted' as const,
        deadline_at: null,
        seconds_remaining: null,
        started_at: attempt.started_at,
        submitted_at: attempt.submitted_at,
        percentage: provisional ? attempt.percentage : (attempt.final_percentage ?? attempt.percentage),
        provisional,
        is_makeup: Boolean(liveMakeup),
        violation_count: violationCount,
        attempts_used: attemptsUsed,
        attempts_allowed: attemptsAllowed,
        exhausted: attemptsAllowed !== null && attemptsUsed >= attemptsAllowed,
      };
    }

    if (attempt?.status === 'in_progress' && attempt.started_at) {
      // The earlier of "their time ran out" and "the door shut".
      const started = new Date(attempt.started_at).getTime();
      const byDuration =
        input.durationMinutes && input.durationMinutes > 0
          ? started + input.durationMinutes * 60_000
          : Number.POSITIVE_INFINITY;
      const deadline = Math.min(byDuration, closeAt);

      return {
        student_id: student.id,
        name: student.name,
        avatar_url: student.avatar_url ?? null,
        status: 'in_progress' as const,
        deadline_at: new Date(deadline).toISOString(),
        seconds_remaining: Math.max(0, Math.round((deadline - input.now) / 1000)),
        started_at: attempt.started_at,
        submitted_at: null,
        percentage: null,
        provisional: false,
        is_makeup: Boolean(liveMakeup),
        violation_count: violationCount,
        attempts_used: attemptsUsed,
        attempts_allowed: attemptsAllowed,
        // Never exhausted while a sitting is live: the +1 button is for
        // deciding whether to let a student START another, not this one.
        exhausted: false,
      };
    }

    // No attempt worth counting. Which of the four "nothing yet" states?
    let status: ExamRosterStatus = 'not_started';
    if (excusedMap.get(student.id)) {
      // Checked before windowClosed/absent on purpose: someone nobody expects
      // to sit this paper should never read as having failed to show up.
      status = 'excused';
    } else if (windowClosed) {
      status = 'absent';
    } else if (liveMakeup && input.now > mainClose) {
      // The main door has shut and theirs is still open: a granted second sitting.
      status = 'makeup_open';
    }

    return {
      student_id: student.id,
      name: student.name,
      avatar_url: student.avatar_url ?? null,
      status,
      deadline_at: null,
      seconds_remaining: null,
      started_at: null,
      submitted_at: null,
      percentage: null,
      violation_count: violationCount,
      attempts_used: attemptsUsed,
      attempts_allowed: attemptsAllowed,
      exhausted: attemptsAllowed !== null && attemptsUsed >= attemptsAllowed,
      provisional: false,
      is_makeup: Boolean(liveMakeup),
    };
  });
}

export function summariseExamRoster(rows: ExamRosterRow[]): ExamRosterSummary {
  const out: ExamRosterSummary = {
    not_started: 0,
    in_progress: 0,
    submitted: 0,
    absent: 0,
    makeup_open: 0,
  };
  for (const r of rows) {
    if (r.status === 'excused') continue;
    out[r.status] += 1;
  }
  return out;
}

/** Sorted the way a teacher scans during an exam: who needs attention first. */
const STATUS_ORDER: Record<ExamRosterStatus, number> = {
  in_progress: 0,
  not_started: 1,
  makeup_open: 2,
  absent: 3,
  submitted: 4,
  excused: 5,
};

export function sortExamRoster(rows: ExamRosterRow[]): ExamRosterRow[] {
  return [...rows].sort(
    (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name),
  );
}
