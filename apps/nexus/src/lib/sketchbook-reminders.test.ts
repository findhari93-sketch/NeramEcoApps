import { describe, expect, it } from 'vitest';
import { addDays } from './sketchbook-rhythm';
import {
  buildTeacherDigest,
  decideReminder,
  planReminderRun,
  reminderMessage,
  type ReminderCandidate,
  type ReminderLog,
} from './sketchbook-reminders';

const LAST = '2026-09-20';
const day = (n: number) => addDays(LAST, n);
const cand = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  studentId: 's1', classroomId: 'c1', start: '2026-09-12', lastDrawingDate: LAST, dormantHere: false, goal: 3, ...over,
});
const auto = (step: 1 | 2 | 3, sentOn: string, cycleStart = LAST): ReminderLog => ({ kind: 'auto', step, sentOn, cycleStart });

/** Simulate the nightly cron from day 1 to `to`, sending whatever it decides. */
function runNights(to: number, c = cand(), skipNights: number[] = []) {
  const logs: ReminderLog[] = [];
  const sentOn: number[] = [];
  for (let n = 1; n <= to; n++) {
    if (skipNights.includes(n)) continue;
    const d = decideReminder(c, logs, day(n));
    if (d.kind === 'send') {
      logs.push(auto(d.step, day(n), d.cycleStart));
      sentOn.push(n);
    }
  }
  return { logs, sentOn };
}

describe('decideReminder', () => {
  it('sends on quiet day 3, 6 and 9, and never on the days between', () => {
    expect(runNights(12).sentOn).toEqual([3, 6, 9]);
  });

  it('does nothing on quiet day 2', () => {
    expect(decideReminder(cand(), [], day(2))).toEqual({ kind: 'skip', reason: 'too_new' });
  });

  it('a rerun on the same evening sends nothing', () => {
    const d = decideReminder(cand(), [auto(1, day(3))], day(3));
    expect(d).toEqual({ kind: 'skip', reason: 'already_today' });
  });

  it('after a missed cron night, catches up one step at a time and keeps 3 days apart', () => {
    // Nights 3 to 5 did not run.
    expect(runNights(15, cand(), [3, 4, 5]).sentOn).toEqual([6, 9, 12]);
  });

  it('after three reminders, stops and asks for a call from quiet day 9', () => {
    const logs = [auto(1, day(3)), auto(2, day(6)), auto(3, day(9))];
    expect(decideReminder(cand(), logs, day(10))).toEqual({ kind: 'needs_call', cycleStart: LAST, quietDays: 10 });
  });

  it('a new drawing starts a new cycle', () => {
    const logs = [auto(1, day(3)), auto(2, day(6)), auto(3, day(9))];
    const drewAgain = cand({ lastDrawingDate: day(10) });
    expect(decideReminder(drewAgain, logs, day(12))).toEqual({ kind: 'skip', reason: 'too_new' });
    expect(decideReminder(drewAgain, logs, day(13))).toMatchObject({ kind: 'send', step: 1, cycleStart: day(10) });
  });

  it('counts a never-drawn student from their tracking start, not from launch week', () => {
    const joiner = cand({ lastDrawingDate: null, start: '2026-09-18' });
    expect(decideReminder(joiner, [], '2026-09-20')).toEqual({ kind: 'skip', reason: 'too_new' });
    expect(decideReminder(joiner, [], '2026-09-21')).toMatchObject({ kind: 'send', step: 1, quietDays: 3 });
  });

  it('never reminds a student dormant in this classroom', () => {
    expect(decideReminder(cand({ dormantHere: true }), [], day(5))).toEqual({ kind: 'skip', reason: 'dormant' });
  });

  it('a teacher nudge today blocks the automatic one but is not a strike', () => {
    const teacher: ReminderLog = { kind: 'teacher', step: null, sentOn: day(3), cycleStart: LAST };
    expect(decideReminder(cand(), [teacher], day(3))).toEqual({ kind: 'skip', reason: 'already_today' });
    expect(decideReminder(cand(), [teacher], day(4))).toMatchObject({ kind: 'send', step: 1 });
  });
});

describe('planReminderRun', () => {
  it('sends the longest quiet first and caps the run', () => {
    const cands = [
      cand({ studentId: 'a', lastDrawingDate: day(-1) }),
      cand({ studentId: 'b', lastDrawingDate: day(-7) }),
      cand({ studentId: 'c', lastDrawingDate: day(0) }),
    ];
    const plan = planReminderRun(cands, {}, day(3), 2);
    expect(plan.sends.map((s) => s.studentId)).toEqual(['b', 'a']);
    expect(plan.skipped.cap).toBe(1);
  });
});

describe('copy', () => {
  it('names the student, has a button, and never uses a dash', () => {
    for (const [step, never] of [[1, true], [1, false], [2, false], [3, false]] as const) {
      const m = reminderMessage(step, never, 3);
      expect(m.subject).toContain('{firstName}');
      expect(m.buttonLabel).toBe('Add a sketch');
      expect(`${m.subject} ${m.plain}`).not.toMatch(/[–—]|--/);
    }
  });

  it('the digest says nothing when there is nothing, and reads plainly otherwise', () => {
    expect(buildTeacherDigest({ classroomName: 'JEE', sketches: 0, students: 0, needsCall: 0 })).toBeNull();
    expect(buildTeacherDigest({ classroomName: 'JEE', sketches: 7, students: 5, needsCall: 2 })).toEqual({
      subject: '7 new sketches from 5 students',
      plain: 'JEE: 7 new sketches from 5 students today, waiting in Flip through. 2 students have been quiet for 9 days after 3 reminders and need a call.',
    });
    expect(buildTeacherDigest({ classroomName: 'JEE', sketches: 1, students: 1, needsCall: 0 })?.subject).toBe('1 new sketch from 1 student');
  });
});
