/**
 * Parse a weekly schedule spreadsheet into timetable entries.
 *
 * Teachers already write the week in Excel, so the fastest path from "the week
 * is decided" to "the week is in Nexus" is to drop that file in. Real files are
 * messy: headers vary, dates arrive as text or as Excel serial numbers, and a
 * time cell is as likely to say "7-8 PM" as "19:00".
 *
 * This module never throws and never silently drops a row. Anything it cannot
 * read comes back as an entry carrying `issues`, so the import preview can show
 * the teacher exactly which row needs a look instead of quietly importing four
 * of five classes.
 *
 * Pure TypeScript: no xlsx dependency here, no React. The caller turns the file
 * into rows of plain values; this turns those into entries.
 */

export type RawCell = string | number | boolean | null | undefined;
export type RawRow = Record<string, RawCell>;

export interface ParsedEntry {
  /** 1-based row number in the source sheet, for "row 4 needs a look". */
  row: number;
  kind: 'class' | 'holiday';
  /** YYYY-MM-DD, or null when the date could not be read. */
  date: string | null;
  title: string;
  /** HH:MM, or null for a holiday. */
  startTime: string | null;
  endTime: string | null;
  /** As written in the sheet. Matched to a real user later, server-side. */
  teacherName: string | null;
  /** Human-readable problems. A non-empty list blocks this row from importing. */
  issues: string[];
}

export interface ParseResult {
  entries: ParsedEntry[];
  /** Entries with no issues: the ones that would actually import. */
  validCount: number;
  classCount: number;
  holidayCount: number;
  /** Sheet-level problems, e.g. no recognisable columns at all. */
  fatal: string | null;
}

export interface ParseOptions {
  /** Fallback class times when the sheet has no time column. */
  defaultStart?: string;
  defaultEnd?: string;
  /** Rejects dates far outside the intended week. Both YYYY-MM-DD. */
  rangeStart?: string;
  rangeEnd?: string;
}

// ─── Header matching ─────────────────────────────────────────────────────────

/** Longest match wins, so "end time" beats "time". */
const HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  date: ['date', 'day', 'class date', 'on'],
  title: ['class', 'title', 'subject', 'topic', 'session', 'lesson'],
  start: ['start time', 'from', 'start', 'time', 'timing', 'timings'],
  end: ['end time', 'to', 'end', 'till', 'until'],
  teacher: ['teacher', 'faculty', 'taken by', 'tutor', 'instructor', 'by'],
  holiday: ['holiday', 'no class', 'leave'],
};

interface ColumnMap {
  date?: string;
  title?: string;
  start?: string;
  end?: string;
  teacher?: string;
  holiday?: string;
}

function normaliseHeader(h: string): string {
  return h.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Map sheet headers onto the fields we understand. */
export function mapColumns(headers: string[]): ColumnMap {
  const map: ColumnMap = {};
  const normalised = headers.map((h) => ({ raw: h, norm: normaliseHeader(String(h ?? '')) }));

  for (const field of Object.keys(HEADER_ALIASES) as (keyof ColumnMap)[]) {
    let best: { raw: string; score: number } | null = null;
    for (const { raw, norm } of normalised) {
      if (!norm) continue;
      // Do not let one header fill two fields.
      if (Object.values(map).includes(raw)) continue;
      for (const alias of HEADER_ALIASES[field]) {
        const hit = norm === alias || norm.includes(alias);
        if (hit && (!best || alias.length > best.score)) {
          best = { raw, score: alias.length };
        }
      }
    }
    if (best) map[field] = best.raw;
  }

  return map;
}

// ─── Dates ───────────────────────────────────────────────────────────────────

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const probe = new Date(Date.UTC(y, m - 1, d));
  // Rejects 31 Feb and friends, which Date would silently roll over.
  if (probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Read a date cell.
 *
 * Handles ISO text, d/m/y and d-m-y text, "20 Jul" / "Jul 20" with an optional
 * year, and Excel serial numbers (days since 1899-12-30, the epoch Excel
 * actually uses once its 1900 leap-year bug is accounted for).
 *
 * @param fallbackYear Used when the sheet omits the year, which weekly
 *   schedules usually do.
 */
export function parseDateCell(value: RawCell, fallbackYear: number): string | null {
  if (value == null || value === '') return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 1 || value > 60000) return null;
    const ms = Math.round(value) * 86_400_000;
    const d = new Date(Date.UTC(1899, 11, 30) + ms);
    return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  const text = String(value).trim();
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return toIso(+iso[1], +iso[2], +iso[3]);

  // Day-first, matching Indian convention: 07/08 is 7 August, not 8 July.
  const slash = text.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (slash) {
    let year = slash[3] ? +slash[3] : fallbackYear;
    if (year < 100) year += 2000;
    return toIso(year, +slash[2], +slash[1]);
  }

  const lower = text.toLowerCase();
  const monthIdx = MONTHS.findIndex((m) => lower.includes(m));
  if (monthIdx >= 0) {
    const dayMatch = lower.match(/\b(\d{1,2})\b/);
    const yearMatch = lower.match(/\b(20\d{2})\b/);
    if (dayMatch) {
      return toIso(yearMatch ? +yearMatch[1] : fallbackYear, monthIdx + 1, +dayMatch[1]);
    }
  }

  return null;
}

// ─── Times ───────────────────────────────────────────────────────────────────

/** One clock reading to minutes past midnight, honouring an am/pm hint. */
function readClock(raw: string, meridiemHint: 'am' | 'pm' | null): number | null {
  const m = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;

  let hour = +m[1];
  const minute = m[2] ? +m[2] : 0;
  const meridiem = (m[3]?.toLowerCase() as 'am' | 'pm' | undefined) ?? meridiemHint;

  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === 'pm' && hour !== 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }

  return hour * 60 + minute;
}

function minutesToHHMM(mins: number): string {
  return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
}

export interface TimeRange {
  start: string | null;
  end: string | null;
}

/**
 * Read a time cell that may hold a whole range.
 *
 * Accepts "7-8 PM", "7:00 PM to 8:00 PM", "19:00-20:00", en/em dashes, and a
 * bare start like "7 PM". A meridiem on only the end ("7-8 PM") applies to both
 * ends, which is how people actually write it.
 *
 * Excel time cells arrive as a fraction of a day; those are handled too.
 */
export function parseTimeRange(value: RawCell): TimeRange {
  if (value == null || value === '') return { start: null, end: null };

  if (typeof value === 'number' && Number.isFinite(value)) {
    // A time-only cell is 0..1. Anything else is a date, not a time.
    if (value < 0 || value >= 1) return { start: null, end: null };
    return { start: minutesToHHMM(Math.round(value * 24 * 60)), end: null };
  }

  const text = String(value)
    .replace(/[‐-―−]/g, '-') // hyphens, en/em dash, minus
    .replace(/\bto\b/gi, '-')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return { start: null, end: null };

  const parts = text.split('-').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { start: null, end: null };

  // "7-8 PM": the meridiem sits on the last part but governs both.
  const trailing = parts[parts.length - 1].match(/(am|pm)\s*$/i);
  const hint = trailing ? (trailing[1].toLowerCase() as 'am' | 'pm') : null;

  const start = readClock(parts[0], hint);
  const end = parts.length > 1 ? readClock(parts[1], hint) : null;

  return {
    start: start == null ? null : minutesToHHMM(start),
    end: end == null ? null : minutesToHHMM(end),
  };
}

// ─── Row parsing ─────────────────────────────────────────────────────────────

function cellText(row: RawRow, key: string | undefined): string {
  if (!key) return '';
  const v = row[key];
  return v == null ? '' : String(v).trim();
}

const HOLIDAY_WORDS = /^(y|yes|true|1|holiday|no class)$/i;

/**
 * Turn sheet rows into timetable entries.
 *
 * @param rows Objects keyed by header, e.g. from XLSX.utils.sheet_to_json.
 */
export function parseWeekRows(rows: RawRow[], options: ParseOptions = {}): ParseResult {
  const empty: ParseResult = {
    entries: [],
    validCount: 0,
    classCount: 0,
    holidayCount: 0,
    fatal: null,
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ...empty, fatal: 'That file has no rows in it.' };
  }

  const headers = Object.keys(rows[0] ?? {});
  const cols = mapColumns(headers);

  if (!cols.date) {
    return {
      ...empty,
      fatal:
        'No date column found. Add a column headed Date (or Day) so each class can be placed on a day.',
    };
  }
  if (!cols.title && !cols.holiday) {
    return {
      ...empty,
      fatal: 'No class column found. Add a column headed Class (or Subject) with the topic.',
    };
  }

  const fallbackYear = options.rangeStart
    ? Number(options.rangeStart.slice(0, 4))
    : new Date().getFullYear();

  const entries: ParsedEntry[] = [];

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 for zero-index, +1 for the header row

    const title = cellText(row, cols.title);
    const holidayCell = cellText(row, cols.holiday);
    const teacher = cellText(row, cols.teacher) || null;
    const dateRaw = cols.date ? row[cols.date] : null;

    // A row that is blank everywhere is spacing, not an error.
    if (!title && !holidayCell && (dateRaw == null || dateRaw === '')) return;

    const isHoliday =
      HOLIDAY_WORDS.test(holidayCell) ||
      /\bholiday\b/i.test(title) ||
      /\bno class\b/i.test(title);

    const issues: string[] = [];

    const date = parseDateCell(dateRaw, fallbackYear);
    if (!date) {
      issues.push(
        `Could not read the date "${dateRaw ?? ''}". Use a format like 2026-07-20 or 20 Jul.`,
      );
    } else if (options.rangeStart && options.rangeEnd) {
      if (date < options.rangeStart || date > options.rangeEnd) {
        issues.push(`${date} is outside the week you are importing into.`);
      }
    }

    let startTime: string | null = null;
    let endTime: string | null = null;

    if (!isHoliday) {
      const fromStart = parseTimeRange(cols.start ? row[cols.start] : null);
      const fromEnd = parseTimeRange(cols.end ? row[cols.end] : null);

      startTime = fromStart.start ?? options.defaultStart ?? null;
      // The end can come from the same cell ("7-8 PM") or its own column.
      endTime = fromStart.end ?? fromEnd.start ?? fromEnd.end ?? options.defaultEnd ?? null;

      if (!startTime) {
        issues.push('Could not read a start time, and no default is configured.');
      }
      if (startTime && endTime && endTime <= startTime) {
        issues.push(`The class ends (${endTime}) before it starts (${startTime}).`);
      }
      if (!title) {
        issues.push('This row has no class title.');
      }
    }

    entries.push({
      row: rowNumber,
      kind: isHoliday ? 'holiday' : 'class',
      date,
      title: title || (isHoliday ? 'Holiday' : ''),
      startTime,
      endTime,
      teacherName: teacher,
      issues,
    });
  });

  // Two classes at the same time on the same day is nearly always a copy-paste
  // slip in the sheet, and importing both quietly creates a mess to undo.
  const seen = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== 'class' || !e.date || !e.startTime) continue;
    const key = `${e.date} ${e.startTime}`;
    const first = seen.get(key);
    if (first != null) {
      e.issues.push(`Same day and time as row ${first}.`);
    } else {
      seen.set(key, e.row);
    }
  }

  return {
    entries,
    validCount: entries.filter((e) => e.issues.length === 0).length,
    classCount: entries.filter((e) => e.kind === 'class').length,
    holidayCount: entries.filter((e) => e.kind === 'holiday').length,
    fatal: null,
  };
}

/** "Parsed 5 classes and 1 holiday", the preview's headline. */
export function describeParse(result: ParseResult): string {
  const bits: string[] = [];
  if (result.classCount > 0) {
    bits.push(`${result.classCount} ${result.classCount === 1 ? 'class' : 'classes'}`);
  }
  if (result.holidayCount > 0) {
    bits.push(`${result.holidayCount} ${result.holidayCount === 1 ? 'holiday' : 'holidays'}`);
  }
  if (bits.length === 0) return 'Nothing to import';
  return `Parsed ${bits.join(' and ')}`;
}
