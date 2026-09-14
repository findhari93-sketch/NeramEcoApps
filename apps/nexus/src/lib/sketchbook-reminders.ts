/**
 * Who gets a sketchbook reminder tonight, and what it says. PURE.
 *
 * Founder decisions, 2026-09-13:
 * - Any drawing upload counts as drawing (sketchbook, assignment, question bank,
 *   free practice).
 * - A student quiet for 3 days gets a reminder, then on day 6 and day 9 of the
 *   same quiet stretch. After three, automatic reminders stop and the student
 *   shows under "Needs a call" for the teacher: a fourth automatic message
 *   teaches a student to mute the bot, a person calling does not.
 * - The clock starts at the student's own tracking start (sketchbook-status.ts),
 *   so nobody is reminded about days before the sketchbook existed for them.
 * - Dormant students are never reminded. Never posted to the class group.
 *
 * A "cycle" is one quiet stretch, named by the day it started (the last drawing,
 * or the tracking start). A drawing starts a new cycle and the steps start over.
 */

import { daysBetween } from './sketchbook-rhythm';
import { QUIET_CALL_DAYS, quietClock } from './sketchbook-status';

export const REMINDER_DAYS = [3, 6, 9] as const;
/** At least this many days between two automatic reminders, even after a missed cron day. */
export const MIN_SPACING_DAYS = 3;
/** Per run, so one evening can never become a flood. */
export const MAX_REMINDERS_PER_RUN = 150;

export type ReminderStep = 1 | 2 | 3;

export interface ReminderCandidate {
  studentId: string;
  classroomId: string;
  /** This student's tracking start. */
  start: string;
  lastDrawingDate: string | null;
  /** Dormant in THIS classroom (sendNudge's global filter would miss it). */
  dormantHere: boolean;
  goal: number;
}

export interface ReminderLog {
  kind: 'auto' | 'teacher';
  cycleStart: string;
  step: ReminderStep | null;
  sentOn: string;
}

export type ReminderDecision =
  | { kind: 'send'; step: ReminderStep; cycleStart: string; quietDays: number }
  | { kind: 'needs_call'; cycleStart: string; quietDays: number }
  | { kind: 'skip'; reason: 'dormant' | 'too_new' | 'already_today' | 'not_due' | 'spacing' };

export function decideReminder(c: ReminderCandidate, logs: ReminderLog[], today: string): ReminderDecision {
  if (c.dormantHere) return { kind: 'skip', reason: 'dormant' };
  const { since: cycleStart, quietDays } = quietClock(c.start, c.lastDrawingDate, today);
  // Anyone already messaged today (a teacher's own nudge included) is left alone.
  if (logs.some((l) => l.sentOn === today)) return { kind: 'skip', reason: 'already_today' };

  const autos = logs.filter((l) => l.kind === 'auto' && l.cycleStart === cycleStart);
  const step = autos.length + 1;
  if (step > REMINDER_DAYS.length) {
    return quietDays >= QUIET_CALL_DAYS ? { kind: 'needs_call', cycleStart, quietDays } : { kind: 'skip', reason: 'not_due' };
  }
  const due = REMINDER_DAYS[step - 1];
  if (quietDays < due) return { kind: 'skip', reason: step === 1 && quietDays < REMINDER_DAYS[0] ? 'too_new' : 'not_due' };

  const lastAuto = autos.reduce<string | null>((a, l) => (a === null || l.sentOn > a ? l.sentOn : a), null);
  if (lastAuto && daysBetween(lastAuto, today) < MIN_SPACING_DAYS) return { kind: 'skip', reason: 'spacing' };

  return { kind: 'send', step: step as ReminderStep, cycleStart, quietDays };
}

export interface PlannedSend extends ReminderCandidate {
  step: ReminderStep;
  cycleStart: string;
  quietDays: number;
}

export function planReminderRun(
  candidates: ReminderCandidate[],
  logsByStudent: Record<string, ReminderLog[]>,
  today: string,
  cap: number = MAX_REMINDERS_PER_RUN,
): { sends: PlannedSend[]; needsCall: string[]; skipped: Record<string, number> } {
  const sends: PlannedSend[] = [];
  const needsCall: string[] = [];
  const skipped: Record<string, number> = {};
  for (const c of candidates) {
    const d = decideReminder(c, logsByStudent[c.studentId] || [], today);
    if (d.kind === 'send') sends.push({ ...c, step: d.step, cycleStart: d.cycleStart, quietDays: d.quietDays });
    else if (d.kind === 'needs_call') needsCall.push(c.studentId);
    else skipped[d.reason] = (skipped[d.reason] || 0) + 1;
  }
  // Longest quiet first, so a cap never drops the students who need it most.
  sends.sort((a, b) => b.quietDays - a.quietDays);
  if (sends.length > cap) skipped.cap = sends.length - cap;
  return { sends: sends.slice(0, cap), needsCall, skipped };
}

export interface ReminderMessage {
  subject: string;
  plain: string;
  buttonLabel: string;
}

/** {firstName} is filled by sendNudge for each student. No dashes, per the content rules. */
export function reminderMessage(step: ReminderStep, neverDrew: boolean, goal: number): ReminderMessage {
  const buttonLabel = 'Add a sketch';
  if (step === 1 && neverDrew) {
    return {
      subject: 'Your sketchbook is waiting, {firstName}',
      plain: 'Draw anything in front of you and add it. Small, rough sketches count.',
      buttonLabel,
    };
  }
  if (step === 1) {
    return {
      subject: 'Time for a quick sketch, {firstName}',
      plain: 'It has been 3 days since your last drawing. Ten minutes is enough. Add one to your sketchbook today.',
      buttonLabel,
    };
  }
  if (step === 2) {
    return {
      subject: 'One sketch today, {firstName}?',
      plain: `It has been 6 days. One small drawing gets your rhythm going again. Your goal is ${goal} ${goal === 1 ? 'day' : 'days'} a week.`,
      buttonLabel,
    };
  }
  return {
    subject: 'We miss your drawings, {firstName}',
    plain: 'It has been 9 days. Add one sketch today, even a rough one. If something is in the way, tell your teacher.',
    buttonLabel,
  };
}

export interface DigestInput {
  classroomName: string;
  sketches: number;
  students: number;
  needsCall: number;
}

/** The teacher's evening line. Null when there is nothing to say, so no empty digest is ever sent. */
export function buildTeacherDigest(d: DigestInput): { subject: string; plain: string } | null {
  if (d.sketches === 0 && d.needsCall === 0) return null;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const callLine = d.needsCall > 0
    ? `${plural(d.needsCall, 'student has', 'students have')} been quiet for 9 days after 3 reminders and ${d.needsCall === 1 ? 'needs' : 'need'} a call.`
    : '';
  if (d.sketches === 0) {
    return { subject: `${plural(d.needsCall, 'student needs', 'students need')} a call`, plain: `${d.classroomName}: ${callLine}` };
  }
  const subject = `${plural(d.sketches, 'new sketch', 'new sketches')} from ${plural(d.students, 'student', 'students')}`;
  const plain = `${d.classroomName}: ${subject} today, waiting in Flip through.${callLine ? ` ${callLine}` : ''}`;
  return { subject, plain };
}
