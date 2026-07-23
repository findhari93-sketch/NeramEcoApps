/**
 * Unit tests for the weekly schedule importer.
 *
 * This parser reads files a human typed, so the tests are mostly about the
 * messy shapes real spreadsheets take: "7-8 PM" in one cell, Excel serial
 * dates, day-first slashes, headers nobody agreed on. The rule it must never
 * break is that a row it cannot read comes back flagged, never dropped.
 */
import { describe, it, expect } from 'vitest';
import {
  describeParse,
  mapColumns,
  parseDateCell,
  parseTimeRange,
  parseWeekRows,
} from './week-import';

describe('mapColumns', () => {
  it('maps the obvious headers', () => {
    const cols = mapColumns(['Date', 'Class', 'Time', 'Teacher']);
    expect(cols.date).toBe('Date');
    expect(cols.title).toBe('Class');
    expect(cols.start).toBe('Time');
    expect(cols.teacher).toBe('Teacher');
  });

  it('is case and separator insensitive', () => {
    const cols = mapColumns(['CLASS_DATE', 'subject', 'Start_Time', 'Taken By']);
    expect(cols.date).toBe('CLASS_DATE');
    expect(cols.title).toBe('subject');
    expect(cols.start).toBe('Start_Time');
    expect(cols.teacher).toBe('Taken By');
  });

  it('prefers the longer alias, so "End Time" is not read as a start', () => {
    const cols = mapColumns(['Date', 'Class', 'Start Time', 'End Time']);
    expect(cols.start).toBe('Start Time');
    expect(cols.end).toBe('End Time');
  });

  it('never assigns one header to two fields', () => {
    const cols = mapColumns(['Date', 'Class', 'Time']);
    const used = [cols.date, cols.title, cols.start, cols.end, cols.teacher].filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });

  it('returns nothing for headers it does not recognise', () => {
    expect(mapColumns(['foo', 'bar']).date).toBeUndefined();
  });
});

describe('parseDateCell', () => {
  it('reads ISO', () => {
    expect(parseDateCell('2026-07-20', 2026)).toBe('2026-07-20');
  });

  it('reads day-first slashes, the Indian convention', () => {
    // 7 August, not 8 July.
    expect(parseDateCell('07/08/2026', 2026)).toBe('2026-08-07');
    expect(parseDateCell('20-7-2026', 2026)).toBe('2026-07-20');
  });

  it('fills in a missing year from the week being imported', () => {
    expect(parseDateCell('20/07', 2026)).toBe('2026-07-20');
    expect(parseDateCell('20 Jul', 2026)).toBe('2026-07-20');
  });

  it('expands a two-digit year', () => {
    expect(parseDateCell('20/07/26', 2026)).toBe('2026-07-20');
  });

  it('reads month names either way round', () => {
    expect(parseDateCell('Jul 20 2026', 2025)).toBe('2026-07-20');
    expect(parseDateCell('20 July 2026', 2025)).toBe('2026-07-20');
  });

  it('reads an Excel serial number', () => {
    // 46223 is 2026-07-20 on Excel's 1899-12-30 epoch.
    expect(parseDateCell(46223, 2026)).toBe('2026-07-20');
  });

  it('rejects a date that does not exist rather than rolling it over', () => {
    expect(parseDateCell('31/02/2026', 2026)).toBeNull();
    expect(parseDateCell('2026-13-01', 2026)).toBeNull();
  });

  it('returns null for blanks and junk', () => {
    expect(parseDateCell(null, 2026)).toBeNull();
    expect(parseDateCell('', 2026)).toBeNull();
    expect(parseDateCell('sometime next week', 2026)).toBeNull();
  });
});

describe('parseTimeRange', () => {
  it('reads a 24-hour range', () => {
    expect(parseTimeRange('19:00-20:00')).toEqual({ start: '19:00', end: '20:00' });
  });

  it('applies a trailing meridiem to both ends, as people write it', () => {
    expect(parseTimeRange('7-8 PM')).toEqual({ start: '19:00', end: '20:00' });
  });

  it('reads "to" as a range separator', () => {
    expect(parseTimeRange('7:00 PM to 8:30 PM')).toEqual({ start: '19:00', end: '20:30' });
  });

  it('handles en and em dashes, which Excel loves to insert', () => {
    expect(parseTimeRange('7–8 PM')).toEqual({ start: '19:00', end: '20:00' });
    expect(parseTimeRange('7—8 PM')).toEqual({ start: '19:00', end: '20:00' });
  });

  it('reads a bare start time', () => {
    expect(parseTimeRange('7 PM')).toEqual({ start: '19:00', end: null });
    expect(parseTimeRange('19:00')).toEqual({ start: '19:00', end: null });
  });

  it('handles noon and midnight without wrapping', () => {
    expect(parseTimeRange('12 PM').start).toBe('12:00');
    expect(parseTimeRange('12 AM').start).toBe('00:00');
  });

  it('reads an Excel fractional time cell', () => {
    expect(parseTimeRange(0.7916666667).start).toBe('19:00');
  });

  it('does not mistake a date serial for a time', () => {
    expect(parseTimeRange(46223)).toEqual({ start: null, end: null });
  });

  it('returns nulls for junk rather than guessing', () => {
    expect(parseTimeRange('evening')).toEqual({ start: null, end: null });
    expect(parseTimeRange('25:00')).toEqual({ start: null, end: null });
    expect(parseTimeRange('7:99 PM')).toEqual({ start: null, end: null });
    expect(parseTimeRange(null)).toEqual({ start: null, end: null });
  });
});

describe('parseWeekRows', () => {
  const opts = {
    defaultStart: '19:00',
    defaultEnd: '20:00',
    rangeStart: '2026-07-20',
    rangeEnd: '2026-07-26',
  };

  it('parses a clean week', () => {
    const result = parseWeekRows(
      [
        { Date: '2026-07-20', Class: 'Perspective Drawing', Time: '7-8 PM', Teacher: 'Ar. Haribabu' },
        { Date: '2026-07-21', Class: 'Logical Reasoning', Time: '7-8 PM', Teacher: 'Ar. Haribabu' },
      ],
      opts,
    );

    expect(result.fatal).toBeNull();
    expect(result.classCount).toBe(2);
    expect(result.validCount).toBe(2);
    expect(result.entries[0]).toMatchObject({
      row: 2,
      kind: 'class',
      date: '2026-07-20',
      title: 'Perspective Drawing',
      startTime: '19:00',
      endTime: '20:00',
      teacherName: 'Ar. Haribabu',
      issues: [],
    });
  });

  it('falls back to the configured window when there is no time column', () => {
    const result = parseWeekRows([{ Date: '2026-07-20', Class: 'Shading' }], opts);
    expect(result.entries[0].startTime).toBe('19:00');
    expect(result.entries[0].endTime).toBe('20:00');
    expect(result.entries[0].issues).toEqual([]);
  });

  it('recognises a holiday row and does not demand a time for it', () => {
    const result = parseWeekRows(
      [{ Date: '2026-07-22', Class: 'Aadi Perukku', Holiday: 'Yes' }],
      opts,
    );
    expect(result.holidayCount).toBe(1);
    expect(result.entries[0].kind).toBe('holiday');
    expect(result.entries[0].startTime).toBeNull();
    expect(result.entries[0].issues).toEqual([]);
  });

  it('recognises a holiday written into the title with no holiday column', () => {
    const result = parseWeekRows([{ Date: '2026-07-22', Class: 'Holiday, Aadi Perukku' }], opts);
    expect(result.entries[0].kind).toBe('holiday');
  });

  it('flags an unreadable row instead of dropping it', () => {
    const result = parseWeekRows(
      [
        { Date: '2026-07-20', Class: 'Good row', Time: '7-8 PM' },
        { Date: 'whenever', Class: 'Bad row', Time: '7-8 PM' },
      ],
      opts,
    );
    // Both survive, so the preview can show which one needs a look.
    expect(result.entries).toHaveLength(2);
    expect(result.validCount).toBe(1);
    expect(result.entries[1].issues[0]).toMatch(/Could not read the date/);
  });

  it('flags a date outside the week being imported', () => {
    const result = parseWeekRows([{ Date: '2026-09-01', Class: 'Stray', Time: '7-8 PM' }], opts);
    expect(result.entries[0].issues[0]).toMatch(/outside the week/);
  });

  it('flags a class that ends before it starts', () => {
    const result = parseWeekRows([{ Date: '2026-07-20', Class: 'Backwards', Time: '8-7 PM' }], opts);
    expect(result.entries[0].issues.some((i) => /ends .* before it starts/.test(i))).toBe(true);
  });

  it('flags a duplicate slot, which is nearly always a copy-paste slip', () => {
    const result = parseWeekRows(
      [
        { Date: '2026-07-20', Class: 'First', Time: '7-8 PM' },
        { Date: '2026-07-20', Class: 'Second', Time: '7-8 PM' },
      ],
      opts,
    );
    expect(result.entries[0].issues).toEqual([]);
    expect(result.entries[1].issues.some((i) => /Same day and time as row 2/.test(i))).toBe(true);
  });

  it('flags a class with no title', () => {
    const result = parseWeekRows([{ Date: '2026-07-20', Class: '', Time: '7-8 PM' }], opts);
    expect(result.entries[0].issues.some((i) => /no class title/.test(i))).toBe(true);
  });

  it('skips fully blank spacer rows silently', () => {
    const result = parseWeekRows(
      [
        { Date: '2026-07-20', Class: 'Real', Time: '7-8 PM' },
        { Date: '', Class: '', Time: '' },
      ],
      opts,
    );
    expect(result.entries).toHaveLength(1);
  });

  it('reports a sheet with no date column as fatal, not row by row', () => {
    const result = parseWeekRows([{ Class: 'Perspective', Time: '7-8 PM' }], opts);
    expect(result.fatal).toMatch(/No date column/);
    expect(result.entries).toEqual([]);
  });

  it('reports a sheet with no class column as fatal', () => {
    const result = parseWeekRows([{ Date: '2026-07-20', Notes: 'x' }], opts);
    expect(result.fatal).toMatch(/No class column/);
  });

  it('reports an empty file as fatal', () => {
    expect(parseWeekRows([], opts).fatal).toMatch(/no rows/);
  });

  it('never throws on rubbish input', () => {
    expect(() => parseWeekRows(null as any, opts)).not.toThrow();
    expect(() => parseWeekRows([{ Date: {} as any, Class: [] as any }], opts)).not.toThrow();
  });

  it('reports the source row number so the teacher can find it', () => {
    const result = parseWeekRows(
      [
        { Date: '2026-07-20', Class: 'A', Time: '7-8 PM' },
        { Date: '2026-07-21', Class: 'B', Time: '7-8 PM' },
      ],
      opts,
    );
    // Row 1 is the header, so the first data row is 2.
    expect(result.entries.map((e) => e.row)).toEqual([2, 3]);
  });
});

describe('describeParse', () => {
  const base = { entries: [], validCount: 0, fatal: null };

  it('describes both kinds', () => {
    expect(describeParse({ ...base, classCount: 5, holidayCount: 1 })).toBe(
      'Parsed 5 classes and 1 holiday',
    );
  });

  it('uses singular forms', () => {
    expect(describeParse({ ...base, classCount: 1, holidayCount: 0 })).toBe('Parsed 1 class');
  });

  it('handles nothing found', () => {
    expect(describeParse({ ...base, classCount: 0, holidayCount: 0 })).toBe('Nothing to import');
  });
});
