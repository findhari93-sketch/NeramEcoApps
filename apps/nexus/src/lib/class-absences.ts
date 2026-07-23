/**
 * Who missed a class, and why.
 *
 * Everyone attends by default, so a no-show leaves no trace: no RSVP row
 * (they never opted out) and no attendance row (the Teams sync records only
 * who joined). The absence is the gap between the roster and the join list, and
 * this is where that gap gets computed and written down.
 *
 * Shared by the nightly cron and the teacher's on-demand recompute, so the two
 * can never produce different lists for the same class.
 */

/** A student who joins this many minutes after the start is "late", not absent. */
export const LATE_THRESHOLD_MINUTES = 10;

export interface AbsenceComputation {
  /** Rows written to nexus_class_absences. */
  written: number;
  noShows: number;
  optedOut: number;
  /** Attended, but joined more than the threshold after the start. */
  lateJoiners: number;
  present: number;
  rosterSize: number;
}

interface ClassRow {
  id: string;
  classroom_id: string;
  scheduled_date: string;
  start_time: string;
  status: string | null;
}

/**
 * Recompute the absence list for one class and upsert it.
 *
 * Idempotent by design: the cron re-runs, and a teacher can recompute after
 * syncing Teams. Existing rows keep the human-written parts (the reason given,
 * the follow-up already sent, whether they caught up) and only have their kind
 * refreshed, so re-running never erases work.
 */
export async function computeAbsencesForClass(
  supabase: any,
  cls: ClassRow,
): Promise<AbsenceComputation> {
  const empty: AbsenceComputation = {
    written: 0,
    noShows: 0,
    optedOut: 0,
    lateJoiners: 0,
    present: 0,
    rosterSize: 0,
  };

  // A cancelled class has no absences: nobody missed something that did not run.
  if (cls.status === 'cancelled') return empty;

  const [{ data: roster }, { data: attendance }, { data: optOuts }] = await Promise.all([
    supabase
      .from('nexus_enrollments')
      .select('user_id')
      .eq('classroom_id', cls.classroom_id)
      .eq('role', 'student')
      .eq('is_active', true),
    supabase
      .from('nexus_attendance')
      .select('student_id, attended, joined_at')
      .eq('scheduled_class_id', cls.id),
    supabase
      .from('nexus_class_rsvp')
      .select('student_id, reason, reason_code')
      .eq('scheduled_class_id', cls.id)
      .eq('response', 'not_attending'),
  ]);

  const rosterIds: string[] = (roster || []).map((r: any) => r.user_id);
  if (rosterIds.length === 0) return empty;

  const attended = new Set<string>(
    (attendance || []).filter((a: any) => a.attended).map((a: any) => a.student_id),
  );
  const optOutById = new Map<string, { reason: string | null; reason_code: string | null }>(
    (optOuts || []).map((o: any) => [o.student_id, { reason: o.reason, reason_code: o.reason_code }]),
  );

  // Lateness is a property of someone who DID attend, so it is derived here for
  // the dashboard but never turns into an absence row.
  const startedAt = new Date(`${cls.scheduled_date}T${cls.start_time}+05:30`).getTime();
  const lateJoiners = (attendance || []).filter((a: any) => {
    if (!a.attended || !a.joined_at) return false;
    const joined = new Date(a.joined_at).getTime();
    return Number.isFinite(joined) && joined - startedAt > LATE_THRESHOLD_MINUTES * 60 * 1000;
  }).length;

  const missing = rosterIds.filter((id) => !attended.has(id));
  if (missing.length === 0) {
    return {
      ...empty,
      present: attended.size,
      rosterSize: rosterIds.length,
      lateJoiners,
    };
  }

  const rows = missing.map((studentId) => {
    const opt = optOutById.get(studentId);
    return {
      scheduled_class_id: cls.id,
      student_id: studentId,
      classroom_id: cls.classroom_id,
      kind: opt ? 'opted_out' : 'no_show',
      // A reason given in advance is carried across, so the teacher sees one
      // list with reasons filled in rather than two lists to cross-reference.
      ...(opt
        ? {
            reason_code: opt.reason_code,
            reason_note: opt.reason,
            reason_submitted_at: new Date().toISOString(),
          }
        : {}),
    };
  });

  // onConflict without ignoreDuplicates would overwrite a reason the student
  // gave after the fact, so the update is limited to the classification.
  const { error } = await supabase
    .from('nexus_class_absences')
    .upsert(rows, { onConflict: 'scheduled_class_id,student_id', ignoreDuplicates: true });
  if (error) throw error;

  // Existing rows still need their kind refreshed: someone who opted out after
  // the cron first ran should stop showing as an unexplained no-show.
  for (const row of rows.filter((r) => r.kind === 'opted_out')) {
    await supabase
      .from('nexus_class_absences')
      .update({ kind: 'opted_out' })
      .eq('scheduled_class_id', cls.id)
      .eq('student_id', row.student_id)
      .is('reason_submitted_at', null);
  }

  const optedOut = rows.filter((r) => r.kind === 'opted_out').length;
  return {
    written: rows.length,
    noShows: rows.length - optedOut,
    optedOut,
    lateJoiners,
    present: attended.size,
    rosterSize: rosterIds.length,
  };
}

/** Today in IST, as YYYY-MM-DD. Crons run in UTC; classes are Indian evenings. */
export function istToday(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
