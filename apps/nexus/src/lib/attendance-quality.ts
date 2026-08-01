/**
 * What a class's attendance actually amounts to, as plain functions.
 *
 * Teams gives us minutes in the room, a join time, a leave time and every
 * disconnect. Until now the panel showed a boolean. This is the small amount of
 * judgement that turns those numbers into the two questions a teacher asks
 * after a class: who do I chase, and who was barely here.
 *
 * No React, no Supabase. The API route and the panel both answer from here, so
 * the ranking a teacher sees and the counts the summary reports cannot drift,
 * which is exactly how attendance and insights came to disagree before.
 */

/**
 * A student in the room for less than this share of the class is flagged.
 *
 * A quarter, not a half: at a half, a student who left at the interval of a 90
 * minute class is indistinguishable from one who joined for four minutes and
 * went, and the flag stops meaning anything. At a quarter it fires for the
 * people a teacher would actually ring.
 */
export const BARELY_ATTENDED_RATIO = 0.25;

/**
 * Never flag below this many minutes, whatever the ratio works out to.
 *
 * A quarter of a 20 minute doubt-clearing session is 5 minutes, and somebody who
 * came for 5 of 20 was there for the part that mattered. The floor keeps short
 * classes out of the flag entirely.
 */
export const BARELY_ATTENDED_FLOOR_MIN = 10;

/** Minutes below which attendance at a class of this length reads as token. */
export function barelyAttendedCutoff(scheduledMinutes: number): number {
  if (!Number.isFinite(scheduledMinutes) || scheduledMinutes <= 0) {
    return BARELY_ATTENDED_FLOOR_MIN;
  }
  return Math.max(BARELY_ATTENDED_FLOOR_MIN, Math.round(scheduledMinutes * BARELY_ATTENDED_RATIO));
}

/** Whole minutes between two `HH:MM[:SS]` wall-clock times on the same day. */
export function scheduledMinutes(startTime: string, endTime: string): number {
  const toMinutes = (t: string) => {
    const [h, m] = String(t || '').split(':');
    const hours = Number(h);
    const mins = Number(m);
    if (!Number.isFinite(hours) || !Number.isFinite(mins)) return NaN;
    return hours * 60 + mins;
  };
  const span = toMinutes(endTime) - toMinutes(startTime);
  return Number.isFinite(span) && span > 0 ? span : 0;
}

interface Rankable {
  duration_minutes?: number | null;
  left_at?: string | null;
}

/**
 * Attended students, shortest time in the room first.
 *
 * The order IS the message: the people at the top are the ones who left early,
 * dropped out or never really settled, and they are who the teacher wants. A
 * flat alphabetical list buries them among thirty names.
 *
 * A student Teams reported no duration for sorts LAST, not first. Treating a
 * missing number as zero would put "we do not know" at the very top of a list
 * whose whole point is "these people were barely here", which is the one place
 * it must never appear.
 */
export function rankByTimeInRoom<T extends Rankable>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const da = a.duration_minutes;
    const db = b.duration_minutes;
    const aKnown = typeof da === 'number' && Number.isFinite(da);
    const bKnown = typeof db === 'number' && Number.isFinite(db);
    if (!aKnown && !bKnown) return 0;
    if (!aKnown) return 1;
    if (!bKnown) return -1;
    if (da !== db) return (da as number) - (db as number);
    // Same minutes: whoever walked out first goes above.
    const la = a.left_at ? Date.parse(a.left_at) : Number.POSITIVE_INFINITY;
    const lb = b.left_at ? Date.parse(b.left_at) : Number.POSITIVE_INFINITY;
    return la - lb;
  });
}

export type AttendanceBucket =
  | 'attended'
  | 'excused'
  | 'caught_up'
  | 'missed_with_reason'
  | 'missed_no_reason';

interface Bucketable {
  attended?: boolean;
  rsvp?: string | null;
  absence?: {
    reason_code?: string | null;
    reason_note?: string | null;
    caught_up_at?: string | null;
    excused_at?: string | null;
  } | null;
}

/**
 * Which of the five states a student is in for this class.
 *
 * Order is the whole design. `attended` wins first because a student who opted
 * out and then turned up anyway is present, not absent with a reason: reading
 * the RSVP ahead of the register would put someone who sat through the entire
 * class on a chase list. Then `excused`, because a teacher has already closed
 * it; then `caught_up`, because the work is done; then whether they said why.
 *
 * What is left, missed with no reason and not caught up, is the only group that
 * needs a person to do something, which is why the panel opens on it.
 */
export function bucketFor(student: Bucketable): AttendanceBucket {
  if (student.attended) return 'attended';
  if (student.absence?.excused_at) return 'excused';
  if (student.absence?.caught_up_at) return 'caught_up';
  const explained =
    !!student.absence?.reason_code ||
    !!student.absence?.reason_note ||
    student.rsvp === 'not_attending';
  return explained ? 'missed_with_reason' : 'missed_no_reason';
}

/** How many students are in each bucket. */
export function tallyBuckets(students: Bucketable[]): Record<AttendanceBucket, number> {
  const tally: Record<AttendanceBucket, number> = {
    attended: 0,
    excused: 0,
    caught_up: 0,
    missed_with_reason: 0,
    missed_no_reason: 0,
  };
  for (const s of students) tally[bucketFor(s)]++;
  return tally;
}
