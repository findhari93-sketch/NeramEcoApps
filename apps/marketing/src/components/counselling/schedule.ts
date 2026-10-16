import type { ImportantDate } from '@/data/counselling-2026/schema';
import type { TimelineItem } from '@/design-system';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Counselling dates as Timeline rows. A dated milestone before today is done;
 * the first dated one from today on is now (the next thing to act on); the
 * rest, and anything undated or TBD, are next. Pages revalidate daily, so the
 * marker moves once a day.
 */
export function toTimeline(dates: ImportantDate[], now: Date = new Date()): TimelineItem[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const time = (d: ImportantDate) => (d.dateIso && d.status !== 'tbd' ? Date.parse(d.dateIso) : NaN);

  const nowIndex = dates.findIndex((d) => {
    const ms = time(d);
    return Number.isFinite(ms) && ms >= today;
  });

  return dates.map((d, i) => {
    const ms = time(d);
    const state = Number.isFinite(ms) && ms < today ? 'done' : i === nowIndex ? 'now' : 'next';
    const days = Number.isFinite(ms) ? Math.round((ms - today) / DAY) : null;
    const when = state === 'now' && days !== null && days <= 90 ? (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`) : null;
    // Skip the certainty note when the date text already says it ("June 2026 (TBD)").
    const saysTbd = /\btbd\b/i.test(d.dateDisplay);
    const certainty = saysTbd ? null : d.status === 'expected' ? 'Expected date' : d.status === 'tbd' ? 'Date to be announced' : null;
    const note = [when, certainty, d.note].filter(Boolean).join('. ');
    return { label: d.label, date: d.dateDisplay, state, note: note || undefined };
  });
}
