/**
 * The rules behind the catch-up badge on the staff timetable.
 *
 * Kept pure (no React, no theme) so the three views that draw the badge, and
 * the page that fetches for them, agree on which classes get one, where a tap
 * lands and how the visible range is cut into requests the endpoint accepts.
 */

import { HEALTH_META, healthShortText, type CalendarClass } from '@/lib/catchup-calendar';

/**
 * The widest span one /api/catchup/calendar request may cover, counted as
 * days BETWEEN the two ends (so 45 here is a 46-day window). The route refuses
 * anything wider with a 400. Kept one under its limit so a rounding slip at a
 * DST-free IST boundary can never tip a request over.
 */
export const CATCHUP_RANGE_MAX_SPAN = 44;

/**
 * Whether a class has anything worth a badge.
 *
 * An upcoming class has nothing to catch up on yet. A fully attended class
 * with nobody joining late is "all caught up" only in the vacuous sense, and
 * a green pill on every such night would drown the ones that need a look.
 */
export function hasCatchupNews(c: CalendarClass): boolean {
  if (c.health === 'upcoming') return false;
  if (c.health === 'all_caught_up' && c.missed === 0 && c.late_joiners === 0) return false;
  return true;
}

/** Only the classes that earn a badge, keyed by class id. */
export function indexCatchup(classes: readonly CalendarClass[] | null | undefined): Map<string, CalendarClass> {
  const map = new Map<string, CalendarClass>();
  for (const c of classes ?? []) {
    if (hasCatchupNews(c)) map.set(c.id, c);
  }
  return map;
}

/** Where tapping the badge goes: the class, open on the Catch-up calendar. */
export function catchupHref(c: Pick<CalendarClass, 'id' | 'scheduled_date'>): string {
  const month = c.scheduled_date.slice(0, 7);
  const params = new URLSearchParams({
    view: 'calendar',
    month,
    class: c.id,
    from: 'timetable',
  });
  return `/teacher/catch-up?${params.toString()}`;
}

/** What a screen reader hears for the badge, and the chip's hover title. */
export function catchupSentence(c: CalendarClass): string {
  return `Catch-up: ${healthShortText(c)}`;
}

export type CatchupTone = (typeof HEALTH_META)[keyof typeof HEALTH_META]['tone'];

export function catchupTone(c: Pick<CalendarClass, 'health'>): CatchupTone {
  return HEALTH_META[c.health].tone;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Cut an inclusive YYYY-MM-DD range into pieces the endpoint accepts.
 *
 * A month grid is at most 42 days, so in practice this returns one piece; the
 * split exists so a future wider view degrades into two requests rather than
 * a 400 that silently draws no badges.
 */
export function splitCatchupRange(
  from: string,
  to: string,
  maxSpan: number = CATCHUP_RANGE_MAX_SPAN,
): Array<{ from: string; to: string }> {
  if (!from || !to || from > to) return [];
  const out: Array<{ from: string; to: string }> = [];
  let start = from;
  while (start <= to) {
    const cap = addDaysIso(start, maxSpan);
    const end = cap < to ? cap : to;
    out.push({ from: start, to: end });
    start = addDaysIso(end, 1);
  }
  return out;
}
