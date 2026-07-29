/**
 * Pre-class work: the rules, in one place.
 *
 * "Prework" is an assignment a student is meant to finish BEFORE the class it is
 * attached to. The deadline is the moment we ask, because a student who says "I
 * did not understand the task" three hours before the class has handed the
 * teacher something they can act on in the class itself.
 *
 * This file used to say the deadline was never an enforcement mechanism and
 * nobody was ever locked out of a class over homework. That changed: prework is
 * now half of the class prep gate, alongside the short test, and an unmet gate
 * withholds the Join link. See class-prep-gate.ts for the rule.
 *
 * What has NOT changed is the reason the old rule existed. Locking a student out
 * of a class over homework converts a homework problem into an attendance
 * problem, so the door is gated but never bolted: giving a reason opens it
 * immediately and the blockers stay on the record for the teacher. The functions
 * in this file still answer "should we ask now", which is a different question
 * from "may they join" and must not be used to decide the latter.
 *
 * Pure functions, no framework, no fetching, so the schedule API, the afternoon
 * sweep and the student page all classify a piece of work identically. If the
 * strip on the timetable and the nudge from the cron ever disagreed, students
 * would stop believing both.
 */

/** Prework is due when its class starts. Not "start minus 30": two thresholds is how deadlines stop being believed. */
export function classStartIso(scheduledDate: string, startTime: string): string {
  const day = (scheduledDate || '').slice(0, 10);
  const raw = (startTime || '00:00').slice(0, 8);
  const time = raw.length === 5 ? `${raw}:00` : raw;
  // The +05:30 is load-bearing. A bare `new Date('2026-08-20T19:00')` is parsed
  // in the server's zone, which on Vercel is UTC, and lands 5.5 hours out: far
  // enough to fire the "not done" strip in the middle of the class it was meant
  // to precede.
  return `${day}T${time}+05:30`;
}

/** Same, for the end of a class, so "the class has finished" is decidable. */
export function classEndIso(scheduledDate: string, endTime: string): string {
  return classStartIso(scheduledDate, endTime);
}

/**
 * How long before the deadline we start asking.
 *
 * Three hours puts a 7:00 PM class's prompt at 4:00 PM: after school, before
 * dinner, with enough of the evening left that a student who wants to do the
 * work still can. A constant rather than a column, per-assignment tuning is
 * premature and would only produce inconsistent prompts.
 */
export const PREWORK_REASON_LEAD_MINUTES = 180;

export type PreworkState =
  /** Deadline is further away than the lead window. Say nothing. */
  | 'not_yet'
  /** Inside the lead window, not submitted, no reason given. Amber, dismissible. */
  | 'due_soon'
  /** Past the deadline, class not finished, still nothing. Red, not dismissible. */
  | 'overdue_unanswered'
  /** Not done, but they told us why. */
  | 'answered'
  /** Submitted. Nothing more to ask. */
  | 'done'
  /** The class has finished and nothing was given. The absence flow owns it now. */
  | 'stale';

export interface ClassifyPreworkInput {
  /** The prework deadline. Null means no deadline was set, so nothing to chase. */
  dueAtIso: string | null;
  /** When the class finishes, after which the pre-class question is moot. */
  classEndIso: string;
  /** nexus_scheduled_classes.status. A cancelled class is excluded outright. */
  classStatus?: string | null;
  submitted: boolean;
  hasReason: boolean;
  /** Injectable for tests. Defaults to now. */
  nowMs?: number;
}

/**
 * Classify one piece of prework for one student.
 *
 * Returns null when the item should not be surfaced at all: a cancelled class,
 * or work with no deadline. One wrong red strip costs the credibility of every
 * later one, so exclusion is deliberately generous.
 */
export function classifyPrework(input: ClassifyPreworkInput): PreworkState | null {
  if (input.classStatus === 'cancelled') return null;
  if (!input.dueAtIso) return null;

  const due = Date.parse(input.dueAtIso);
  const end = Date.parse(input.classEndIso);
  if (Number.isNaN(due)) return null;

  const now = input.nowMs ?? Date.now();

  // Submitted wins over every other state, including overdue. A student who did
  // the work late has still done it, and telling them otherwise is just wrong.
  if (input.submitted) return 'done';

  const classFinished = !Number.isNaN(end) && now > end;
  if (classFinished) return input.hasReason ? 'answered' : 'stale';

  if (input.hasReason) return 'answered';

  if (now >= due) return 'overdue_unanswered';
  if (now >= due - PREWORK_REASON_LEAD_MINUTES * 60_000) return 'due_soon';
  return 'not_yet';
}

/** States that put something in front of the student right now. */
export function preworkNeedsAttention(state: PreworkState | null): boolean {
  return state === 'due_soon' || state === 'overdue_unanswered';
}

/**
 * The banner text for a set of prework items, or null when there is nothing to
 * say. Overdue outranks due-soon: if any item is past its deadline the strip is
 * the red one, and the red one cannot be dismissed.
 */
export function preworkStripCopy(
  items: { state: PreworkState | null; dueAtIso?: string | null }[],
): { severity: 'error' | 'warning'; text: string; action: string; dismissible: boolean } | null {
  const overdue = items.filter((i) => i.state === 'overdue_unanswered');
  const soon = items.filter((i) => i.state === 'due_soon');

  if (overdue.length) {
    return {
      severity: 'error',
      text:
        overdue.length === 1
          ? 'Pre-class work is not done for tonight'
          : `Pre-class work not done for ${overdue.length} classes`,
      action: 'Tell us why',
      dismissible: false,
    };
  }

  if (soon.length) {
    const only = soon.length === 1 ? soon[0] : null;
    const at = only?.dueAtIso ? formatIstTime(only.dueAtIso) : null;
    return {
      severity: 'warning',
      text: at
        ? `Pre-class work due before ${at}`
        : soon.length === 1
          ? 'Pre-class work due before your next class'
          : `Pre-class work due for ${soon.length} classes`,
      action: 'Open',
      dismissible: true,
    };
  }

  return null;
}

/** "2026-07-29T19:00:00+05:30" -> "7:00 PM", always in IST. */
export function formatIstTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d
    .toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    })
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

/**
 * The due line for a prework row. Homework renders a bare date, which reads as
 * "any time that day" and is wrong here: prework is due at a time of day.
 */
export function preworkDueLabel(dueAtIso: string | null | undefined): string {
  if (!dueAtIso) return 'Before the class starts';
  const at = formatIstTime(dueAtIso);
  return at ? `Due before class, ${at}` : 'Before the class starts';
}
