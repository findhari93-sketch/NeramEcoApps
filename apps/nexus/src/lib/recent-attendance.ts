/**
 * How a student has been turning up lately, for the "irregular" flag on a
 * class's missed list.
 *
 * One class tells a teacher whether a student missed it. It cannot tell them
 * whether that was a one-off or the fourth time in five, which is the thing
 * that decides whether a phone call is a check-in or an intervention. This
 * reads the classroom's last few taught classes up to the one on screen and
 * counts, per student, how many they missed and how many of those came with no
 * reason at all.
 *
 * Only classes whose attendance was actually read count (an unsynced class
 * says nothing), a class a student enrolled after is not theirs to miss, and a
 * class marked "No class was taught" is not a class.
 */

import { CLASS_KIND_LECTURE } from './class-kind';
import { NOT_TAUGHT_NOTE } from './class-not-taught';
import { joinedAfterClass } from './attendance-quality';
import { loadReasonContext, resolveFromContext, type ReasonRow } from './absence-reason-load';

export interface RecentAttendance {
  /** Classes counted for this student. */
  of: number;
  missed: number;
  /** Missed with no reason anywhere (RSVP, away window, or afterwards). */
  unexplained: number;
}

export const RECENT_CLASSES = 5;

/** Pure: the counting, given everything already read. */
export function countRecent(input: {
  classes: Array<{ id: string; scheduled_date: string }>;
  studentIds: string[];
  enrolledAt: Map<string, string | null>;
  attended: Set<string>;
  notTaught: Set<string>;
  excused: Set<string>;
  explained: Set<string>;
}): Map<string, RecentAttendance> {
  const out = new Map<string, RecentAttendance>();
  for (const sid of input.studentIds) {
    const r: RecentAttendance = { of: 0, missed: 0, unexplained: 0 };
    for (const c of input.classes) {
      if (input.notTaught.has(c.id)) continue;
      if (joinedAfterClass(input.enrolledAt.get(sid) ?? null, c.scheduled_date)) continue;
      const key = `${c.id}:${sid}`;
      r.of += 1;
      if (input.attended.has(key) || input.excused.has(key)) continue;
      r.missed += 1;
      if (!input.explained.has(key)) r.unexplained += 1;
    }
    out.set(sid, r);
  }
  return out;
}

export async function loadRecentAttendance(
  supabase: any,
  opts: {
    classroomId: string;
    /** The class on screen's date; it and the ones before it are counted. */
    uptoDate: string;
    studentIds: string[];
    enrolledAt: Map<string, string | null>;
    limit?: number;
  },
): Promise<Map<string, RecentAttendance>> {
  const { classroomId, uptoDate, studentIds, enrolledAt } = opts;
  if (studentIds.length === 0) return new Map();

  const { data: classRows, error } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, scheduled_date')
    .eq('classroom_id', classroomId)
    .eq('kind', CLASS_KIND_LECTURE)
    .eq('publish_state', 'published')
    .neq('status', 'cancelled')
    .not('attendance_synced_at', 'is', null)
    .lte('scheduled_date', uptoDate)
    .order('scheduled_date', { ascending: false })
    .limit(opts.limit ?? RECENT_CLASSES);
  if (error) throw error;
  const classes = (classRows || []) as Array<{ id: string; scheduled_date: string }>;
  if (classes.length === 0) return new Map();
  const classIds = classes.map((c) => c.id);
  const dateOf = new Map(classes.map((c) => [c.id, c.scheduled_date]));

  const [att, abs] = await Promise.all([
    supabase
      .from('nexus_attendance')
      .select('scheduled_class_id, student_id')
      .in('scheduled_class_id', classIds)
      .in('student_id', studentIds)
      .eq('attended', true),
    supabase
      .from('nexus_class_absences')
      .select('student_id, scheduled_class_id, reason_code, reason_note, reason_source, reason_submitted_at, excused_at, excuse_note')
      .in('scheduled_class_id', classIds)
      .in('student_id', studentIds),
  ]);
  if (att.error) throw att.error;
  if (abs.error) throw abs.error;

  const attended = new Set<string>((att.data || []).map((a: any) => `${a.scheduled_class_id}:${a.student_id}`));
  const notTaught = new Set<string>();
  const excused = new Set<string>();
  for (const a of abs.data || []) {
    if (a.excuse_note === NOT_TAUGHT_NOTE) notTaught.add(a.scheduled_class_id);
    else if (a.excused_at) excused.add(`${a.scheduled_class_id}:${a.student_id}`);
  }

  // Every (class, student) pair that was not attended, resolved against the
  // RSVP and away windows as well as the absence row. Two batched reads.
  const absByKey = new Map<string, any>((abs.data || []).map((a: any) => [`${a.scheduled_class_id}:${a.student_id}`, a]));
  const rows: ReasonRow[] = [];
  for (const c of classes) {
    for (const sid of studentIds) {
      const key = `${c.id}:${sid}`;
      if (attended.has(key)) continue;
      const a = absByKey.get(key);
      rows.push({
        student_id: sid,
        scheduled_class_id: c.id,
        scheduled_date: dateOf.get(c.id) ?? null,
        reason_code: a?.reason_code ?? null,
        reason_note: a?.reason_note ?? null,
        reason_source: a?.reason_source ?? null,
        reason_submitted_at: a?.reason_submitted_at ?? null,
      });
    }
  }
  const ctx = await loadReasonContext(supabase, rows);
  const explained = new Set<string>();
  for (const r of rows) {
    if (resolveFromContext(ctx, r)) explained.add(`${r.scheduled_class_id}:${r.student_id}`);
  }

  return countRecent({ classes, studentIds, enrolledAt, attended, notTaught, excused, explained });
}
