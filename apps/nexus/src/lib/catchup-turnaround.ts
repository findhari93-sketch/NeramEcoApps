/**
 * How long a student took to come back to a class they missed.
 *
 * This lived inside `CaughtUpTab` as a local helper for as long as it was only
 * ever printed in one place. It is now also printed per student inside a single
 * class's attendance panel, which is the screen a teacher opens to review how
 * that class went, so the two had to be the same sentence rather than two
 * sentences that happen to agree today.
 *
 * Pure and dependency-free on purpose: the attendance panel computes it on the
 * server, the standing tab in the browser, and neither may drift.
 */

/**
 * Whole days between a class date and when the work was finished, floored at 0.
 *
 * Both ends are normalised to IST midnight before subtracting, so an evening
 * class cleared just after midnight counts as the next day rather than the same
 * one, and a UTC-stamped `caught_up_at` does not silently shift the answer by a
 * day for anyone in India.
 */
export function daysBetween(fromYmd: string, toIso: string): number {
  const a = new Date(`${fromYmd.slice(0, 10)}T00:00:00+05:30`).getTime();
  const b = new Date(`${toIso.slice(0, 10)}T00:00:00+05:30`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * "same day", "the next day", "28 days later". The gap that says whether we had
 * to chase them.
 *
 * Empty string when nothing has been cleared, so a caller can interpolate it
 * into a sentence without guarding. Returning "0 days later" for unfinished work
 * would read as finished.
 */
export function turnaround(scheduledDate: string, caughtUpAt: string | null): string {
  if (!caughtUpAt) return '';
  const days = daysBetween(scheduledDate, caughtUpAt);
  if (days <= 0) return 'same day';
  if (days === 1) return 'the next day';
  return `${days} days later`;
}
