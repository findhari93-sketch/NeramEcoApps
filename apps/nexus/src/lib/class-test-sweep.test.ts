import { describe, expect, it } from 'vitest';
import {
  CLASS_TEST_REMINDER_CAP,
  TEMPLATE_DUE_SOON,
  TEMPLATE_MISSED,
  decideClassTestReminders,
  type SweepCandidate,
} from './class-test-sweep';

/**
 * Who gets chased about a class test.
 *
 * The value of this function is almost entirely in who it leaves OUT. A chase
 * list carrying people who already did the work, were never asked for it, or
 * were told the same thing yesterday is a list teachers stop reading, and then
 * the students who really are behind go unnoticed.
 */

const NOW = Date.parse('2026-08-20T10:00:00Z');
const IN_12_HOURS = '2026-08-20T22:00:00Z';
const IN_3_DAYS = '2026-08-23T10:00:00Z';
const HOURS_AGO_12 = '2026-08-19T22:00:00Z';
const DAYS_AGO_5 = '2026-08-15T10:00:00Z';

const student = (over: Partial<SweepCandidate> = {}): SweepCandidate => ({
  student_id: 'stu-1',
  done: false,
  is_mandatory: true,
  window_open_until: null,
  ...over,
});

const base = {
  candidates: [student()],
  closesAt: IN_12_HOURS,
  recentlyRemindedByTemplate: {} as Record<string, Set<string>>,
  sentCounts: new Map<string, number>(),
  now: NOW,
};

describe('decideClassTestReminders', () => {
  it('warns the day before it shuts', () => {
    const out = decideClassTestReminders(base);
    expect(out).toEqual([{ student_id: 'stu-1', template: TEMPLATE_DUE_SOON }]);
  });

  it('says they missed it the day after', () => {
    const out = decideClassTestReminders({ ...base, closesAt: HOURS_AGO_12 });
    expect(out).toEqual([{ student_id: 'stu-1', template: TEMPLATE_MISSED }]);
  });

  it('says nothing while the deadline is still days away', () => {
    expect(decideClassTestReminders({ ...base, closesAt: IN_3_DAYS })).toEqual([]);
  });

  it('stops bringing up a test that closed last week', () => {
    expect(decideClassTestReminders({ ...base, closesAt: DAYS_AGO_5 })).toEqual([]);
  });

  it('never chases a run that has no deadline at all', () => {
    expect(decideClassTestReminders({ ...base, closesAt: null })).toEqual([]);
  });

  it('leaves out the students who have already done it', () => {
    const out = decideClassTestReminders({ ...base, candidates: [student({ done: true })] });
    expect(out).toEqual([]);
  });

  /** Chasing someone for work that was never theirs is how a nudge loses trust. */
  it('leaves out the students it was never required of', () => {
    const out = decideClassTestReminders({ ...base, candidates: [student({ is_mandatory: false })] });
    expect(out).toEqual([]);
  });

  it('does not repeat itself inside the cooldown', () => {
    const out = decideClassTestReminders({
      ...base,
      recentlyRemindedByTemplate: { [TEMPLATE_DUE_SOON]: new Set(['stu-1']) },
    });
    expect(out).toEqual([]);
  });

  it('still sends a different message to someone chased with the other one', () => {
    const out = decideClassTestReminders({
      ...base,
      closesAt: HOURS_AGO_12,
      recentlyRemindedByTemplate: { [TEMPLATE_DUE_SOON]: new Set(['stu-1']) },
    });
    expect(out).toEqual([{ student_id: 'stu-1', template: TEMPLATE_MISSED }]);
  });

  it('gives up on a student after the cap, however far behind they are', () => {
    const out = decideClassTestReminders({
      ...base,
      sentCounts: new Map([['stu-1', CLASS_TEST_REMINDER_CAP]]),
    });
    expect(out).toEqual([]);
  });

  /**
   * The case the reopen flow exists to create. The shared door shut; theirs did
   * not. Telling them they missed it would be plainly false.
   */
  it('never tells a student they missed it while their own window is still open', () => {
    const out = decideClassTestReminders({
      ...base,
      closesAt: HOURS_AGO_12,
      candidates: [student({ window_open_until: '2026-08-25T10:00:00Z' })],
    });
    expect(out).toEqual([]);
  });

  it('does chase them once their own window has also run out', () => {
    const out = decideClassTestReminders({
      ...base,
      closesAt: HOURS_AGO_12,
      candidates: [student({ window_open_until: DAYS_AGO_5 })],
    });
    expect(out).toEqual([{ student_id: 'stu-1', template: TEMPLATE_MISSED }]);
  });

  it('chases everyone who is genuinely behind, not just the first', () => {
    const out = decideClassTestReminders({
      ...base,
      candidates: [
        student({ student_id: 'a' }),
        student({ student_id: 'b', done: true }),
        student({ student_id: 'c' }),
      ],
    });
    expect(out.map((d) => d.student_id)).toEqual(['a', 'c']);
  });
});
