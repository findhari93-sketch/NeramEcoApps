/**
 * Dates a student types: "tomorrow", "next friday", "8 Oct to 12 Oct", "for 3
 * days". English only in M1; Tamil and Hindi forms are a later task. Pure.
 */
import { addDaysYmd, dayOfWeek, todayIst } from './format';

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
};

const pad = (n: number) => String(n).padStart(2, '0');

function ymd(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const s = `${y}-${pad(m)}-${pad(d)}`;
  // Reject 31 Feb and friends: a real date round-trips.
  return new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s ? s : null;
}

/**
 * Parse a day-month with optional year. Used by both parseSingleDate and parseDateRange.
 * @param text Trimmed, lowercase text.
 * @param year If provided, use this year; if null, use today's year but may roll forward.
 * @param mode 'single' uses the standard past-date rollover; 'rangeStart' uses the 60-day threshold
 * @returns Parsed date with appropriate rollover logic, or null.
 */
function parseDayMonth(
  text: string,
  today: string,
  opts: { year?: number | null; mode?: 'single' | 'rangeStart' } = {},
): string | null {
  const { year: explicitYear, mode = 'single' } = opts;
  const thisYear = Number(today.slice(0, 4));

  // "8 oct", "8th october 2026", "oct 8", "october 8, 2026", "8/10", "8/10/2026"
  let m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:\s+(\d{4}))?$/.exec(text);
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  if (m && Object.prototype.hasOwnProperty.call(MONTHS, m[2])) {
    day = Number(m[1]);
    month = MONTHS[m[2]];
    year = m[3] ? Number(m[3]) : explicitYear ?? null;
  } else {
    m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?$/.exec(text);
    if (m && Object.prototype.hasOwnProperty.call(MONTHS, m[1])) {
      day = Number(m[2]);
      month = MONTHS[m[1]];
      year = m[3] ? Number(m[3]) : explicitYear ?? null;
    } else {
      m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/.exec(text);
      if (m) {
        day = Number(m[1]);
        month = Number(m[2]);
        year = m[3] ? Number(m[3]) : explicitYear ?? null;
      }
    }
  }

  if (day === null || month === null) return null;
  const candidate = ymd(year ?? thisYear, month, day);
  if (!candidate) return null;

  if (year === null && candidate < today) {
    // No explicit year and candidate is in the past
    if (mode === 'single') {
      // Always roll to next year for single dates
      return ymd(thisYear + 1, month, day);
    } else if (mode === 'rangeStart') {
      // Only roll if > 60 days in the past
      const daysBefore = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${candidate}T00:00:00Z`)) / 86_400_000);
      if (daysBefore > 60) {
        return ymd(thisYear + 1, month, day);
      }
    }
  }
  return candidate;
}

/** One date from free text, or null. Past day-months roll into next year. */
export function parseSingleDate(raw: string, today: string = todayIst()): string | null {
  let text = raw.trim().toLowerCase().replace(/^(on|from|by|until|till|to)\s+/, '');
  // Strip trailing punctuation: ?, !, ., ,
  text = text.replace(/[?!.,]+$/, '');
  if (!text) return null;
  if (/^today$/.test(text)) return today;
  if (/^tomorrow$/.test(text)) return addDaysYmd(today, 1);
  if (/^day after( tomorrow)?$/.test(text)) return addDaysYmd(today, 2);
  if (/^yesterday$/.test(text)) return addDaysYmd(today, -1);

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const weekday = /^(?:next\s+|this\s+)?([a-z]+)$/.exec(text);
  if (weekday && Object.prototype.hasOwnProperty.call(WEEKDAYS, weekday[1])) {
    const target = WEEKDAYS[weekday[1]];
    const cur = dayOfWeek(today);
    let ahead = (target - cur + 7) % 7;
    if (ahead === 0) ahead = 7; // "friday" said on a Friday means next Friday
    return addDaysYmd(today, ahead);
  }

  return parseDayMonth(text, today, { notBeforeOrNull: false });
}

/**
 * Parse a day-month in a specific year (no rollover logic).
 * @returns The date in that year, or null if it can't be parsed or is invalid.
 */
function parseDayMonthInYear(text: string, year: number): string | null {
  // "8 oct", "8th october 2026", "oct 8", "october 8, 2026", "8/10", "8/10/2026"
  let m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:\s+(\d{4}))?$/.exec(text);
  let day: number | null = null;
  let month: number | null = null;
  if (m && Object.prototype.hasOwnProperty.call(MONTHS, m[2])) {
    day = Number(m[1]);
    month = MONTHS[m[2]];
    if (m[3]) year = Number(m[3]);
  } else {
    m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?$/.exec(text);
    if (m && Object.prototype.hasOwnProperty.call(MONTHS, m[1])) {
      day = Number(m[2]);
      month = MONTHS[m[1]];
      if (m[3]) year = Number(m[3]);
    } else {
      m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/.exec(text);
      if (m) {
        day = Number(m[1]);
        month = Number(m[2]);
        if (m[3]) year = Number(m[3]);
      }
    }
  }
  if (day === null || month === null) return null;
  return ymd(year, month, day);
}

/**
 * Extract month number from a day-month text.
 * @returns Month number (1-12), or -1 if not found.
 */
function extractMonthNumber(text: string): number {
  const monthMatch = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/.exec(text);
  if (monthMatch) return Number(monthMatch[2]);

  const nameMatch1 = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:\s+(\d{4}))?$/.exec(text);
  if (nameMatch1 && Object.prototype.hasOwnProperty.call(MONTHS, nameMatch1[2])) {
    return MONTHS[nameMatch1[2]];
  }

  const nameMatch2 = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?$/.exec(text);
  if (nameMatch2 && Object.prototype.hasOwnProperty.call(MONTHS, nameMatch2[1])) {
    return MONTHS[nameMatch2[1]];
  }

  return -1;
}

export interface DateRange {
  from: string;
  to: string;
}

/** A span of days from free text, or null. `to` is inclusive. */
export function parseDateRange(raw: string, today: string = todayIst()): DateRange | null {
  let text = raw.trim().toLowerCase();
  // Strip trailing punctuation: ?, !, ., ,
  text = text.replace(/[?!.,]+$/, '');
  if (!text) return null;

  if (/^next week$/.test(text)) {
    const cur = dayOfWeek(today);
    const toMonday = ((1 - cur + 7) % 7) || 7;
    const from = addDaysYmd(today, toMonday);
    return { from, to: addDaysYmd(from, 6) };
  }

  // "from X for N days" or "for N days"
  let m = /^(?:from\s+(.+?)\s+)?for\s+(?:the\s+)?(?:next\s+)?(\d{1,3})\s+days?$/.exec(text);
  if (m) {
    const from = m[1] ? parseSingleDate(m[1], today) : today;
    const n = Number(m[2]);
    if (!from || n < 1) return null;
    return { from, to: addDaysYmd(from, n - 1) };
  }
  m = /^(?:next|the next)\s+(\d{1,3})\s+days?$/.exec(text);
  if (m) return { from: today, to: addDaysYmd(today, Number(m[1]) - 1) };

  // "X to Y", "X till Y", "X until Y", "X - Y"
  m = /^(?:from\s+)?(.+?)\s+(?:to|till|until|through|-)\s+(.+)$/.exec(text);
  if (m) {
    const startText = m[1].trim().toLowerCase().replace(/[?!.,]+$/, '');
    const endText = m[2].trim().toLowerCase().replace(/[?!.,]+$/, '');

    // Parse start with 60-day rollover threshold (not standard single-date logic)
    let from: string | null = null;

    // Try special patterns first
    if (/^today$/.test(startText)) {
      from = today;
    } else if (/^tomorrow$/.test(startText)) {
      from = addDaysYmd(today, 1);
    } else if (/^yesterday$/.test(startText)) {
      from = addDaysYmd(today, -1);
    } else {
      const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startText);
      if (isoMatch) {
        from = ymd(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
      } else {
        // Try weekday
        const weekday = /^(?:next\s+|this\s+)?([a-z]+)$/.exec(startText);
        if (weekday && Object.prototype.hasOwnProperty.call(WEEKDAYS, weekday[1])) {
          const target = WEEKDAYS[weekday[1]];
          const cur = dayOfWeek(today);
          let ahead = (target - cur + 7) % 7;
          if (ahead === 0) ahead = 7;
          from = addDaysYmd(today, ahead);
        } else {
          // Try day-month with rangeStart mode
          from = parseDayMonth(startText, today, { mode: 'rangeStart' });
        }
      }
    }

    if (!from) return null;
    let startYear = Number(from.slice(0, 4));

    // Parse end relative to start's year
    let to: string | null = null;

    // Check if end has an explicit year
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endText);
    if (isoMatch) {
      to = ymd(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    } else {
      // Try parsing as weekday first (within the same or next week context)
      const weekday = /^(?:next\s+|this\s+)?([a-z]+)$/.exec(endText);
      if (weekday && Object.prototype.hasOwnProperty.call(WEEKDAYS, weekday[1])) {
        const target = WEEKDAYS[weekday[1]];
        const cur = dayOfWeek(today);
        let ahead = (target - cur + 7) % 7;
        if (ahead === 0) ahead = 7;
        to = addDaysYmd(today, ahead);
      } else {
        // Parse end in start's year (without rollover on past dates)
        const parsed = parseDayMonthInYear(endText, startYear);
        if (parsed) {
          to = parsed;
        }

        // If that didn't work or it's before start, check for month wrap
        if (!to || to < from) {
          const endMonthNum = extractMonthNumber(endText);
          const startMonthNum = Number(from.slice(5, 7));
          if (endMonthNum > 0 && endMonthNum < startMonthNum) {
            // Month wrap: try next year
            const parsedNextYear = parseDayMonthInYear(endText, startYear + 1);
            if (parsedNextYear) {
              to = parsedNextYear;
            }
          } else {
            // Not a month wrap, and it's before start, so it's invalid
            to = null;
          }
        }
      }
    }

    if (!to || to < from) return null;
    return { from, to };
  }

  const single = parseSingleDate(text, today);
  return single ? { from: single, to: single } : null;
}
