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

/** One date from free text, or null. Past day-months roll into next year. */
export function parseSingleDate(raw: string, today: string = todayIst()): string | null {
  const text = raw.trim().toLowerCase().replace(/^(on|from|by|until|till|to)\s+/, '');
  if (!text) return null;
  if (/^today$/.test(text)) return today;
  if (/^tomorrow$/.test(text)) return addDaysYmd(today, 1);
  if (/^day after( tomorrow)?$/.test(text)) return addDaysYmd(today, 2);
  if (/^yesterday$/.test(text)) return addDaysYmd(today, -1);

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (iso) return ymd(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const weekday = /^(?:next\s+|this\s+)?([a-z]+)$/.exec(text);
  if (weekday && weekday[1] in WEEKDAYS) {
    const target = WEEKDAYS[weekday[1]];
    const cur = dayOfWeek(today);
    let ahead = (target - cur + 7) % 7;
    if (ahead === 0) ahead = 7; // "friday" said on a Friday means next Friday
    return addDaysYmd(today, ahead);
  }

  // "8 oct", "8th october 2026", "oct 8", "october 8, 2026", "8/10", "8/10/2026"
  let m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?(?:\s+(\d{4}))?$/.exec(text);
  let day: number | null = null;
  let month: number | null = null;
  let year: number | null = null;
  if (m && m[2] in MONTHS) {
    day = Number(m[1]); month = MONTHS[m[2]]; year = m[3] ? Number(m[3]) : null;
  } else {
    m = /^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+(\d{4}))?$/.exec(text);
    if (m && m[1] in MONTHS) {
      day = Number(m[2]); month = MONTHS[m[1]]; year = m[3] ? Number(m[3]) : null;
    } else {
      m = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?$/.exec(text);
      if (m) { day = Number(m[1]); month = Number(m[2]); year = m[3] ? Number(m[3]) : null; }
    }
  }
  if (day === null || month === null) return null;
  const thisYear = Number(today.slice(0, 4));
  const candidate = ymd(year ?? thisYear, month, day);
  if (!candidate) return null;
  if (year === null && candidate < today) return ymd(thisYear + 1, month, day);
  return candidate;
}

export interface DateRange {
  from: string;
  to: string;
}

/** A span of days from free text, or null. `to` is inclusive. */
export function parseDateRange(raw: string, today: string = todayIst()): DateRange | null {
  const text = raw.trim().toLowerCase();
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
    const from = parseSingleDate(m[1], today);
    const to = parseSingleDate(m[2], today);
    if (!from || !to || to < from) return null;
    return { from, to };
  }

  const single = parseSingleDate(text, today);
  return single ? { from: single, to: single } : null;
}
