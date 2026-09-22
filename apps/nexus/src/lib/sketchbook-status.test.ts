import { describe, it, expect } from 'vitest';
import {
  RHYTHM_STATUS_LABEL,
  clampDates,
  proratedGoal,
  quietClock,
  reminderChannelLabel,
  reminderSummary,
  rhythmStatus,
  trackingStart,
  twoWeekStrip,
  type RhythmStatusInput,
} from './sketchbook-status';

// 2026-09-16 is a Wednesday. Its week starts Monday 2026-09-14.
const WED = '2026-09-16';

const base = (over: Partial<RhythmStatusInput> = {}): RhythmStatusInput => ({
  dates: [],
  today: WED,
  start: '2026-09-01',
  goal: 3,
  enrolledOn: '2026-06-01',
  run: 0,
  autoRemindersThisCycle: 0,
  ...over,
});

describe('trackingStart', () => {
  it('takes the latest of launch, enrolment and return from dormant', () => {
    expect(trackingStart({ classroomStartedOn: '2026-09-12', enrolledAt: '2026-06-01T04:00:00Z' })).toBe('2026-09-12');
    expect(trackingStart({ classroomStartedOn: '2026-09-12', enrolledAt: '2026-09-14T04:00:00Z' })).toBe('2026-09-14');
    expect(
      trackingStart({ classroomStartedOn: '2026-09-12', enrolledAt: '2026-06-01T04:00:00Z', reactivatedOn: '2026-09-15' }),
    ).toBe('2026-09-15');
  });

  it('reads the enrolment timestamp as an IST date', () => {
    // 20:00 UTC on the 13th is 01:30 IST on the 14th.
    expect(trackingStart({ classroomStartedOn: '2026-09-12', enrolledAt: '2026-09-13T20:00:00Z' })).toBe('2026-09-14');
  });
});

describe('clampDates', () => {
  it('drops days before tracking started and after today, dedupes and sorts', () => {
    expect(clampDates(['2026-09-15', '2026-09-10', '2026-09-15', '2026-09-20', '2026-09-12'], '2026-09-12', WED)).toEqual([
      '2026-09-12',
      '2026-09-15',
    ]);
  });
});

describe('quietClock', () => {
  it('counts from the last drawing', () => {
    expect(quietClock('2026-09-01', '2026-09-13', WED)).toEqual({ since: '2026-09-13', quietDays: 3 });
  });
  it('counts from the tracking start when the student never drew', () => {
    expect(quietClock('2026-09-14', null, WED)).toEqual({ since: '2026-09-14', quietDays: 2 });
  });
  it('ignores a drawing from before the tracking start', () => {
    expect(quietClock('2026-09-15', '2026-09-10', WED)).toEqual({ since: '2026-09-15', quietDays: 1 });
  });
});

describe('proratedGoal', () => {
  it('is the full goal when tracking started before the week', () => {
    expect(proratedGoal(3, '2026-09-14', '2026-09-01')).toBe(3);
  });
  it('shrinks for a week that started late, never below 1', () => {
    // Saturday start leaves 2 of 7 days: ceil(3 * 2 / 7) = 1.
    expect(proratedGoal(3, '2026-09-07', '2026-09-12')).toBe(1);
    // Wednesday start leaves 5 of 7 days: ceil(3 * 5 / 7) = 3.
    expect(proratedGoal(3, '2026-09-14', WED)).toBe(3);
    expect(proratedGoal(5, '2026-09-14', '2026-09-19')).toBe(2);
  });
});

describe('twoWeekStrip', () => {
  it('covers last Monday to this Sunday with the right states', () => {
    const strip = twoWeekStrip(['2026-09-12', '2026-09-15'], WED, '2026-09-10');
    expect(strip).toHaveLength(14);
    expect(strip[0]).toMatchObject({ date: '2026-09-07', state: 'before_start' });
    expect(strip[3]).toMatchObject({ date: '2026-09-10', state: 'missed' });
    expect(strip[5]).toMatchObject({ date: '2026-09-12', state: 'drew' });
    expect(strip[8]).toMatchObject({ date: '2026-09-15', state: 'drew' });
    expect(strip[9]).toMatchObject({ date: WED, state: 'open', today: true });
    expect(strip[13]).toMatchObject({ date: '2026-09-20', state: 'future' });
  });
  it('marks today as drew once there is a drawing', () => {
    expect(twoWeekStrip([WED], WED, '2026-09-01')[9]).toMatchObject({ state: 'drew', today: true });
  });
});

describe('rhythmStatus', () => {
  it('a quiet 2 days is not yet a nudge, a quiet 3 days is', () => {
    const two = rhythmStatus(base({ dates: ['2026-09-14'] }));
    expect(two.status).not.toBe('needs_nudge');
    const three = rhythmStatus(base({ dates: ['2026-09-13'] }));
    expect(three.status).toBe('needs_nudge');
    expect(three.label).toBe('Quiet 3 days');
  });

  it('never "8 weeks": a student who never drew counts from the tracking start', () => {
    const r = rhythmStatus(base({ start: '2026-09-12' }));
    expect(r.status).toBe('needs_nudge');
    expect(r.label).toBe('No drawing yet, 4 days');
    expect(r.quietDays).toBe(4);
  });

  it('not started, with New this week for a recent joiner', () => {
    expect(rhythmStatus(base({ start: '2026-09-15' })).label).toBe('Not started yet');
    const joiner = rhythmStatus(base({ start: '2026-09-15', enrolledOn: '2026-09-15' }));
    expect(joiner.status).toBe('not_started');
    expect(joiner.label).toBe('New this week');
  });

  it('goal met, with the run when it is more than one week', () => {
    const met = rhythmStatus(base({ dates: ['2026-09-14', '2026-09-15', WED], run: 1 }));
    expect(met.status).toBe('on_track');
    expect(met.label).toBe('Goal met');
    expect(met.week).toEqual({ count: 3, goal: 3 });
    expect(rhythmStatus(base({ dates: ['2026-09-14', '2026-09-15', WED], run: 4 })).label).toBe('4 weeks running');
  });

  it('behind when the pace for the week has slipped', () => {
    // Saturday with one day drawn: five days gone, so 2 were due by now.
    const sat = rhythmStatus(base({ today: '2026-09-19', dates: ['2026-09-18'] }));
    expect(sat.status).toBe('behind');
    expect(sat.label).toBe('Behind, 1 of 3');
  });

  it('on track early in the week', () => {
    const mon = rhythmStatus(base({ today: '2026-09-14', dates: ['2026-09-13'] }));
    expect(mon.status).toBe('on_track');
    expect(mon.label).toBe('On track');
  });

  it('needs a call after three ignored reminders and 9 quiet days', () => {
    const r = rhythmStatus(base({ dates: ['2026-09-07'], autoRemindersThisCycle: 3 }));
    expect(r.status).toBe('needs_call');
    expect(r.label).toBe('Needs a call');
  });

  it('prorates the goal for a class that started this week', () => {
    const r = rhythmStatus(base({ today: '2026-09-19', start: '2026-09-19', dates: ['2026-09-19'] }));
    expect(r.week).toEqual({ count: 1, goal: 1 });
    expect(r.status).toBe('on_track');
  });

  it('never uses a dash in any label', () => {
    const labels = [
      ...Object.values(RHYTHM_STATUS_LABEL),
      rhythmStatus(base()).label,
      rhythmStatus(base({ dates: ['2026-09-13'] })).label,
      rhythmStatus(base({ today: '2026-09-19', dates: ['2026-09-18'] })).label,
    ];
    for (const l of labels) expect(l).not.toMatch(/[–—]|--/);
  });
});

describe('reminderSummary: was this quiet student reminded?', () => {
  const facts = (over: Partial<Parameters<typeof reminderSummary>[0]> = {}) => ({
    status: 'needs_nudge' as const,
    sentThisCycle: 0,
    lastSentOn: null,
    lastChannel: null,
    ...over,
  });

  it('says so plainly when a quiet student was never reminded', () => {
    expect(reminderSummary(facts())).toBe('Not reminded yet');
    expect(reminderSummary(facts({ status: 'needs_call' }))).toBe('Not reminded yet');
  });

  it('stays silent for students who are not due a reminder', () => {
    for (const status of ['on_track', 'behind', 'not_started'] as const) {
      expect(reminderSummary(facts({ status }))).toBeNull();
    }
  });

  it('counts the reminders in this quiet stretch and names the last day and channel', () => {
    expect(reminderSummary(facts({ sentThisCycle: 1, lastSentOn: '2026-09-20', lastChannel: 'chat+inapp' })))
      .toMatch(/^Reminded once, last 20 Sept?, Teams chat$/);
    expect(reminderSummary(facts({ sentThisCycle: 2, lastSentOn: '2026-09-20', lastChannel: 'teams+inapp' })))
      .toMatch(/^Reminded 2 times, last 20 Sept?, Teams alert$/);
  });

  it('leaves the channel off when the send never recorded one', () => {
    expect(reminderSummary(facts({ sentThisCycle: 1, lastSentOn: '2026-09-20', lastChannel: null })))
      .toMatch(/^Reminded once, last 20 Sept?$/);
  });

  it('never uses a dash', () => {
    const lines = [
      reminderSummary(facts()),
      reminderSummary(facts({ sentThisCycle: 3, lastSentOn: '2026-09-21', lastChannel: 'failed' })),
    ];
    for (const l of lines) expect(l).not.toMatch(/[–—]|--/);
  });
});

describe('reminderChannelLabel', () => {
  it('names the channel that actually landed, chat first', () => {
    expect(reminderChannelLabel('chat+inapp')).toBe('Teams chat');
    expect(reminderChannelLabel('chat')).toBe('Teams chat');
    expect(reminderChannelLabel('teams+inapp')).toBe('Teams alert');
    expect(reminderChannelLabel('inapp')).toBe('Nexus bell only');
    expect(reminderChannelLabel('failed')).toBe('not delivered');
    expect(reminderChannelLabel(null)).toBeNull();
    expect(reminderChannelLabel('')).toBeNull();
  });
});
