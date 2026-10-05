/**
 * Who on a class's roster told us in advance they are away on the class's day.
 *
 * The console's "expected" is the roster minus these students: a student on
 * declared exam leave is not missing from the class, they were never coming.
 * They stay on the roster (they still owe the work), and one who turns up
 * anyway counts as here like anyone else.
 *
 * Best effort by design. The snapshot is the console's heartbeat, so a failed
 * read here leaves "expected" equal to the roster rather than failing it.
 */

import { TtlCache } from '@/lib/ttl-cache';
import { coveringWindow, describeWindow, groupByStudent, loadAwayWindows } from '@/lib/away-windows';
import { padDb, type RosterView } from './sessions';

export interface AwayStudent {
  student_id: string;
  name: string | null;
  reason_code: string | null;
  /** "Away until 12 Oct", from the class day's point of view. */
  label: string;
}

const IST_OFFSET_MS = 330 * 60_000;

/** The IST calendar day (YYYY-MM-DD) of an instant: the day a class "is on". */
export function istDay(instant: string | number | Date | null | undefined, fallback: Date = new Date()): string {
  const ms = instant == null ? NaN : new Date(instant).getTime();
  return new Date((Number.isFinite(ms) ? ms : fallback.getTime()) + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Pure: the students in `roster` that `windows` cover on `day`, in roster order. */
export function awayOn(
  roster: RosterView,
  windows: Parameters<typeof groupByStudent>[0],
  day: string,
): AwayStudent[] {
  const byStudent = groupByStudent(windows);
  const out: AwayStudent[] = [];
  for (const id of roster.ids) {
    const window = coveringWindow(byStudent.get(id) ?? [], day);
    if (!window) continue;
    out.push({ student_id: id, name: roster.names[id] ?? null, reason_code: window.reason_code, label: describeWindow(window, day) });
  }
  return out;
}

const awayCache = new TtlCache<AwayStudent[]>(60_000, 200);

export async function awayToday(cacheKey: string, roster: RosterView, day: string): Promise<AwayStudent[]> {
  const key = `${cacheKey}:${day}`;
  const cached = awayCache.get(key);
  if (cached) return cached;
  const windows = await loadAwayWindows(padDb(), { studentIds: roster.ids, from: day, to: day });
  const away = awayOn(roster, windows, day);
  awayCache.set(key, away);
  return away;
}

/** Test seam. */
export function __clearAwayCache(): void {
  awayCache.clear();
}
