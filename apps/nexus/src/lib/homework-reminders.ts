/**
 * Homework reminders: the students who came to a class and have not handed its
 * homework in, reminded now and then every few days until they do.
 *
 * A teacher opens the class, sees six students who sat through it with the
 * drawing still not in, and presses Remind. That sends one message now and
 * starts a plan per student (nexus_homework_reminder_plans, migration
 * 20261007090000). The evening cron (api/cron/homework-reminders) sends the next
 * one every `everyDays`, and ends each student's plan the day they hand
 * everything in, leave the classroom, or the homework is withdrawn.
 *
 * Everything here is pure, so the rules are tested without a database.
 */

import type { ClassAssignment, StudentWork } from './class-work';

/** The founder's cadence: every three days until it is in. */
export const HOMEWORK_REMIND_EVERY_DAYS = 3;

export type HomeworkPlanEnd = 'handed_in' | 'stopped' | 'left' | 'no_homework';

/** One student's plan, as stored. */
export interface HomeworkPlanRow {
  id: string;
  scheduled_class_id: string;
  classroom_id: string | null;
  student_id: string;
  every_days: number;
  started_by: string | null;
  next_on: string;
  sends: number;
  last_sent_at: string | null;
  ended_at: string | null;
  end_reason: HomeworkPlanEnd | null;
}

/** What the attendance panel shows on a student's row. */
export interface HomeworkReminderState {
  active: boolean;
  everyDays: number;
  /** IST date of the next reminder, YYYY-MM-DD. Null once the plan has ended. */
  nextOn: string | null;
  /** Reminders sent so far, the first one included. */
  sends: number;
  lastSentAt: string | null;
  endReason: HomeworkPlanEnd | null;
}

export function reminderStateOf(row: HomeworkPlanRow): HomeworkReminderState {
  const active = !row.ended_at;
  return {
    active,
    everyDays: row.every_days,
    nextOn: active ? row.next_on : null,
    sends: row.sends,
    lastSentAt: row.last_sent_at,
    endReason: row.end_reason,
  };
}

/** YYYY-MM-DD plus n days. Calendar arithmetic in UTC, so no zone can shift it. */
export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Sat 27 Sept" for a YYYY-MM-DD, read in IST whatever the server's zone. */
export function shortIstDate(ymd: string | null | undefined): string {
  if (!ymd) return '';
  return new Date(`${ymd}T00:00:00+05:30`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  });
}

/** The assignments this student still owes, in the class's order. Redo counts as owed. */
export function owedAssignments(assignments: ClassAssignment[], work: StudentWork | null | undefined): ClassAssignment[] {
  if (!work) return assignments.slice();
  return assignments.filter((a) => {
    const st = work.byAssignment[a.id] ?? 'missing';
    return st !== 'in' && st !== 'late';
  });
}

/** Owes at least one piece of the class's homework. Same test as the Attended tab's "Homework not in". */
export function owesHomework(work: StudentWork | null | undefined): boolean {
  return !!work && work.total > 0 && work.handedIn < work.total;
}

/** `"Perspective study"`, `"A" and "B"`, `"A", "B" and "C"`. */
export function homeworkPhrase(titles: string[]): string {
  const q = titles.map((t) => `"${t}"`);
  if (q.length <= 1) return q[0] ?? 'the homework';
  return `${q.slice(0, -1).join(', ')} and ${q[q.length - 1]}`;
}

/**
 * The words. `{firstName}` is filled by sendNudge and `{homework}` per student,
 * so one send can go to students who owe different pieces.
 */
export function homeworkReminderText(opts: {
  classTitle: string;
  dateLabel: string;
  kind: 'first' | 'repeat';
}): { subject: string; body: string } {
  const when = opts.dateLabel ? `${opts.classTitle} on ${opts.dateLabel}` : opts.classTitle;
  if (opts.kind === 'repeat') {
    return {
      subject: `Reminder: homework from ${opts.classTitle}`,
      body: `Hi {firstName}, a reminder that {homework} from ${when} is still not handed in. Please hand it in on Nexus.`,
    };
  }
  return {
    subject: `Homework not in: ${opts.classTitle}`,
    body: `Hi {firstName}, you came to ${when}, but {homework} is not handed in yet. Please hand it in on Nexus.`,
  };
}

export type PlanDecision =
  | { planId: string; studentId: string; action: 'send'; owed: ClassAssignment[] }
  | { planId: string; studentId: string; action: 'end'; reason: HomeworkPlanEnd }
  | { planId: string; studentId: string; action: 'wait' };

/**
 * What the evening run does with one active plan. Ending comes first: a student
 * who handed it in this afternoon must not get a reminder tonight because their
 * date also happened to come up.
 */
export function decidePlan(input: {
  plan: HomeworkPlanRow;
  today: string;
  assignments: ClassAssignment[];
  work: StudentWork | null | undefined;
  /** Still enrolled in the classroom (removed and alumni are not). */
  onRoster: boolean;
  /** Paused by staff or never started. Skipped, not ended: they may come back. */
  dormant?: boolean;
}): PlanDecision {
  const { plan } = input;
  const base = { planId: plan.id, studentId: plan.student_id };
  if (input.assignments.length === 0) return { ...base, action: 'end', reason: 'no_homework' };
  if (!input.onRoster) return { ...base, action: 'end', reason: 'left' };
  const owed = owedAssignments(input.assignments, input.work);
  if (owed.length === 0) return { ...base, action: 'end', reason: 'handed_in' };
  if (plan.next_on > input.today || input.dormant) return { ...base, action: 'wait' };
  return { ...base, action: 'send', owed };
}
