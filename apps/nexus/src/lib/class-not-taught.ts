/**
 * A session that was not a class, and how it stops asking students for work.
 *
 * On 2026-09-18 the tutor opened the meeting, asked who had quarterly exams and
 * said the class was postponed to the 25th. Six minutes of speech, nothing
 * taught. The attendance register was right and worth keeping. The catch-up
 * obligation was not: seventeen students were left owing a class that never
 * happened, and the only things a teacher could press were "Continue draft"
 * (write a recap of an announcement) and "Follow up 17" (chase them over it).
 *
 * Two callers reach this, and they must not drift apart:
 *
 *   - the sweep, when the recording plainly taught nothing (recap-autodraft),
 *     which signs the excuse with NULL because nobody signed it;
 *   - a teacher pressing "No class was taught", which signs it with their id.
 *
 * Both write the same sentinel note, and that note is what makes the undo
 * precise. A teacher excusing one student by hand writes no note at all (the
 * catch-up UI sends none), so restoring "everything this action excused" can
 * never reach into somebody's individual decision.
 */

/**
 * Written to `excuse_note` by both callers, and the marker the undo matches on.
 *
 * Changing this string orphans every row already carrying it, so they would
 * stop being undoable. If it ever has to change, the old value has to stay
 * matched alongside the new one.
 */
export const NOT_TAUGHT_NOTE = 'No class was taught on this date.';

/**
 * Excuse every outstanding obligation on one class. Returns how many moved.
 *
 * Guarded on both `excused_at` and `caught_up_at` being null, which is what
 * makes it safe to press twice and safe to press late:
 *
 *   - a student who already worked through the class keeps their completion,
 *     because we never touch a row with `caught_up_at` set;
 *   - a student a teacher excused earlier for their own reason keeps that
 *     teacher's name and note on the row, rather than having it overwritten
 *     with ours.
 *
 * `excused_at` rather than `caught_up_at` throughout: catching up is something
 * a student did, and markCatchupItemCaughtUp is the single writer of that
 * column. Excusing is something we did to them, and it is the same column, and
 * the same undo, as the Excuse button on the catch-up screen.
 */
export async function excuseClassObligations(
  supabase: any,
  classId: string,
  excusedBy: string | null,
): Promise<{ count: number; studentIds: string[] }> {
  const { data, error } = await supabase
    .from('nexus_class_absences')
    .update({
      excused_at: new Date().toISOString(),
      excused_by: excusedBy,
      excuse_note: NOT_TAUGHT_NOTE,
    })
    .eq('scheduled_class_id', classId)
    .is('excused_at', null)
    .is('caught_up_at', null)
    .select('student_id');
  if (error) throw error;

  const rows = (data as Array<{ student_id: string }>) || [];
  return { count: rows.length, studentIds: rows.map((r) => r.student_id) };
}

/**
 * Put back only what this feature took away.
 *
 * Matched on the sentinel note, never on "every excused row for this class".
 * The difference matters: a teacher may have excused one student here for an
 * entirely unrelated reason, and an undo that swept that up would quietly
 * re-impose work somebody had deliberately waived.
 *
 * `caught_up_at` is checked for the same reason as above. A student who went
 * and did the work anyway is finished, and restoring them would reopen it.
 */
export async function restoreClassObligations(
  supabase: any,
  classId: string,
): Promise<{ count: number; studentIds: string[] }> {
  const { data, error } = await supabase
    .from('nexus_class_absences')
    .update({ excused_at: null, excused_by: null, excuse_note: null })
    .eq('scheduled_class_id', classId)
    .eq('excuse_note', NOT_TAUGHT_NOTE)
    .is('caught_up_at', null)
    .select('student_id');
  if (error) throw error;

  const rows = (data as Array<{ student_id: string }>) || [];
  return { count: rows.length, studentIds: rows.map((r) => r.student_id) };
}

/**
 * Is this class one WE marked as not taught, as opposed to one cancelled the
 * ordinary way?
 *
 * The undo route needs this, and the distinction is not cosmetic. Silently
 * un-cancelling a class that genuinely never ran would put it back in front of
 * `computeAbsencesForClass`, which derives absences for any class that is not
 * cancelled, so the 21:00 cron would invent obligations for a class nobody
 * ever attended.
 *
 * Either marker is enough on its own. A class with no recording has no recap
 * row to carry the readiness, and a class where every student had already
 * caught up has no absence row left carrying the note.
 */
export async function wasMarkedNotTaught(supabase: any, classId: string): Promise<boolean> {
  const [{ data: absence }, { data: recap }] = await Promise.all([
    supabase
      .from('nexus_class_absences')
      .select('id')
      .eq('scheduled_class_id', classId)
      .eq('excuse_note', NOT_TAUGHT_NOTE)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('nexus_class_recaps')
      .select('id, readiness')
      .eq('scheduled_class_id', classId)
      .maybeSingle(),
  ]);

  return !!absence || recap?.readiness === 'not_applicable';
}
