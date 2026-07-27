/**
 * Unit tests for the calendar's date maths: anchored weeks, month grids, the
 * fetch-range widening and the toolbar labels.
 *
 * These back the Day / Week / Month navigation. The band geometry they sit
 * beside is covered in date-utils.test.ts, which must keep passing untouched:
 * getWeekDates is now a delegate to getWeekDatesFor, so parity between the two
 * is asserted here explicitly.
 */
import { describe, it, expect } from 'vitest';
import {
  addDays,
  addMonths,
  formatDateISO,
  formatRangeLabel,
  formatTimeCompact,
  getMonthGrid,
  getWeekDates,
  getWeekDatesFor,
  isSameDay,
  isSameMonth,
  isoWeekday,
  monthGridRangeFor,
  startOfDay,
  startOfMonth,
} from './date-utils';

// July 2026 is the fixture month throughout: 1 July is a Wednesday, so it has
// both leading and trailing spill days.
const JUL_2026 = new Date(2026, 6, 15);

describe('startOfDay / addDays', () => {
  it('normalises to local midnight', () => {
    const d = startOfDay(new Date(2026, 6, 15, 23, 45, 30, 500));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  it('rolls over a month boundary', () => {
    expect(formatDateISO(addDays(new Date(2026, 6, 31), 1))).toBe('2026-08-01');
  });

  it('rolls back over a year boundary', () => {
    expect(formatDateISO(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
  });

  it('does not mutate its input', () => {
    const original = new Date(2026, 6, 15);
    addDays(original, 10);
    expect(original.getDate()).toBe(15);
  });
});

describe('addMonths', () => {
  it('clamps 31 January to the end of February', () => {
    expect(formatDateISO(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
  });

  it('clamps backwards too', () => {
    expect(formatDateISO(addMonths(new Date(2026, 2, 31), -1))).toBe('2026-02-28');
  });

  it('clamps to 29 February in a leap year', () => {
    expect(formatDateISO(addMonths(new Date(2028, 0, 31), 1))).toBe('2028-02-29');
  });

  it('crosses a year boundary without drifting', () => {
    expect(formatDateISO(addMonths(new Date(2026, 11, 15), 1))).toBe('2027-01-15');
    expect(formatDateISO(addMonths(new Date(2026, 0, 15), -1))).toBe('2025-12-15');
  });

  it('keeps the day when the target month is long enough', () => {
    expect(formatDateISO(addMonths(new Date(2026, 6, 15), 3))).toBe('2026-10-15');
  });
});

describe('startOfMonth / isSameMonth / isSameDay', () => {
  it('returns the 1st at local midnight', () => {
    const d = startOfMonth(new Date(2026, 6, 27, 18, 0));
    expect(formatDateISO(d)).toBe('2026-07-01');
    expect(d.getHours()).toBe(0);
  });

  it('compares month and year together, not month alone', () => {
    expect(isSameMonth(new Date(2026, 6, 1), new Date(2026, 6, 31))).toBe(true);
    expect(isSameMonth(new Date(2026, 6, 1), new Date(2027, 6, 1))).toBe(false);
  });

  it('compares whole days regardless of time', () => {
    expect(isSameDay(new Date(2026, 6, 15, 0, 1), new Date(2026, 6, 15, 23, 59))).toBe(true);
    expect(isSameDay(new Date(2026, 6, 15), new Date(2026, 6, 16))).toBe(false);
  });
});

describe('getWeekDatesFor', () => {
  it('returns the containing week when anchored on a Monday', () => {
    // Mon 20 Jul 2026
    const week = getWeekDatesFor(new Date(2026, 6, 20));
    expect(week.start).toBe('2026-07-20');
    expect(week.end).toBe('2026-07-26');
  });

  it('anchored on a Sunday, returns the week that STARTED six days earlier', () => {
    // Sun 26 Jul 2026 belongs to the 20-26 week, not to 27 Jul onwards.
    const week = getWeekDatesFor(new Date(2026, 6, 26));
    expect(week.start).toBe('2026-07-20');
    expect(week.end).toBe('2026-07-26');
  });

  it('anchored mid-week, still starts on Monday', () => {
    const week = getWeekDatesFor(new Date(2026, 6, 23)); // Thu
    expect(week.start).toBe('2026-07-20');
    expect(isoWeekday(week.allDays[0])).toBe(1);
  });

  it('ignores the time of day on the anchor', () => {
    expect(getWeekDatesFor(new Date(2026, 6, 23, 23, 59)).start).toBe('2026-07-20');
  });

  it('honours a custom weekday set', () => {
    const week = getWeekDatesFor(new Date(2026, 6, 23), [1, 3, 5]);
    expect(week.days.map(isoWeekday)).toEqual([1, 3, 5]);
    // The query range still spans the full week.
    expect(week.allDays).toHaveLength(7);
    expect(week.end).toBe('2026-07-26');
  });

  it('agrees with getWeekDates(0), which now delegates to it', () => {
    const viaOffset = getWeekDates(0);
    const viaAnchor = getWeekDatesFor(startOfDay(new Date()));
    expect(viaAnchor.start).toBe(viaOffset.start);
    expect(viaAnchor.end).toBe(viaOffset.end);
    expect(viaAnchor.label).toBe(viaOffset.label);
    expect(viaAnchor.days.map(formatDateISO)).toEqual(viaOffset.days.map(formatDateISO));
  });
});

describe('getMonthGrid', () => {
  it('starts every row on a Monday', () => {
    const grid = getMonthGrid(JUL_2026);
    for (const row of grid.weeks) expect(isoWeekday(row[0])).toBe(1);
  });

  it('includes leading spill days when the month does not start on a Monday', () => {
    // 1 Jul 2026 is a Wednesday, so the grid opens on Mon 29 Jun.
    const grid = getMonthGrid(JUL_2026);
    expect(grid.start).toBe('2026-06-29');
  });

  it('has no spill when the month starts on a Monday', () => {
    // 1 Jun 2026 is a Monday.
    const grid = getMonthGrid(new Date(2026, 5, 15));
    expect(grid.start).toBe('2026-06-01');
  });

  it('contains every date of the target month exactly once', () => {
    const grid = getMonthGrid(JUL_2026);
    const inMonth = grid.days.filter((d) => isSameMonth(d, grid.monthStart));
    expect(inMonth).toHaveLength(31);
    expect(new Set(inMonth.map(formatDateISO)).size).toBe(31);
  });

  it('always produces 5 or 6 whole weeks, never 4 or 7', () => {
    for (const year of [2026, 2028]) {
      for (let month = 0; month < 12; month++) {
        const grid = getMonthGrid(new Date(year, month, 15));
        expect(grid.weeks.length, `${year}-${month + 1}`).toBeGreaterThanOrEqual(5);
        expect(grid.weeks.length, `${year}-${month + 1}`).toBeLessThanOrEqual(6);
        expect(grid.days).toHaveLength(grid.weeks.length * 7);
      }
    }
  });

  it('needs 6 rows when the spill plus the month exceeds 35 cells', () => {
    // 1 Aug 2026 is a Saturday: 5 leading spill days + 31 = 36, so 6 rows.
    expect(getMonthGrid(new Date(2026, 7, 15)).weeks.length).toBe(6);
  });

  it('needs only 5 rows for February 2026, despite the full week of spill', () => {
    // 1 Feb 2026 is a Sunday, the worst case for a Monday-first grid: 6 leading
    // spill days. 6 + 28 = 34, which still fits in 35 cells.
    expect(getMonthGrid(new Date(2026, 1, 15)).weeks.length).toBe(5);
  });

  it('covers a leap February', () => {
    const grid = getMonthGrid(new Date(2028, 1, 15));
    const inMonth = grid.days.filter((d) => isSameMonth(d, grid.monthStart));
    expect(inMonth).toHaveLength(29);
  });

  it('exposes start and end as the first and last CELL, so spill classes are fetched', () => {
    const grid = getMonthGrid(JUL_2026);
    expect(grid.start).toBe(formatDateISO(grid.days[0]));
    expect(grid.end).toBe(formatDateISO(grid.days[grid.days.length - 1]));
    expect(grid.end > '2026-07-31').toBe(true);
  });

  it('labels the month in full', () => {
    expect(getMonthGrid(JUL_2026).label).toBe('July 2026');
  });

  it('ignores the anchor day, only the month matters', () => {
    expect(getMonthGrid(new Date(2026, 6, 1)).start).toBe(getMonthGrid(new Date(2026, 6, 31)).start);
  });
});

describe('monthGridRangeFor', () => {
  const july = getMonthGrid(JUL_2026);

  it('is the anchor month grid for a week inside that month', () => {
    expect(monthGridRangeFor(new Date(2026, 6, 23), '2026-07-20', '2026-07-26')).toEqual({
      start: july.start,
      end: july.end,
    });
  });

  /**
   * The caching property this exists for. Every view of the same month has to
   * produce an identical range, or switching week to month refetches, which is
   * exactly the cost this is meant to avoid.
   */
  it('gives an identical range for every day, week and month view of one month', () => {
    const anchor = new Date(2026, 6, 15);
    const cases: Array<[string, string]> = [
      ['2026-07-15', '2026-07-15'], // day
      ['2026-07-13', '2026-07-19'], // its week
      ['2026-07-06', '2026-07-12'], // another week
      [july.start, july.end], // the month grid itself, spill included
    ];
    for (const [start, end] of cases) {
      expect(monthGridRangeFor(anchor, start, end)).toEqual({ start: july.start, end: july.end });
    }
  });

  it('is a fixed point: feeding its own output back changes nothing', () => {
    const anchor = new Date(2026, 6, 15);
    const once = monthGridRangeFor(anchor, '2026-07-20', '2026-07-26');
    expect(monthGridRangeFor(anchor, once.start, once.end)).toEqual(once);
  });

  it('widens when the visible week straddles into the next month', () => {
    // Mon 27 Jul to Sun 2 Aug 2026, anchored in July.
    const range = monthGridRangeFor(new Date(2026, 6, 27), '2026-07-27', '2026-08-02');
    expect(range.start).toBe(july.start);
    expect(range.end >= '2026-08-02').toBe(true);
  });

  it('always covers the visible range', () => {
    for (const [anchor, start, end] of [
      [new Date(2026, 6, 1), '2026-06-29', '2026-07-05'],
      [new Date(2026, 11, 31), '2026-12-28', '2027-01-03'],
      [new Date(2026, 1, 1), '2026-02-01', '2026-02-01'],
    ] as Array<[Date, string, string]>) {
      const range = monthGridRangeFor(anchor, start, end);
      expect(range.start <= start, `${start} not covered`).toBe(true);
      expect(range.end >= end, `${end} not covered`).toBe(true);
    }
  });

  it('moves to a new range once the anchor crosses into another month', () => {
    const inJuly = monthGridRangeFor(new Date(2026, 6, 15), '2026-07-13', '2026-07-19');
    const inAugust = monthGridRangeFor(new Date(2026, 7, 15), '2026-08-10', '2026-08-16');
    expect(inAugust).not.toEqual(inJuly);
  });
});

describe('formatRangeLabel', () => {
  const week = (startY: number, startM: number, startD: number) => {
    const first = new Date(startY, startM, startD);
    return Array.from({ length: 7 }, (_, i) => addDays(first, i));
  };

  it('spells out a single day', () => {
    const { label, shortLabel } = formatRangeLabel('day', [new Date(2026, 6, 27)]);
    expect(label).toBe('Monday, 27 July 2026');
    expect(shortLabel).toBe('Mon, 27 Jul');
  });

  it('names the month for a month range', () => {
    const { label, shortLabel } = formatRangeLabel('month', getMonthGrid(JUL_2026).days);
    expect(label).toBe('July 2026');
    expect(shortLabel).toBe('Jul 2026');
  });

  it('collapses a week inside one month', () => {
    const { label, shortLabel } = formatRangeLabel('week', week(2026, 6, 20));
    expect(label).toBe('20 to 26 July 2026');
    expect(shortLabel).toBe('20-26 Jul');
  });

  it('spells out both months when a week straddles them', () => {
    // Mon 29 Jun to Sun 5 Jul 2026.
    const { label, shortLabel } = formatRangeLabel('week', week(2026, 5, 29));
    expect(label).toBe('29 June to 5 July 2026');
    expect(shortLabel).toBe('29 Jun - 5 Jul');
  });

  it('spells out both years when a week straddles them', () => {
    // Mon 28 Dec 2026 to Sun 3 Jan 2027.
    const { label, shortLabel } = formatRangeLabel('week', week(2026, 11, 28));
    expect(label).toBe('28 December 2026 to 3 January 2027');
    expect(shortLabel).toBe('28 Dec 2026 - 3 Jan 2027');
  });

  it('treats agenda as a week', () => {
    expect(formatRangeLabel('agenda', week(2026, 6, 20)).label).toBe(
      formatRangeLabel('week', week(2026, 6, 20)).label,
    );
  });

  it('survives an empty range', () => {
    expect(formatRangeLabel('week', [])).toEqual({ label: '', shortLabel: '' });
  });
});

describe('formatTimeCompact', () => {
  it('drops the :00 on the hour', () => {
    expect(formatTimeCompact('19:00')).toBe('7 PM');
    expect(formatTimeCompact('09:00')).toBe('9 AM');
  });

  it('keeps the minutes when there are any', () => {
    expect(formatTimeCompact('19:30')).toBe('7:30 PM');
    expect(formatTimeCompact('09:05')).toBe('9:05 AM');
  });

  it('handles noon and midnight', () => {
    expect(formatTimeCompact('12:00')).toBe('12 PM');
    expect(formatTimeCompact('00:00')).toBe('12 AM');
  });

  it('tolerates seconds on the input', () => {
    expect(formatTimeCompact('19:00:00')).toBe('7 PM');
  });

  it('returns unparseable input unchanged rather than printing NaN', () => {
    expect(formatTimeCompact('')).toBe('');
    expect(formatTimeCompact('later')).toBe('later');
  });
});
