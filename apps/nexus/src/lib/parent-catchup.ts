/**
 * How far behind is my child, and are they closing the gap?
 *
 * A parent asked to see "how many missed classes the student has completed".
 * That is two numbers, not one: how many classes they owe, and how many of those
 * they have finished. A single "3 classes behind" tells a parent nothing about
 * whether the situation is improving.
 *
 * READ ONLY, AND THAT IS LOAD BEARING
 * -----------------------------------
 * This module must NEVER call getCatchupBacklog. That helper reconciles state as
 * it reads (see catchup-journey.ts, which UPDATEs caught_up_at during a "get"),
 * and a parent opening a dashboard must not mutate their child's records. So the
 * absence rows are read directly and completion is derived with the same pure
 * helpers the student's own screens use, which keeps the two in agreement
 * without either writing on the other's behalf.
 *
 * Completion is DERIVED, not read from caught_up_at alone. That column is only
 * ever written when the student presses the button, so a child who has watched
 * the recording, done the work and passed the test but never pressed it would
 * otherwise show to their parent as still behind.
 */

import { getSupabaseAdminClient, loadClassFacts, isWatched } from '@neram/database';

export interface ParentCatchupRollup {
  /** Classes the child missed or joined after, that have something to catch up on. */
  total: number;
  /** Of those, how many are finished. */
  done: number;
  /** Still open. total - done - excused. */
  open: number;
  /** Excused by a teacher, so neither owed nor a mark against them. */
  excused: number;
  /** Split, because a late joiner never missed anything. */
  missedClasses: number;
  lateJoinerClasses: number;
  /** The plain sentence, so no caller has to phrase the empty case. */
  sentence: string;
}

const EMPTY: ParentCatchupRollup = {
  total: 0,
  done: 0,
  open: 0,
  excused: 0,
  missedClasses: 0,
  lateJoinerClasses: 0,
  sentence: 'There is nothing to catch up on.',
};

export async function loadChildCatchup(
  studentId: string,
  classroomId: string
): Promise<ParentCatchupRollup> {
  const supabase = getSupabaseAdminClient();

  // nexus_class_absences is absent from database.generated.ts. Documented
  // `as any` pattern, same as lib/parent-data.ts.
  const { data, error } = await (supabase.from('nexus_class_absences' as any) as any)
    .select(
      'scheduled_class_id, kind, recording_watched_at, caught_up_at, test_passed_at, excused_at'
    )
    .eq('student_id', studentId)
    .eq('classroom_id', classroomId);

  if (error) {
    console.error('[parent-catchup] absence read failed:', error);
    return EMPTY;
  }

  const rows = (data || []) as {
    scheduled_class_id: string;
    kind: string | null;
    recording_watched_at: string | null;
    caught_up_at: string | null;
    test_passed_at: string | null;
    excused_at: string | null;
  }[];
  if (!rows.length) return EMPTY;

  const classIds = rows.map((r) => r.scheduled_class_id);
  const facts = await loadClassFacts(supabase, studentId, classIds);

  let done = 0;
  let open = 0;
  let excused = 0;
  let missedClasses = 0;
  let lateJoinerClasses = 0;

  for (const row of rows) {
    if (row.kind === 'late_joiner') lateJoinerClasses += 1;
    else missedClasses += 1;

    if (row.excused_at) {
      excused += 1;
      continue;
    }

    const work = facts.assignmentsByClass.get(row.scheduled_class_id) || [];
    const outstanding = work.filter(
      (a: { id: string }) => !facts.submitted.has(a.id)
    ).length;
    const hasTest = facts.testByClass.has(row.scheduled_class_id);
    const watched = isWatched(row, facts);

    const finished =
      !!row.caught_up_at ||
      (watched && outstanding === 0 && (!hasTest || !!row.test_passed_at));

    if (finished) done += 1;
    else open += 1;
  }

  const total = done + open + excused;

  return {
    total,
    done,
    open,
    excused,
    missedClasses,
    lateJoinerClasses,
    sentence: describe(total, done, open),
  };
}

/** PURE. The one line under the number, so "0 of 0" can never reach a parent. */
export function describe(total: number, done: number, open: number): string {
  if (total === 0) return 'There is nothing to catch up on.';
  if (open === 0) return `All ${total === 1 ? 'the' : total} catch-up ${total === 1 ? 'class is' : 'classes are'} done.`;
  if (done === 0) {
    return open === 1
      ? 'One class is still waiting to be caught up.'
      : `${open} classes are still waiting to be caught up.`;
  }
  return `${done} of ${total} caught up, ${open} still to go.`;
}
