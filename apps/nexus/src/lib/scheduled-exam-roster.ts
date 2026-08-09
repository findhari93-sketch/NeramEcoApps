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
}

export function buildExamRoster(input: BuildExamRosterInput): ExamRosterRow[] {
  const byStudent = new Map<string, ExamRosterAttempt>();
  for (const a of input.attempts) {
    const prior = byStudent.get(a.student_id);
    // A submitted attempt always wins over an abandoned or in-progress one.
    if (!prior || (prior.status !== 'submitted' && a.status === 'submitted')) {
      byStudent.set(a.student_id, a);
    }
  }

  const mainClose = new Date(input.window.closes_at).getTime();

  return input.students.map((student) => {
    const attempt = byStudent.get(student.id);
    const makeup = input.makeups.get(student.id);
    const liveMakeup = makeup && !makeup.revoked_at ? makeup : null;

    const closeAt = liveMakeup ? new Date(liveMakeup.closes_at).getTime() : mainClose;
    const windowClosed = input.now > closeAt;

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
      };
    }

    // No attempt worth counting. Which of the three "nothing yet" states?
    let status: ExamRosterStatus = 'not_started';
    if (windowClosed) {
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
