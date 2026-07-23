/**
 * Unit tests for the timetable date and band utilities.
 *
 * The band maths is what makes an evening-only calendar readable, so the
 * geometry and the auto-expand escape hatch are covered directly.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WINDOW,
  BREAK_HEIGHT,
  GRID_PAD_TOP,
  PX_PER_HOUR,
  blockGeometry,
  effectiveWeekdays,
  formatCountdown,
  formatDateISO,
  formatHourLabel,
  formatTime,
  getWeekDates,
  hourOffset,
  isoWeekday,
  resolveBand,
  timeToMinutes,
} from './date-utils';

describe('formatDateISO', () => {
  it('formats a local date without shifting to UTC', () => {
    // 1 Jan 2026 00:30 local. toISOString() would report 2025-12-31 in IST.
    expect(formatDateISO(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
  });

  it('zero-pads month and day', () => {
    expect(formatDateISO(new Date(2026, 6, 5))).toBe('2026-07-05');
  });
});

describe('isoWeekday', () => {
  it('maps Monday to 1', () => {
    expect(isoWeekday(new Date(2026, 6, 20))).toBe(1); // Mon 20 Jul 2026
  });

  it('maps Sunday to 7, not 0', () => {
    expect(isoWeekday(new Date(2026, 6, 26))).toBe(7);
  });
});

describe('getWeekDates', () => {
  it('drops Sunday from columns but keeps it in the query range', () => {
    const week = getWeekDates(0);
    expect(week.allDays).toHaveLength(7);
    expect(week.days).toHaveLength(6);
    expect(week.days.every((d) => isoWeekday(d) !== 7)).toBe(true);
    // The range still spans Monday to Sunday so a Sunday class is fetched.
    expect(isoWeekday(new Date(week.end + 'T00:00:00'))).toBe(7);
  });

  it('honours a custom weekday set', () => {
    const week = getWeekDates(0, [1, 3, 5]);
    expect(week.days.map(isoWeekday)).toEqual([1, 3, 5]);
  });

  it('offsets whole weeks', () => {
    const thisWeek = getWeekDates(0);
    const nextWeek = getWeekDates(1);
    const diffDays =
      (new Date(nextWeek.start).getTime() - new Date(thisWeek.start).getTime()) / 86_400_000;
    expect(diffDays).toBe(7);
  });

  it('starts the week on Monday regardless of today', () => {
    expect(isoWeekday(getWeekDates(0).allDays[0])).toBe(1);
  });
});

describe('effectiveWeekdays', () => {
  it('returns the configured set when no class falls outside it', () => {
    expect(effectiveWeekdays([1, 2, 3], [{ scheduled_date: '2026-07-21' }])).toEqual([1, 2, 3]);
  });

  it('adds Sunday back when a class is scheduled on it', () => {
    // 26 Jul 2026 is a Sunday.
    expect(effectiveWeekdays([1, 2, 3, 4, 5, 6], [{ scheduled_date: '2026-07-26' }])).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  it('does not duplicate a day that is already configured', () => {
    expect(effectiveWeekdays([1], [{ scheduled_date: '2026-07-20' }])).toEqual([1]);
  });

  it('ignores unparseable dates', () => {
    expect(effectiveWeekdays([1, 2], [{ scheduled_date: 'not-a-date' }])).toEqual([1, 2]);
  });

  it('stays sorted', () => {
    expect(effectiveWeekdays([6, 1], [{ scheduled_date: '2026-07-22' }])).toEqual([1, 3, 6]);
  });
});

describe('timeToMinutes', () => {
  it('parses HH:MM', () => {
    expect(timeToMinutes('19:30')).toBe(1170);
  });

  it('ignores a seconds component, as Postgres TIME returns', () => {
    expect(timeToMinutes('19:30:00')).toBe(1170);
  });

  it('returns NaN for junk', () => {
    expect(Number.isNaN(timeToMinutes('not-a-time'))).toBe(true);
  });
});

describe('formatHourLabel / formatTime', () => {
  it('formats the evening hours', () => {
    expect(formatHourLabel(18)).toBe('6 PM');
    expect(formatHourLabel(19)).toBe('7 PM');
  });

  it('formats noon and midnight without a zero hour', () => {
    expect(formatHourLabel(12)).toBe('12 PM');
    expect(formatHourLabel(0)).toBe('12 AM');
  });

  it('formats a full time', () => {
    expect(formatTime('19:00')).toBe('7:00 PM');
    expect(formatTime('07:05')).toBe('7:05 AM');
  });
});

describe('resolveBand', () => {
  const cls = (start_time: string, end_time: string) => ({ start_time, end_time });

  it('uses the configured window when every class fits', () => {
    const band = resolveBand(DEFAULT_WINDOW, [cls('19:00', '20:00')]);
    expect(band.startMin).toBe(18 * 60);
    expect(band.endMin).toBe(21 * 60);
    expect(band.expandedFor).toBe(0);
  });

  it('lists whole hours for the gutter', () => {
    expect(resolveBand(DEFAULT_WINDOW, []).hours).toEqual([18, 19, 20, 21]);
  });

  it('sizes the cell from the window, not the classes', () => {
    // Top padding + 3 hours of band + bottom slack.
    expect(resolveBand(DEFAULT_WINDOW, []).cellHeight).toBe(GRID_PAD_TOP + 3 * PX_PER_HOUR + 10);
  });

  it('produces a single segment for a plain evening window', () => {
    expect(resolveBand(DEFAULT_WINDOW, []).segments).toHaveLength(1);
  });

  it('expands downward for an early class rather than hiding it', () => {
    const band = resolveBand(DEFAULT_WINDOW, [cls('10:00', '11:00')]);
    expect(band.startMin).toBe(10 * 60);
    expect(band.expandedFor).toBe(1);
  });

  it('expands upward for a late class', () => {
    const band = resolveBand(DEFAULT_WINDOW, [cls('21:30', '22:30')]);
    expect(band.endMin).toBe(23 * 60); // rounded out to the next whole hour
    expect(band.expandedFor).toBe(1);
  });

  it('counts each outside class once, not once per boundary', () => {
    const band = resolveBand(DEFAULT_WINDOW, [cls('06:00', '23:00')]);
    expect(band.expandedFor).toBe(1);
  });

  it('rounds an expansion out to whole hours', () => {
    const band = resolveBand(DEFAULT_WINDOW, [cls('17:20', '20:00')]);
    expect(band.startMin).toBe(17 * 60);
  });

  it('skips classes with unparseable times instead of throwing', () => {
    const band = resolveBand(DEFAULT_WINDOW, [cls('bad', 'worse')]);
    expect(band.startMin).toBe(18 * 60);
    expect(band.expandedFor).toBe(0);
  });

  it('falls back to the default window when the setting is malformed', () => {
    const band = resolveBand({ start: '', end: '', days: [1] }, []);
    expect(band.startMin).toBe(18 * 60);
    expect(band.endMin).toBe(21 * 60);
  });

  it('never produces a zero-height band', () => {
    const band = resolveBand({ start: '20:00', end: '20:00', days: [1] }, []);
    expect(band.endMin).toBeGreaterThan(band.startMin);
    expect(band.cellHeight).toBeGreaterThan(0);
  });
});

describe('resolveBand with a split day (crash course)', () => {
  const SPLIT = [
    { start: '09:00', end: '12:30', label: 'Morning' },
    { start: '18:00', end: '20:00', label: 'Evening' },
  ];

  it('keeps morning and evening as separate segments', () => {
    const band = resolveBand(SPLIT, []);
    expect(band.segments).toHaveLength(2);
    expect(band.segments[0].label).toBe('Morning');
    expect(band.segments[1].label).toBe('Evening');
  });

  it('collapses the dead afternoon instead of drawing it', () => {
    const split = resolveBand(SPLIT, []);
    // 9 AM to 8 PM drawn as one band would be 11 hours tall.
    const asOneWideBand = 11 * PX_PER_HOUR;
    expect(split.cellHeight).toBeLessThan(asOneWideBand);
    // It is the two bands (3.5h + 2h) plus one break, not the gap itself.
    expect(split.cellHeight).toBe(GRID_PAD_TOP + 5.5 * PX_PER_HOUR + BREAK_HEIGHT + 10);
  });

  it('offsets the evening segment below the break', () => {
    const band = resolveBand(SPLIT, []);
    const [morning, evening] = band.segments;
    expect(evening.offset).toBe(morning.offset + morning.height + BREAK_HEIGHT);
  });

  it('reports the outer bounds across both segments', () => {
    const band = resolveBand(SPLIT, []);
    expect(band.startMin).toBe(9 * 60);
    expect(band.endMin).toBe(20 * 60);
  });

  it('merges bands that touch, so there is no empty break', () => {
    const band = resolveBand(
      [
        { start: '09:00', end: '12:00' },
        { start: '12:00', end: '14:00' },
      ],
      [],
    );
    expect(band.segments).toHaveLength(1);
  });

  it('merges bands that overlap, so they never draw on top of each other', () => {
    const band = resolveBand(
      [
        { start: '09:00', end: '13:00' },
        { start: '12:00', end: '14:00' },
      ],
      [],
    );
    expect(band.segments).toHaveLength(1);
    expect(band.segments[0].endMin).toBe(14 * 60);
  });

  it('expands the nearest band for an out-of-hours class, counting it once', () => {
    const band = resolveBand(SPLIT, [{ start_time: '20:30', end_time: '21:30' }]);
    expect(band.expandedFor).toBe(1);
    // The evening band grew; the morning one is untouched.
    expect(band.segments[1].endMin).toBeGreaterThanOrEqual(21 * 60 + 30);
    expect(band.segments[0].endMin).toBe(12 * 60 + 30);
  });

  it('merges segments when an expansion closes the gap between them', () => {
    const band = resolveBand(SPLIT, [{ start_time: '12:00', end_time: '19:00' }]);
    expect(band.segments).toHaveLength(1);
  });
});

describe('blockGeometry across a split day', () => {
  const band = resolveBand(
    [
      { start: '09:00', end: '12:30' },
      { start: '18:00', end: '20:00' },
    ],
    [],
  );

  it('places a morning class in the morning segment', () => {
    const g = blockGeometry('10:00', '11:00', band);
    expect(g.top).toBe(band.segments[0].offset + PX_PER_HOUR);
  });

  it('places an evening class below the break, not at the raw clock offset', () => {
    const g = blockGeometry('18:00', '19:00', band);
    expect(g.top).toBe(band.segments[1].offset);
    // Were the day drawn as one continuous band, 6 PM would sit 9 hours down.
    expect(g.top).toBeLessThan(9 * PX_PER_HOUR);
  });

  it('keeps a class inside its own segment, never bleeding across the break', () => {
    const g = blockGeometry('11:00', '19:00', band);
    const morning = band.segments[0];
    expect(g.top + g.height).toBeLessThanOrEqual(morning.offset + morning.height + 1);
  });

  it('snaps a class landing in the gap to the nearest segment', () => {
    expect(() => blockGeometry('14:00', '15:00', band)).not.toThrow();
    const g = blockGeometry('14:00', '15:00', band);
    expect(g.height).toBeGreaterThan(0);
  });
});

describe('hourOffset', () => {
  it('puts the first hour at the top padding', () => {
    const band = resolveBand(DEFAULT_WINDOW, []);
    expect(hourOffset(18, band)).toBe(GRID_PAD_TOP);
  });

  it('places an evening hour relative to its own segment on a split day', () => {
    const band = resolveBand(
      [
        { start: '09:00', end: '12:30' },
        { start: '18:00', end: '20:00' },
      ],
      [],
    );
    expect(hourOffset(18, band)).toBe(band.segments[1].offset);
  });

  it('advances one hour per PX_PER_HOUR', () => {
    const band = resolveBand(DEFAULT_WINDOW, []);
    expect(hourOffset(19, band)).toBe(GRID_PAD_TOP + PX_PER_HOUR);
    expect(hourOffset(20, band)).toBe(GRID_PAD_TOP + 2 * PX_PER_HOUR);
  });
});

describe('blockGeometry', () => {
  const band = resolveBand(DEFAULT_WINDOW, []);

  it('aligns a 7 PM class with the 7 PM gutter line', () => {
    expect(blockGeometry('19:00', '20:00', band).top).toBe(hourOffset(19, band));
  });

  it('sizes a one-hour class to one hour less the gap', () => {
    expect(blockGeometry('19:00', '20:00', band).height).toBe(PX_PER_HOUR - 4);
  });

  it('sizes a 90-minute class proportionally', () => {
    expect(blockGeometry('19:00', '20:30', band).height).toBe(1.5 * PX_PER_HOUR - 4);
  });

  it('handles a half-hour start', () => {
    expect(blockGeometry('19:30', '20:30', band).top).toBe(GRID_PAD_TOP + 1.5 * PX_PER_HOUR);
  });

  it('clamps a class that starts before the band', () => {
    const g = blockGeometry('17:00', '19:00', band);
    expect(g.top).toBe(GRID_PAD_TOP);
    expect(g.height).toBeGreaterThan(0);
  });

  it('clamps a class that runs past the band end', () => {
    const g = blockGeometry('20:00', '23:00', band);
    expect(g.top + g.height).toBeLessThanOrEqual(band.cellHeight);
  });

  it('gives a zero-length class a visible minimum height', () => {
    expect(blockGeometry('19:00', '19:00', band).height).toBeGreaterThanOrEqual(18);
  });

  it('does not throw on unparseable times', () => {
    expect(() => blockGeometry('bad', 'worse', band)).not.toThrow();
  });
});

describe('formatCountdown', () => {
  const from = new Date('2026-07-23T14:48:00+05:30');

  it('formats hours and minutes', () => {
    expect(formatCountdown(new Date('2026-07-23T19:00:00+05:30'), from)).toBe('4h 12m');
  });

  it('drops to minutes only inside the hour', () => {
    expect(formatCountdown(new Date('2026-07-23T15:20:00+05:30'), from)).toBe('32m');
  });

  it('formats days out', () => {
    expect(formatCountdown(new Date('2026-07-25T19:00:00+05:30'), from)).toBe('2d 4h');
  });

  it('returns null once the class has started', () => {
    expect(formatCountdown(new Date('2026-07-23T14:00:00+05:30'), from)).toBeNull();
  });

  it('returns null at exactly the start instant', () => {
    expect(formatCountdown(from, from)).toBeNull();
  });
});
