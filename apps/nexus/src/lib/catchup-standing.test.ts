/**
 * The guard on the two claims this screen makes about a person.
 *
 * "They are behind" and "they are ignoring us" are the only two statements on
 * the catch-up screen that a teacher acts on by picking up a phone, and both
 * were previously eyeballed off a raw count of absence rows. That count is
 * wrong in one specific and unfair way: a student who enrolled in month three
 * owes every class taught before they existed here, so sorting a cohort by
 * missed classes puts the newest joiner at the top of a list titled with words
 * like "worst". `ownOpen` exists to make that impossible.
 */
import { describe, it, expect } from 'vitest';
import { catchupStanding, type StandingItem } from './catchup-standing';

const TODAY = '2026-08-08';

function item(over: Partial<StandingItem> = {}): StandingItem {
  return {
    kind: 'no_show',
    status: 'waiting',
    scheduledDate: '2026-08-01',
    caughtUpAt: null,
    followupSentAt: null,
    recordingWatchedAt: null,
    activatedOn: null,
    ...over,
  };
}

describe('the two backlogs are never added together', () => {
  it('keeps classes taught before they enrolled out of ownOpen', () => {
    const s = catchupStanding(
      [
        item({ kind: 'late_joiner' }),
        item({ kind: 'late_joiner' }),
        item({ kind: 'late_joiner' }),
        item({ kind: 'no_show' }),
      ],
      TODAY,
    );
    expect(s.ownOpen).toBe(1);
    expect(s.lateJoinerOpen).toBe(3);
  });

  it('gives a pure late joiner an ownOpen of zero however big their backlog', () => {
    // This is the whole point. The chase list ranks on ownOpen, so a student
    // who has missed nothing since joining can never be ranked as the worst
    // offender in the cohort on the strength of a backlog they did not choose.
    const s = catchupStanding(
      Array.from({ length: 30 }, () => item({ kind: 'late_joiner' })),
      TODAY,
    );
    expect(s.ownOpen).toBe(0);
    expect(s.lateJoinerOpen).toBe(30);
  });
});

describe('what counts as open work', () => {
  it('does not count work we are holding up as work they owe', () => {
    // blocked means no recording exists and pending_teacher means the recap is
    // not published. Counting either against a student would put our own
    // backlog on their record.
    const s = catchupStanding(
      [item({ status: 'blocked' }), item({ status: 'pending_teacher' })],
      TODAY,
    );
    expect(s.ownOpen).toBe(0);
    expect(s.lateJoinerOpen).toBe(0);
  });

  it('does not count finished or excused classes as open', () => {
    const s = catchupStanding(
      [
        item({ status: 'done', caughtUpAt: '2026-08-03T10:00:00+05:30' }),
        item({ status: 'excused' }),
      ],
      TODAY,
    );
    expect(s.ownOpen).toBe(0);
  });

  it('counts the class with a clock running on it as open', () => {
    expect(catchupStanding([item({ status: 'active' })], TODAY).ownOpen).toBe(1);
  });
});

describe('clearedTotal', () => {
  it('counts work they actually did, not waivers', () => {
    // An excused class is a teacher deciding it does not matter. Putting it in
    // the number printed beside a student's name on a wall of people who
    // cleared everything would credit them for a decision somebody else made.
    const s = catchupStanding(
      [
        item({ status: 'done', caughtUpAt: '2026-08-02T10:00:00+05:30' }),
        item({ status: 'done', caughtUpAt: '2026-08-05T10:00:00+05:30' }),
        item({ status: 'excused' }),
      ],
      TODAY,
    );
    expect(s.clearedTotal).toBe(2);
    expect(s.lastClearedAt).toBe('2026-08-05T10:00:00+05:30');
  });

  it('reports the median turnaround, not the average', () => {
    // One class cleared eight months late would drag an average far enough to
    // make a diligent student look slow.
    const s = catchupStanding(
      [
        item({ status: 'done', scheduledDate: '2026-08-01', caughtUpAt: '2026-08-02T10:00:00+05:30' }),
        item({ status: 'done', scheduledDate: '2026-08-01', caughtUpAt: '2026-08-04T10:00:00+05:30' }),
        item({ status: 'done', scheduledDate: '2026-08-01', caughtUpAt: '2027-04-01T10:00:00+05:30' }),
      ],
      TODAY,
    );
    expect(s.medianDaysToClear).toBe(3);
  });

  it('has no median when nothing has been cleared', () => {
    expect(catchupStanding([item()], TODAY).medianDaysToClear).toBeNull();
  });
});

describe('oldestOpenDays', () => {
  it('measures the oldest thing still untouched, not the newest', () => {
    const s = catchupStanding(
      [item({ scheduledDate: '2026-08-06' }), item({ scheduledDate: '2026-07-09' })],
      TODAY,
    );
    expect(s.oldestOpenDays).toBe(30);
  });

  it('ignores the age of classes they have already cleared', () => {
    const s = catchupStanding(
      [item({ status: 'done', scheduledDate: '2026-01-01', caughtUpAt: '2026-01-02T10:00:00+05:30' })],
      TODAY,
    );
    expect(s.oldestOpenDays).toBeNull();
  });
});

describe('unresponsive', () => {
  const chased = '2026-08-01T10:00:00+05:30';

  it('is false when nobody has chased them yet', () => {
    // Silence from a student nobody contacted is our failure, not theirs. This
    // is the difference between a list of people ignoring us and a list of
    // people we forgot.
    const s = catchupStanding([item({ followupSentAt: null })], TODAY);
    expect(s.chasedAt).toBeNull();
    expect(s.unresponsive).toBe(false);
  });

  it('is true when they were chased and have touched nothing since', () => {
    const s = catchupStanding([item({ followupSentAt: chased })], TODAY);
    expect(s.unresponsive).toBe(true);
  });

  it('is false when they watched something after the nudge', () => {
    const s = catchupStanding(
      [item({ followupSentAt: chased, recordingWatchedAt: '2026-08-03T09:00:00+05:30' })],
      TODAY,
    );
    expect(s.unresponsive).toBe(false);
  });

  it('is false when they started a clock after the nudge', () => {
    // activated_on is a DATE, not a timestamp, so it is compared against the
    // IST day of the nudge. Comparing it against the raw ISO string instead
    // makes every date sort before every timestamp and marks a responsive
    // student as ignoring us.
    const s = catchupStanding([item({ followupSentAt: chased, activatedOn: '2026-08-02' })], TODAY);
    expect(s.unresponsive).toBe(false);
  });

  it('treats starting on the same IST day as the nudge as responding', () => {
    // The nudge lands at 10am IST and they open it that afternoon. The only
    // stamp we have is the date, so same-day must read as a response.
    const s = catchupStanding([item({ followupSentAt: chased, activatedOn: '2026-08-01' })], TODAY);
    expect(s.unresponsive).toBe(false);
  });

  it('reads a UTC-stamped nudge in IST when comparing against a date', () => {
    // 2026-08-01T20:00Z is already 2026-08-02 in India. A student who started
    // on the 2nd responded, and slicing the raw ISO string would say otherwise.
    const s = catchupStanding(
      [item({ followupSentAt: '2026-08-01T20:00:00Z', activatedOn: '2026-08-02' })],
      TODAY,
    );
    expect(s.unresponsive).toBe(false);
  });

  it('is false once they have nothing left, however long they ignored us', () => {
    // They finished. Whatever happened before that, they are not ignoring us
    // now, and a finished student must never appear on a chase list.
    const s = catchupStanding(
      [item({ status: 'done', followupSentAt: chased, caughtUpAt: '2026-08-06T10:00:00+05:30' })],
      TODAY,
    );
    expect(s.unresponsive).toBe(false);
  });

  it('is false when the only thing left is blocked on us', () => {
    const s = catchupStanding([item({ status: 'blocked', followupSentAt: chased })], TODAY);
    expect(s.unresponsive).toBe(false);
  });

  it('takes the most recent nudge across every class', () => {
    const s = catchupStanding(
      [
        item({ followupSentAt: '2026-07-01T10:00:00+05:30' }),
        item({ followupSentAt: '2026-08-04T10:00:00+05:30' }),
      ],
      TODAY,
    );
    expect(s.chasedAt).toBe('2026-08-04T10:00:00+05:30');
  });

  it('does not count activity from before the latest nudge', () => {
    // Watching something in July does not answer a nudge sent in August.
    const s = catchupStanding(
      [
        item({
          followupSentAt: '2026-08-04T10:00:00+05:30',
          recordingWatchedAt: '2026-07-02T10:00:00+05:30',
        }),
      ],
      TODAY,
    );
    expect(s.unresponsive).toBe(true);
  });
});

describe('an empty backlog', () => {
  it('reads as clear rather than as missing data', () => {
    const s = catchupStanding([], TODAY);
    expect(s.ownOpen).toBe(0);
    expect(s.lateJoinerOpen).toBe(0);
    expect(s.clearedTotal).toBe(0);
    expect(s.oldestOpenDays).toBeNull();
    expect(s.unresponsive).toBe(false);
  });
});
