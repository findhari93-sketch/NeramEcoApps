/**
 * Unit tests for the timetable window settings parser.
 *
 * The value comes from an admin-editable JSONB column, so parseWindow is the
 * boundary that has to survive anything: a half-saved row, a hand-edited value,
 * or a schema that drifted. It must never throw and never return a window the
 * grid cannot draw.
 */
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_WINDOW,
  describeDays,
  describeWindow,
  parseWindow,
} from './timetable-window';

describe('parseWindow', () => {
  it('accepts a well-formed window', () => {
    expect(parseWindow({ start: '18:30', end: '21:00', days: [1, 2, 3] })).toEqual({
      start: '18:30',
      end: '21:00',
      days: [1, 2, 3],
    });
  });

  it('falls back entirely for null, undefined and non-objects', () => {
    expect(parseWindow(null)).toEqual(DEFAULT_WINDOW);
    expect(parseWindow(undefined)).toEqual(DEFAULT_WINDOW);
    expect(parseWindow('18:00')).toEqual(DEFAULT_WINDOW);
    expect(parseWindow(42)).toEqual(DEFAULT_WINDOW);
  });

  it('repairs only the bad field, keeping the good one', () => {
    const w = parseWindow({ start: '19:00', end: 'half seven', days: [1] });
    expect(w.start).toBe('19:00');
    expect(w.end).toBe(DEFAULT_WINDOW.end);
  });

  it('rejects out-of-range clock values', () => {
    expect(parseWindow({ start: '25:00', end: '21:00' }).start).toBe(DEFAULT_WINDOW.start);
    expect(parseWindow({ start: '18:60', end: '21:00' }).start).toBe(DEFAULT_WINDOW.start);
  });

  it('rejects an unpadded hour, since the grid parses fixed-width HH:MM', () => {
    expect(parseWindow({ start: '9:00', end: '21:00' }).start).toBe(DEFAULT_WINDOW.start);
  });

  it('pushes the end out an hour when it is at or before the start', () => {
    expect(parseWindow({ start: '19:00', end: '19:00' }).end).toBe('20:00');
    expect(parseWindow({ start: '19:00', end: '18:00' }).end).toBe('20:00');
  });

  it('does not push the end past midnight', () => {
    expect(parseWindow({ start: '23:30', end: '23:00' }).end).toBe('23:59');
  });

  it('drops non-integer and out-of-range weekdays', () => {
    expect(parseWindow({ start: '18:00', end: '21:00', days: [0, 1, 8, 'x', 2.5, 3] }).days).toEqual([1, 3]);
  });

  it('de-duplicates and sorts weekdays', () => {
    expect(parseWindow({ start: '18:00', end: '21:00', days: [5, 1, 5, 3, 1] }).days).toEqual([1, 3, 5]);
  });

  it('falls back when every weekday is invalid, so the grid always has a column', () => {
    expect(parseWindow({ start: '18:00', end: '21:00', days: [0, 9] }).days).toEqual(DEFAULT_WINDOW.days);
    expect(parseWindow({ start: '18:00', end: '21:00', days: [] }).days).toEqual(DEFAULT_WINDOW.days);
  });

  it('falls back when days is not an array', () => {
    expect(parseWindow({ start: '18:00', end: '21:00', days: 'weekdays' }).days).toEqual(DEFAULT_WINDOW.days);
  });

  it('never returns a shared reference to the default, so callers cannot mutate it', () => {
    const w = parseWindow(null);
    w.days.push(7);
    expect(DEFAULT_WINDOW.days).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('describeWindow', () => {
  it('drops :00 minutes for a clean label', () => {
    expect(describeWindow({ start: '18:00', end: '21:00', days: [1] })).toBe('6 PM to 9 PM');
  });

  it('keeps non-zero minutes', () => {
    expect(describeWindow({ start: '18:30', end: '21:00', days: [1] })).toBe('6:30 PM to 9 PM');
  });
});

describe('describeDays', () => {
  it('collapses a contiguous run to a range', () => {
    expect(describeDays([1, 2, 3, 4, 5, 6])).toBe('Mon to Sat');
  });

  it('lists a broken run', () => {
    expect(describeDays([1, 3, 5])).toBe('Mon, Wed, Fri');
  });

  it('handles a single day and an empty set', () => {
    expect(describeDays([3])).toBe('Wed');
    expect(describeDays([])).toBe('No days');
  });
});
