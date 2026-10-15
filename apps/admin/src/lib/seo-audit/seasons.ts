/**
 * Search seasons of the exams and counselling rounds we write about. Clicks on
 * these pages come in waves (NATA from January, counselling from May), so a
 * page has to name the coming cycle's year before its wave starts, not after.
 * Rule S1 in rules.ts reads this list.
 *
 * Months are 1 to 12. A cycle is named by the year its exam or counselling
 * happens; `startYearOffset: -1` means searches start the year before (JEE
 * Main session 1 is in January, so people search from November).
 */
export interface Season {
  id: string;
  label: string;
  /** Path patterns of the pages that belong to this cycle (both origins). */
  paths: RegExp[];
  startMonth: number;
  startYearOffset: 0 | -1;
  endMonth: number;
}

export const SEASONS: Season[] = [
  { id: 'nata', label: 'NATA', paths: [/^\/nata-\d{4}(\/|$)/, /^\/nata-online-coaching$/, /^\/tools\/nata\//], startMonth: 1, startYearOffset: 0, endMonth: 7 },
  { id: 'jee-paper-2', label: 'JEE Main Paper 2', paths: [/^\/jee-paper-2-preparation(\/|$)/], startMonth: 11, startYearOffset: -1, endMonth: 6 },
  { id: 'aat', label: 'AAT', paths: [/^\/aat-\d{4}(\/|$)/], startMonth: 5, startYearOffset: 0, endMonth: 7 },
  { id: 'pgeta', label: 'PGETA', paths: [/^\/pgeta-\d{4}(\/|$)/], startMonth: 3, startYearOffset: 0, endMonth: 7 },
  { id: 'counselling', label: 'B.Arch counselling', paths: [/^\/counseling(\/|$)/, /^\/tools\/counseling\//], startMonth: 5, startYearOffset: 0, endMonth: 9 },
];

/** Pages get this long before the wave to show the new year. */
export const SEASON_LEAD_DAYS = 90;

const DAY = 86_400_000;

function window(s: Season, year: number) {
  const start = Date.UTC(year + s.startYearOffset, s.startMonth - 1, 1);
  const end = Date.UTC(year, s.endMonth, 1) - 1; // last moment of endMonth
  return { start, end };
}

/**
 * The cycle a season's pages should name right now, or null when the next wave
 * is more than SEASON_LEAD_DAYS away (then last cycle's year is still fine).
 */
export function cycleYear(s: Season, now: Date): number | null {
  const t = now.getTime();
  for (let y = now.getUTCFullYear() - 1; y <= now.getUTCFullYear() + 2; y++) {
    const { start, end } = window(s, y);
    if (t > end) continue;
    return t >= start - SEASON_LEAD_DAYS * DAY ? y : null;
  }
  return null;
}

export function seasonFor(path: string): Season | null {
  const p = path.replace(/^\/(ta|hi|kn|ml)(?=\/|$)/, '') || '/';
  return SEASONS.find((s) => s.paths.some((re) => re.test(p))) ?? null;
}
