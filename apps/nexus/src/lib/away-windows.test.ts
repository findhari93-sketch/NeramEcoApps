import { describe, expect, it } from 'vitest';
import {
  addDaysYmd,
  covers,
  coveringWindow,
  daysBetweenYmd,
  eachDayYmd,
  defaultReviewOn,
  describeWindow,
  formatDay,
  groupByStudent,
  isActive,
  overlaps,
  reviewOverdue,
  loadAwayWindows,
  sortWindows,
  type AwayWindow,
} from './away-windows';

function win(over: Partial<AwayWindow> & Pick<AwayWindow, 'id' | 'starts_on'>): AwayWindow {
  return {
    student_id: 'stu-1',
    ends_on: null,
    reason_code: 'clash',
    reason_note: null,
    source: 'student',
    cancelled_at: null,
    created_at: '2026-10-01T00:00:00Z',
    ...over,
  };
}

/** The quarterly exam fortnight this feature exists for. */
const EXAMS = win({ id: 'w1', starts_on: '2026-10-10', ends_on: '2026-10-20' });

describe('covers', () => {
  it('includes both ends of the window', () => {
    expect(covers(EXAMS, '2026-10-10')).toBe(true);
    expect(covers(EXAMS, '2026-10-20')).toBe(true);
  });

  it('excludes the days either side', () => {
    expect(covers(EXAMS, '2026-10-09')).toBe(false);
    expect(covers(EXAMS, '2026-10-21')).toBe(false);
  });

  it('runs forever when there is no return date', () => {
    const openEnded = win({ id: 'w2', starts_on: '2026-03-01', ends_on: null });
    expect(covers(openEnded, '2026-03-01')).toBe(true);
    expect(covers(openEnded, '2027-12-25')).toBe(true);
    expect(covers(openEnded, '2026-02-28')).toBe(false);
  });

  it('stops covering once the student ends it early', () => {
    const cancelled = { ...EXAMS, cancelled_at: '2026-10-14T09:00:00Z' };
    expect(isActive(cancelled)).toBe(false);
    expect(covers(cancelled, '2026-10-15')).toBe(false);
  });

  it('crossing a month or a year boundary is still a plain string compare', () => {
    const newYear = win({ id: 'w3', starts_on: '2026-12-28', ends_on: '2027-01-04' });
    expect(covers(newYear, '2026-12-31')).toBe(true);
    expect(covers(newYear, '2027-01-01')).toBe(true);
    expect(covers(newYear, '2027-01-05')).toBe(false);
  });
});

describe('overlaps', () => {
  it('is true when the windows share even one day', () => {
    expect(overlaps(EXAMS, { starts_on: '2026-10-20', ends_on: '2026-10-30' })).toBe(true);
    expect(overlaps(EXAMS, { starts_on: '2026-10-01', ends_on: '2026-10-10' })).toBe(true);
  });

  it('is false for windows that merely touch end to end', () => {
    expect(overlaps(EXAMS, { starts_on: '2026-10-21', ends_on: '2026-10-30' })).toBe(false);
    expect(overlaps(EXAMS, { starts_on: '2026-10-01', ends_on: '2026-10-09' })).toBe(false);
  });

  it('treats an open-ended window as swallowing everything after its start', () => {
    const openEnded = { starts_on: '2026-10-15', ends_on: null };
    expect(overlaps(EXAMS, openEnded)).toBe(true);
    expect(overlaps({ starts_on: '2030-01-01', ends_on: null }, openEnded)).toBe(true);
    expect(overlaps({ starts_on: '2026-01-01', ends_on: '2026-10-14' }, openEnded)).toBe(false);
  });
});

describe('coveringWindow', () => {
  it('returns null when no window covers the day', () => {
    expect(coveringWindow([EXAMS], '2026-11-01')).toBeNull();
  });

  it('ignores cancelled windows even when they cover the day', () => {
    const cancelled = { ...EXAMS, cancelled_at: '2026-10-11T00:00:00Z' };
    expect(coveringWindow([cancelled], '2026-10-15')).toBeNull();
  });

  /**
   * The reason this function exists rather than a `.find()`. Two overlapping
   * windows must not be able to hand the register one answer and the parent view
   * another for the same night, whatever order the database returned the rows in.
   */
  it('picks the same window under overlap whatever order the rows arrive in', () => {
    const early = win({ id: 'b', starts_on: '2026-10-10', ends_on: '2026-10-20' });
    const late = win({ id: 'a', starts_on: '2026-10-14', ends_on: '2026-10-24' });
    expect(coveringWindow([early, late], '2026-10-15')?.id).toBe('b');
    expect(coveringWindow([late, early], '2026-10-15')?.id).toBe('b');
  });

  it('breaks a tie on the same start date by when it was declared', () => {
    const first = win({ id: 'z', starts_on: '2026-10-10', ends_on: '2026-10-20', created_at: '2026-09-01T00:00:00Z' });
    const second = win({ id: 'a', starts_on: '2026-10-10', ends_on: '2026-10-25', created_at: '2026-09-05T00:00:00Z' });
    expect(coveringWindow([second, first], '2026-10-15')?.id).toBe('z');
  });

  it('breaks a tie on start and declaration by id, so the answer is never arbitrary', () => {
    const a = win({ id: 'aaa', starts_on: '2026-10-10', ends_on: '2026-10-20' });
    const b = win({ id: 'bbb', starts_on: '2026-10-10', ends_on: '2026-10-20' });
    expect(coveringWindow([b, a], '2026-10-15')?.id).toBe('aaa');
    expect(coveringWindow([a, b], '2026-10-15')?.id).toBe('aaa');
  });

  it('does not mutate the array it was given', () => {
    const rows = [win({ id: 'b', starts_on: '2026-10-14' }), win({ id: 'a', starts_on: '2026-10-10' })];
    coveringWindow(rows, '2026-10-15');
    expect(rows.map((r) => r.id)).toEqual(['b', 'a']);
    expect(sortWindows(rows).map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('groupByStudent', () => {
  it('keys each student to their own windows in sorted order', () => {
    const rows = [
      win({ id: 'x2', student_id: 'stu-1', starts_on: '2026-11-01' }),
      win({ id: 'y1', student_id: 'stu-2', starts_on: '2026-10-05' }),
      win({ id: 'x1', student_id: 'stu-1', starts_on: '2026-10-10' }),
    ];
    const byStudent = groupByStudent(rows);
    expect(byStudent.get('stu-1')?.map((w) => w.id)).toEqual(['x1', 'x2']);
    expect(byStudent.get('stu-2')?.map((w) => w.id)).toEqual(['y1']);
    expect(byStudent.get('stu-3')).toBeUndefined();
  });
});

describe('formatDay', () => {
  it('reads a date the way a teacher would say it', () => {
    expect(formatDay('2026-10-20')).toBe('20 Oct');
    expect(formatDay('2026-01-01')).toBe('1 Jan');
    expect(formatDay('2026-12-31')).toBe('31 Dec');
  });

  it('returns empty rather than NaN for anything that is not a date', () => {
    expect(formatDay(null)).toBe('');
    expect(formatDay('')).toBe('');
    expect(formatDay('not-a-date')).toBe('');
    expect(formatDay('2026-13-01')).toBe('');
  });
});

describe('the review date', () => {
  it('reviews a closed window on the day it ends', () => {
    expect(defaultReviewOn('2026-10-10', '2026-10-20')).toBe('2026-10-20');
  });

  it('gives an open-ended window a horizon a month out', () => {
    expect(defaultReviewOn('2026-10-10', null)).toBe('2026-11-09');
  });

  it('crosses a month and a year end without drifting', () => {
    expect(defaultReviewOn('2026-12-20', null)).toBe('2027-01-19');
  });

  it('goes overdue only after the review date has passed', () => {
    const openEnded = win({ id: 'w', starts_on: '2026-10-10', ends_on: null });
    expect(reviewOverdue(openEnded, '2026-11-09')).toBe(false);
    expect(reviewOverdue(openEnded, '2026-11-10')).toBe(true);
  });

  it('never calls a cancelled window overdue', () => {
    const cancelled = win({
      id: 'w',
      starts_on: '2026-10-10',
      ends_on: null,
      cancelled_at: '2026-10-12T00:00:00Z',
    });
    expect(reviewOverdue(cancelled, '2027-06-01')).toBe(false);
  });

  /**
   * The load-bearing half of the review rule. A stale window changes what the
   * standing view says and never what the register says, or a register opened in
   * December would give a different answer about October than it gave in October.
   */
  it('does not stop the window covering its days once it is overdue', () => {
    const openEnded = win({ id: 'w', starts_on: '2026-10-10', ends_on: null });
    expect(reviewOverdue(openEnded, '2027-06-01')).toBe(true);
    expect(covers(openEnded, '2027-05-30')).toBe(true);
    expect(coveringWindow([openEnded], '2027-05-30')?.id).toBe('w');
  });
});

describe('describeWindow', () => {
  it('counts an open-ended window from when it started, so it cannot hide', () => {
    const openEnded = win({ id: 'w', starts_on: '2026-10-03', ends_on: null });
    expect(describeWindow(openEnded, '2026-11-06')).toBe('Away since 3 Oct, no return date yet');
  });

  it('reads a future open-ended window as upcoming', () => {
    const openEnded = win({ id: 'w', starts_on: '2026-12-01', ends_on: null });
    expect(describeWindow(openEnded, '2026-11-06')).toBe('Away from 1 Dec, no return date yet');
  });

  it('gives a return date once the window has started', () => {
    expect(describeWindow(EXAMS, '2026-10-15')).toBe('Away until 20 Oct');
  });

  it('gives both ends before the window starts', () => {
    expect(describeWindow(EXAMS, '2026-10-01')).toBe('Away 10 Oct to 20 Oct');
  });

  /**
   * The month is repeated rather than collapsed to "10 to 20 Oct", because the
   * collapsed form is only correct while both ends share a month and silently
   * lies the moment a window crosses one.
   */
  it('keeps both months when the window crosses one', () => {
    const newYear = win({ id: 'w', starts_on: '2026-12-28', ends_on: '2027-01-04' });
    expect(describeWindow(newYear, '2026-12-01')).toBe('Away 28 Dec to 4 Jan');
  });

  it('treats the first day of the window as already started', () => {
    expect(describeWindow(EXAMS, '2026-10-10')).toBe('Away until 20 Oct');
  });
});

describe('loadAwayWindows, when the table is not there yet', () => {
  const q = (error: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'is', 'in', 'lte', 'or']) b[m] = () => b;
    b.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: null, error }).then(f);
    return { from: () => b };
  };

  /**
   * deploy-nexus does not depend on deploy-db-production, so the app can go
   * live a minute before the migration lands. Without this, that minute 500s
   * the attendance register, the class screen and the parent portal.
   */
  it('reads as empty rather than taking three screens down', async () => {
    await expect(loadAwayWindows(q({ code: '42P01' }) as never)).resolves.toEqual([]);
    await expect(loadAwayWindows(q({ code: 'PGRST205' }) as never)).resolves.toEqual([]);
  });

  /**
   * Every other error still throws. Those ones CAN be false: a read that fails
   * or truncates renders a student who told us in advance as "missed, no
   * reason", the exact falsehood this feature exists to stop telling.
   */
  it('still throws on any other error', async () => {
    await expect(loadAwayWindows(q({ code: '57014', message: 'timeout' }) as never)).rejects.toBeTruthy();
    await expect(loadAwayWindows(q({ message: 'connection reset' }) as never)).rejects.toBeTruthy();
  });

  it('does not query at all for an empty student list', async () => {
    await expect(
      loadAwayWindows(q({ code: '42P01' }) as never, { studentIds: [] }),
    ).resolves.toEqual([]);
  });
});

describe('daysBetweenYmd', () => {
  it('is zero across the same day', () => {
    expect(daysBetweenYmd('2026-09-22', '2026-09-22')).toBe(0);
  });

  it('counts adjacent days as one', () => {
    expect(daysBetweenYmd('2026-09-22', '2026-09-23')).toBe(1);
  });

  it('crosses a month boundary without losing a day', () => {
    expect(daysBetweenYmd('2026-09-28', '2026-10-02')).toBe(4);
  });

  it('crosses a year boundary', () => {
    expect(daysBetweenYmd('2026-12-30', '2027-01-02')).toBe(3);
  });

  // A one-day window drawn on a range that starts after it is the case the bar
  // has to clamp rather than render backwards.
  it('goes negative when the second date is earlier', () => {
    expect(daysBetweenYmd('2026-09-23', '2026-09-22')).toBe(-1);
  });

  it('returns zero rather than NaN for something that is not a date', () => {
    expect(daysBetweenYmd('not-a-date', '2026-09-22')).toBe(0);
  });
});

describe('walking the calendar, which the forward planner does', () => {
  it('steps a day at a time across a month boundary', () => {
    expect(addDaysYmd('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDaysYmd('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('steps across a year boundary and backwards', () => {
    expect(addDaysYmd('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysYmd('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('includes both ends of the range', () => {
    expect(eachDayYmd('2026-09-20', '2026-09-23')).toEqual([
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
    ]);
  });

  it('returns the single day when both ends are the same', () => {
    expect(eachDayYmd('2026-09-20', '2026-09-20')).toEqual(['2026-09-20']);
  });

  it('returns nothing for an inverted or missing range rather than spinning', () => {
    expect(eachDayYmd('2026-09-23', '2026-09-20')).toEqual([]);
    expect(eachDayYmd('', '2026-09-20')).toEqual([]);
  });

  it('stops at the cap, so an unbounded span cannot build an unbounded list', () => {
    expect(eachDayYmd('2026-01-01', '2026-12-31', 10)).toHaveLength(10);
    expect(eachDayYmd('2026-01-01', '2026-12-31', 10)[9]).toBe('2026-01-10');
  });

  it('crosses a DST-style boundary without repeating or skipping a day', () => {
    // Every date is built at UTC midnight, so a local-time shift cannot land
    // twice on the same day. This is the bug the module exists to have stopped.
    const days = eachDayYmd('2026-03-28', '2026-03-31');
    expect(days).toEqual(['2026-03-28', '2026-03-29', '2026-03-30', '2026-03-31']);
    expect(new Set(days).size).toBe(4);
  });
});
