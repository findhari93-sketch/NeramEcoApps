/**
 * One class on the catch-up calendar, and the single word for how it stands.
 *
 * Shared by /api/catchup/calendar (which computes it), the Catch-up calendar
 * and the Timetable badges (which draw it), so the three can never disagree
 * about what "3 catching up" or "Recap missing" means.
 */

export type ClassHealth =
  /** Not taught yet. Nothing to catch up on. */
  | 'upcoming'
  /** A teacher (or the sweep) said no class was taught. */
  | 'not_taught'
  /** Students are waiting on us: no published recap. */
  | 'recap_missing'
  /** Some who missed it have not cleared it yet. */
  | 'catching_up'
  /** Everyone who missed it has cleared it, or nobody missed it. */
  | 'all_caught_up';

export interface CalendarClass {
  id: string;
  title: string | null;
  scheduled_date: string;
  start_time: string | null;
  present: number;
  /** Absent from a class they were enrolled for. */
  missed: number;
  /** Owe it because they joined after it ran. Not absences. */
  late_joiners: number;
  /** Of missed + late joiners, cleared or excused. */
  caughtUp: number;
  /** Of missed + late joiners, still owed. */
  outstanding: number;
  /** Of `outstanding`, stuck because the recap is not published. */
  blocked: number;
  recap_state: 'no_recording' | 'recording_ready' | 'draft' | 'published';
  recap_id: string | null;
  has_transcript: boolean;
  teams_meeting_id: string | null;
  not_taught: boolean;
  health: ClassHealth;
}

export function classHealth(
  c: Pick<CalendarClass, 'scheduled_date' | 'outstanding' | 'blocked' | 'recap_state' | 'not_taught'>,
  today: string,
): ClassHealth {
  if (c.scheduled_date > today) return 'upcoming';
  if (c.not_taught) return 'not_taught';
  // Only red when it is holding somebody up. A fully attended class with no
  // recap is still worth a recap (revision), but it is not blocking anyone.
  if (c.recap_state !== 'published' && c.blocked > 0) return 'recap_missing';
  if (c.outstanding > 0) return 'catching_up';
  return 'all_caught_up';
}

export const HEALTH_META: Record<
  ClassHealth,
  { label: string; tone: 'success' | 'warning' | 'error' | 'neutral' }
> = {
  upcoming: { label: 'Upcoming', tone: 'neutral' },
  not_taught: { label: 'Not taught', tone: 'neutral' },
  recap_missing: { label: 'Recap missing', tone: 'error' },
  catching_up: { label: 'Catching up', tone: 'warning' },
  all_caught_up: { label: 'All caught up', tone: 'success' },
};

/** The short text on a calendar chip or timetable badge. Never colour alone. */
export function healthShortText(c: Pick<CalendarClass, 'health' | 'outstanding' | 'blocked'>): string {
  switch (c.health) {
    case 'recap_missing':
      return c.blocked === 1 ? 'Recap missing, 1 waiting' : `Recap missing, ${c.blocked} waiting`;
    case 'catching_up':
      return `${c.outstanding} to catch up`;
    case 'all_caught_up':
      return 'All caught up';
    case 'not_taught':
      return 'Not taught';
    default:
      return 'Upcoming';
  }
}

/** "2026-09" → the first and last day of that month. */
export function monthRange(ym: string): { from: string; to: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/** "2026-09" plus or minus months. */
export function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function isMonthKey(v: string | null | undefined): v is string {
  return !!v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}
