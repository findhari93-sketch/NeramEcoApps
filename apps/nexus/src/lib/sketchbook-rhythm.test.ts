import { describe, it, expect } from 'vitest';
import {
  istDate, weekStart, addDays, goalForWeek, computeRhythm, thenAndNow, milestoneReached, rhythmLine,
  practiceDate, isValidTimeZone, lastWeekLine, weekRangeLabel,
} from './sketchbook-rhythm';

// 2026-09-09 is a Wednesday.
const TODAY = '2026-09-09';
const MON = '2026-09-07';
const NO_HISTORY: never[] = [];

describe('istDate', () => {
  it('rolls a late-evening UTC timestamp into the next IST day', () => {
    expect(istDate('2026-09-08T19:30:00.000Z')).toBe('2026-09-09');
  });
  it('keeps an afternoon timestamp on the same day', () => {
    expect(istDate('2026-09-09T06:00:00.000Z')).toBe('2026-09-09');
  });
});

describe('practiceDate (the student\'s own clock, 4 am rollover)', () => {
  // NXS-0129: uploaded 2026-09-23 18:44 UTC. 12:14 am Thursday in IST, 10:44 pm Wednesday in Dubai.
  const UPLOAD = '2026-09-23T18:44:37.312Z';
  it('puts a Dubai student\'s Wednesday night sketch on Wednesday', () => {
    expect(practiceDate(UPLOAD, 'Asia/Dubai')).toBe('2026-09-23');
  });
  it('counts an upload before 4 am IST for the evening before', () => {
    expect(practiceDate(UPLOAD, 'Asia/Kolkata')).toBe('2026-09-23');
    expect(practiceDate(UPLOAD)).toBe('2026-09-23');
  });
  it('starts the new day at 4 am', () => {
    expect(practiceDate('2026-09-23T22:29:00.000Z', 'Asia/Kolkata')).toBe('2026-09-23'); // 3:59 am
    expect(practiceDate('2026-09-23T22:31:00.000Z', 'Asia/Kolkata')).toBe('2026-09-24'); // 4:01 am
  });
  it('follows a student in America', () => {
    // 11 pm Wednesday in New York is Thursday morning in India.
    expect(practiceDate('2026-09-24T03:00:00.000Z', 'America/New_York')).toBe('2026-09-23');
  });
  it('falls back to IST for a missing or unknown zone', () => {
    expect(practiceDate('2026-09-24T06:00:00.000Z', null)).toBe('2026-09-24');
    expect(practiceDate('2026-09-24T06:00:00.000Z', 'Not/AZone')).toBe('2026-09-24');
  });
  it('validates zone names', () => {
    expect(isValidTimeZone('Asia/Dubai')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});

describe('lastWeek and the card lines', () => {
  it('keeps last Sunday\'s drawings visible after the week turns over (NXS-0129)', () => {
    const r = computeRhythm(['2026-09-20', '2026-09-23'], '2026-09-24', NO_HISTORY);
    expect(r.today).toBe('2026-09-24');
    expect(r.week.start).toBe('2026-09-21');
    expect(r.week.count).toBe(1);
    expect(r.lastWeek?.start).toBe('2026-09-14');
    expect(r.lastWeek?.count).toBe(1);
    expect(lastWeekLine(r)).toBe('Last week: 1 of 3 days.');
  });
  it('says when last week met its goal', () => {
    const r = computeRhythm(['2026-09-14', '2026-09-16', '2026-09-20'], '2026-09-24', NO_HISTORY);
    expect(lastWeekLine(r)).toBe('Last week: 3 of 3 days. Goal met.');
  });
  it('has no last-week line when last week was not tracked', () => {
    const r = computeRhythm([], '2026-09-24', NO_HISTORY);
    expect(lastWeekLine({ ...r, lastWeek: null })).toBeNull();
  });
  it('labels the week with real dates', () => {
    expect(weekRangeLabel('2026-09-21')).toBe('21 to 27 Sep');
    expect(weekRangeLabel('2026-09-28')).toBe('28 Sep to 4 Oct');
  });
});

describe('weekStart', () => {
  it('returns the Monday for a Wednesday', () => expect(weekStart(TODAY)).toBe(MON));
  it('returns the same day for a Monday', () => expect(weekStart(MON)).toBe(MON));
  it('returns the previous Monday for a Sunday', () => expect(weekStart('2026-09-13')).toBe(MON));
});

describe('goalForWeek', () => {
  it('falls back to 3 with no history', () => expect(goalForWeek(MON, NO_HISTORY)).toBe(3));
  it('uses the latest change at or before the week start', () => {
    const history = [
      { effectiveFrom: '2026-08-03', goal: 3 },
      { effectiveFrom: '2026-09-07', goal: 4 },
    ];
    expect(goalForWeek('2026-08-31', history)).toBe(3);
    expect(goalForWeek('2026-09-07', history)).toBe(4);
    expect(goalForWeek('2026-09-14', history)).toBe(4);
  });
});

describe('computeRhythm', () => {
  it('describes an empty sketchbook without a run or a quiet count', () => {
    const r = computeRhythm([], TODAY, NO_HISTORY);
    expect(r.week.days).toEqual([false, false, false, false, false, false, false]);
    expect(r.week.count).toBe(0);
    expect(r.run).toBe(0);
    expect(r.bestRun).toBe(0);
    expect(r.totalDays).toBe(0);
    expect(r.lastPracticeDate).toBeNull();
    expect(r.quietDays).toBeNull();
  });

  it('marks this week\'s dots and counts several sketches on one day once', () => {
    const r = computeRhythm(['2026-09-07', '2026-09-07', '2026-09-09'], TODAY, NO_HISTORY);
    expect(r.week.days).toEqual([true, false, true, false, false, false, false]);
    expect(r.week.count).toBe(2);
    expect(r.week.met).toBe(false);
    expect(r.totalDays).toBe(2);
    expect(r.quietDays).toBe(0);
  });

  it('counts a run of past weeks that met the goal and adds this week once it is met', () => {
    const dates = [
      // week of 24 Aug: 3 days
      '2026-08-24', '2026-08-26', '2026-08-28',
      // week of 31 Aug: 3 days
      '2026-08-31', '2026-09-02', '2026-09-04',
      // this week so far: 2 days
      '2026-09-07', '2026-09-08',
    ];
    const r = computeRhythm(dates, TODAY, NO_HISTORY);
    expect(r.run).toBe(2);
    expect(r.bestRun).toBe(2);
    const met = computeRhythm([...dates, '2026-09-09'], TODAY, NO_HISTORY);
    expect(met.week.met).toBe(true);
    expect(met.run).toBe(3);
    expect(met.bestRun).toBe(3);
  });

  it('ends the run at the first past week that missed the goal, but keeps the best run', () => {
    const dates = [
      '2026-08-10', '2026-08-12', '2026-08-14',   // met
      '2026-08-17', '2026-08-19', '2026-08-21',   // met
      '2026-08-24',                               // missed
      '2026-08-31', '2026-09-02', '2026-09-04',   // met
    ];
    const r = computeRhythm(dates, TODAY, NO_HISTORY);
    expect(r.run).toBe(1);
    expect(r.bestRun).toBe(2);
  });

  it('judges each past week by the goal in force at its start', () => {
    const dates = ['2026-08-31', '2026-09-02', '2026-09-04', '2026-09-07', '2026-09-08', '2026-09-09'];
    const history = [{ effectiveFrom: '2026-09-07', goal: 4 }];
    const r = computeRhythm(dates, TODAY, history);
    expect(r.week.goal).toBe(4);
    expect(r.week.met).toBe(false);
    expect(r.run).toBe(1); // last week still counts under its goal of 3
  });

  it('reports quiet days since the last practice', () => {
    const r = computeRhythm(['2026-09-01'], TODAY, NO_HISTORY);
    expect(r.lastPracticeDate).toBe('2026-09-01');
    expect(r.quietDays).toBe(8);
  });
});

describe('thenAndNow', () => {
  const s = (d: string) => ({ submitted_at: `${d}T10:00:00.000Z` });
  it('needs eight sketches spanning thirty days', () => {
    expect(thenAndNow([s('2026-08-01'), s('2026-09-05')])).toBeNull();
    const eight = ['01', '02', '03', '04', '05', '06', '07', '08'].map((d) => s(`2026-09-${d}`));
    expect(thenAndNow(eight)).toBeNull();
  });
  it('returns the earliest and the latest', () => {
    const list = [
      s('2026-07-01'), s('2026-07-05'), s('2026-07-09'), s('2026-07-15'),
      s('2026-08-01'), s('2026-08-10'), s('2026-08-20'), s('2026-09-05'),
    ];
    const r = thenAndNow([...list].reverse());
    expect(r?.first.submitted_at).toBe('2026-07-01T10:00:00.000Z');
    expect(r?.latest.submitted_at).toBe('2026-09-05T10:00:00.000Z');
  });
});

describe('milestoneReached', () => {
  it('fires only on the exact counts', () => {
    expect(milestoneReached(6)).toBeNull();
    expect(milestoneReached(7)).toBe(7);
    expect(milestoneReached(30)).toBe(30);
    expect(milestoneReached(100)).toBe(100);
    expect(milestoneReached(31)).toBeNull();
  });
});

describe('rhythmLine', () => {
  it('invites a new student rather than scoring zero', () => {
    expect(rhythmLine(computeRhythm([], TODAY, NO_HISTORY))).toBe('Start your rhythm. 3 practice days a week is the goal.');
  });
  it('counts the week and names the run', () => {
    const dates = ['2026-08-31', '2026-09-02', '2026-09-04', '2026-09-07', '2026-09-08', '2026-09-09'];
    expect(rhythmLine(computeRhythm(dates, TODAY, NO_HISTORY))).toBe('3 of 3 days this week. Good rhythm, 2 weeks running.');
    expect(rhythmLine(computeRhythm(['2026-09-07'], TODAY, NO_HISTORY))).toBe('1 of 3 days this week.');
  });
});
