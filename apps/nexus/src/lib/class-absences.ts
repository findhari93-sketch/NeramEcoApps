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

import { loadClassroomRoster } from '@neram/database';
import { coveringWindow, groupByStudent, loadAwayWindows } from './away-windows';

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

  const [{ members: roster }, { data: attendance }, { data: optOuts }, awayWindows] = await Promise.all([
    // `asOf` makes the roster who was in the class THAT DAY, not who is in it
    // now. Without it, a student who joined in July is marked a no-show for
    // every class held in June: work they could not possibly have attended,
    // chased by the follow-up cron as if they had skipped it. Those classes are
    // a catch-up backlog item instead (see ensureCatchupJourney), which is a
    // different thing with a different conversation attached to it.
    //
    // Dormant students are dropped by the helper: they cannot be "absent" from
    // a class everyone knows they are not attending.
    loadClassroomRoster(cls.classroom_id, {
      asOf: cls.scheduled_date,
      client: supabase,
    }),
    supabase
      .from('nexus_attendance')
      .select('student_id, attended, joined_at')
      .eq('scheduled_class_id', cls.id),
    supabase
      .from('nexus_class_rsvp')
      .select('student_id, reason, reason_code')
      .eq('scheduled_class_id', cls.id)
      .eq('response', 'not_attending'),
    // Declared away windows covering this class's day. Read for every student,
    // then narrowed against the roster below.
    loadAwayWindows(supabase, { from: cls.scheduled_date, to: cls.scheduled_date }),
  ]);

  const rosterIds: string[] = roster.map((r) => r.user_id);
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

  const awayByStudent = groupByStudent(awayWindows);
  const awayWindowFor = (studentId: string) =>
    coveringWindow(awayByStudent.get(studentId) || [], cls.scheduled_date);

  const rows = missing.map((studentId) => {
    const opt = optOutById.get(studentId);
    const away = awayWindowFor(studentId);
    return {
      scheduled_class_id: cls.id,
      student_id: studentId,
      classroom_id: cls.classroom_id,
      kind: opt || away ? 'opted_out' : 'no_show',
      // Which window explains this, or null. MACHINE owned, unlike reason_code
      // and reason_note beside it: those are what a person typed and every
      // writer here guards them with ignoreDuplicates, while this one is
      // re-derived on every run. That difference is what lets a class moved
      // into, or out of, a window correct itself instead of carrying a stamp
      // asserting a student was away on a day they were not.
      away_window_id: away?.id ?? null,
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

  // Re-derive away_window_id on rows that already existed.
  //
  // The upsert above uses ignoreDuplicates, so it cannot touch a row another
  // writer got to first, and deriveNoShows in attendance-sync.ts usually does:
  // it runs inside the Teams sync, BEFORE this function is called. Without this
  // pass the stamp would land only on classes nobody had synced yet, which is
  // the same way the RSVP reason copy above quietly stopped working.
  const awayRows = rows.filter((r) => r.away_window_id);
  for (const row of awayRows) {
    await supabase
      .from('nexus_class_absences')
      .update({ away_window_id: row.away_window_id, kind: 'opted_out' })
      .eq('scheduled_class_id', cls.id)
      .eq('student_id', row.student_id);
  }

  // And clear it from anyone no longer covered. This is the half that makes a
  // reschedule OUT of a window self-heal: without it the row would keep
  // asserting a window that no longer explains this date.
  const stillAway = awayRows.map((r) => r.student_id);
  const clear = supabase
    .from('nexus_class_absences')
    .update({ away_window_id: null })
    .eq('scheduled_class_id', cls.id)
    .not('away_window_id', 'is', null);
  await (stillAway.length ? clear.not('student_id', 'in', `(${stillAway.join(',')})`) : clear);

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
