/**
 * The student's "Classes you missed" list, split into what is still owed and
 * what is not.
 *
 * The server sends missed classes oldest first, finished or not, and the page
 * used to render them in that order under one heading. A student clears the
 * oldest ones first, so the classes they had just finished sat at the top of
 * their to-do list with a "Caught up" chip, and read as still owed (NXS-0132).
 * Those same classes were also already on the Watch again tab, which is meant
 * to hold exactly the classes nothing is owed on.
 *
 * Excused counts as cleared: the teacher has taken it off them, so it is not
 * something to do either.
 */

const CLEARED = new Set(['done', 'excused']);

export function splitMissedClasses<
  T extends { status: string; class: { scheduled_date: string } },
>(missed: T[]): { open: T[]; cleared: T[] } {
  const open: T[] = [];
  const cleared: T[] = [];
  for (const item of missed) (CLEARED.has(item.status) ? cleared : open).push(item);
  // Most recently taught first, so the one they just finished is the one they
  // see when they open the group to check it landed.
  cleared.sort((a, b) => b.class.scheduled_date.localeCompare(a.class.scheduled_date));
  return { open, cleared };
}
