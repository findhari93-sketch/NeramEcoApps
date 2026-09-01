/**
 * Attaching an assignment to a timetable class: the rules, in one place.
 *
 * There are now two doors onto the same column. The timetable has always had
 * one (open a class, "Link existing"), and the assignment form has just gained
 * the other, because reaching the first one meant saving the assignment,
 * leaving for the timetable, finding the class and scanning an unsearchable
 * list. Two doors onto one relationship is exactly the shape that drifts, so
 * the write itself lives here and both routes call it.
 *
 * Pure functions, no fetching, the same reasoning as prework.ts: if the
 * timetable and the assignment form ever disagreed about what linking means,
 * the deadline a student sees would depend on which screen the teacher happened
 * to use, which is not a difference anyone could debug from the outside.
 */

import { classStartIso } from './prework';

export type AssignmentTiming = 'prework' | 'homework';

/** The class being linked to. Just the fields the rules actually read. */
export interface ClassLinkTarget {
  id: string;
  /** YYYY-MM-DD. A wall-clock day, not an instant. */
  scheduled_date: string;
  /** HH:MM or HH:MM:SS. Null is treated as midnight. */
  start_time: string | null;
}

export interface ClassLinkUpdate {
  scheduled_class_id: string;
  timing: AssignmentTiming;
  class_date: string;
  /** Only set for prework, where the deadline is derived rather than typed. */
  due_at?: string;
}

/** Today in IST as YYYY-MM-DD. class_date is a day, not an instant. */
export function istTodayStr(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

/** Anything that is not the literal 'prework' is homework. */
export function normalizeTiming(value: unknown): AssignmentTiming {
  return value === 'prework' ? 'prework' : 'homework';
}

/**
 * The update that attaches an assignment to a class.
 *
 * Three rules, all of which used to live inline in the timetable route:
 *
 *  1. `class_date` is clamped to today for a class in the future. It is "the day
 *     this work entered the student's world": it drives computeAssignmentClock's
 *     personal_start and it is the sort key of the student's assignment list.
 *     Copying a future class's date onto it pins the work to the top of every
 *     student's list weeks early, and when the deadline sits before the class it
 *     puts personal_start AFTER personal_due, granting a late joiner a catch-up
 *     window that begins after the deadline has already passed.
 *  2. Prework's deadline is DERIVED from the class start, never typed. The
 *     teacher gets no date field for prework, so there is no way for a typed
 *     date to contradict the class it belongs to.
 *  3. Homework keeps whatever due_at it already had. Linking a class is not a
 *     reason to move a deadline the teacher chose.
 */
export function buildClassLinkUpdate(
  cls: ClassLinkTarget,
  timing: AssignmentTiming,
  today: string = istTodayStr(),
): ClassLinkUpdate {
  const classDay = (cls.scheduled_date || '').slice(0, 10);

  const update: ClassLinkUpdate = {
    scheduled_class_id: cls.id,
    timing,
    class_date: classDay > today ? today : classDay,
  };

  if (timing === 'prework') {
    update.due_at = classStartIso(classDay, cls.start_time || '00:00');
  }

  return update;
}

/**
 * Detaching. Never a delete: submissions and marks stay with the assignment,
 * which is also why the FK is ON DELETE SET NULL rather than CASCADE.
 *
 * `timing` is deliberately left alone. It only means anything alongside a class,
 * and preserving it means re-linking the same class restores what the teacher
 * had chosen instead of silently resetting them to homework.
 */
export function buildClassUnlinkUpdate(): { scheduled_class_id: null } {
  return { scheduled_class_id: null };
}
