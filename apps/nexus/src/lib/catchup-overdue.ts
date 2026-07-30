/**
 * Chasing a missed class that the course has already moved past.
 *
 * Separate from the weekly quota sweep next door, because the two measure
 * different things. A late joiner is behind a quota; someone who missed last
 * Tuesday is behind the timetable, and the timetable is what sets their
 * deadline.
 *
 * This lives here rather than in `class-followups`, whose docblock states as a
 * contract that it never messages students and that the first contact after an
 * absence is a person's decision. That promise is worth keeping: a machine
 * messaging thirty teenagers at 9 PM about a class they missed that evening is
 * how a helpful nudge becomes spam. An overdue nudge is a different, later
 * thing, sent once the deadline has actually passed and throttled hard.
 *
 * Nothing here locks anything. Overdue changes a colour, sends one message, and
 * puts a name on the teacher's list.
 */
import { missedClassDueOn, isOverdue, istTodayYmd } from '@neram/database';
import { sendNudge } from './nudge-delivery';

/** Do not chase the same student about the same class twice in a week. */
export const OVERDUE_COOLDOWN_DAYS = 6;

/** Students messaged per run. A cohort-wide blast is never the right answer. */
export const MAX_NUDGES_PER_RUN = 40;

export interface OverdueSweepResult {
  scanned: number;
  overdue: number;
  studentsNudged: number;
  teachersNotified: number;
  capped: boolean;
  errors: string[];
}

interface OverdueRow {
  id: string;
  student_id: string;
  classroom_id: string;
  scheduled_class_id: string;
  title: string;
  scheduled_date: string;
  due_on: string;
}

/**
 * Find every missed class past its deadline, nudge the student once, and tell
 * each classroom's teachers how many names are on their list.
 */
export async function sweepOverdueMissedClasses(supabase: any): Promise<OverdueSweepResult> {
  const result: OverdueSweepResult = {
    scanned: 0,
    overdue: 0,
    studentsNudged: 0,
    teachersNotified: 0,
    capped: false,
    errors: [],
  };

  // Open, unexcused, genuinely missed. A late joiner's backlog is the other
  // sweep's business and has no timetable deadline at all.
  const { data: rows, error } = await supabase
    .from('nexus_class_absences')
    .select(
      'id, student_id, classroom_id, scheduled_class_id, followup_sent_at, ' +
        'class:nexus_scheduled_classes(id, title, scheduled_date, status, recording_url, youtube_url)',
    )
    .neq('kind', 'late_joiner')
    .is('caught_up_at', null)
    .is('excused_at', null);
  if (error) throw error;

  const items = (rows || []).filter((r: any) => r.class && r.class.status !== 'cancelled');
  result.scanned = items.length;
  if (items.length === 0) return result;

  // The classroom timetables, one read each, so "when did the course next run"
  // costs nothing per item.
  const classroomIds = [...new Set(items.map((i: any) => i.classroom_id))] as string[];
  const { data: allClasses } = await supabase
    .from('nexus_scheduled_classes')
    .select('classroom_id, scheduled_date')
    .in('classroom_id', classroomIds)
    .eq('publish_state', 'published')
    .neq('status', 'cancelled')
    .order('scheduled_date', { ascending: true });

  const datesByClassroom = new Map<string, string[]>();
  for (const c of allClasses || []) {
    const list = datesByClassroom.get(c.classroom_id) || [];
    const ymd = String(c.scheduled_date).slice(0, 10);
    if (list[list.length - 1] !== ymd) list.push(ymd);
    datesByClassroom.set(c.classroom_id, list);
  }

  const today = istTodayYmd();
  const cooldownBefore = new Date(Date.now() - OVERDUE_COOLDOWN_DAYS * 86_400_000).toISOString();

  const overdue: OverdueRow[] = [];
  /** The subset outside the cooldown, so a re-run does not chase twice. */
  const nudgeable: OverdueRow[] = [];
  const byClassroom = new Map<string, Set<string>>();

  for (const i of items) {
    // A class with nothing to watch can never be caught up, so it can never be
    // overdue either. Chasing someone for it would be chasing them for our own
    // missing recording.
    if (!i.class.recording_url && !i.class.youtube_url) continue;

    const dates = datesByClassroom.get(i.classroom_id) || [];
    const missedDay = String(i.class.scheduled_date).slice(0, 10);
    const next = dates.find((d) => d > missedDay) ?? null;
    const dueOn = missedClassDueOn(missedDay, next);
    if (!isOverdue(dueOn, today)) continue;

    overdue.push({
      id: i.id,
      student_id: i.student_id,
      classroom_id: i.classroom_id,
      scheduled_class_id: i.scheduled_class_id,
      title: i.class.title || 'a class',
      scheduled_date: missedDay,
      due_on: dueOn,
    });

    const set = byClassroom.get(i.classroom_id) || new Set<string>();
    set.add(i.student_id);
    byClassroom.set(i.classroom_id, set);

    // The chase clock. Reuses followup_sent_at, which already means exactly
    // "we contacted this student about this absence" and is already written by
    // the teacher's own send on the attendance screen, so the two share one
    // cooldown instead of double-messaging.
    if (!i.followup_sent_at || i.followup_sent_at <= cooldownBefore) {
      nudgeable.push(overdue[overdue.length - 1]);
    }
  }

  result.overdue = overdue.length;
  if (overdue.length === 0) return result;

  // One message per student, naming their oldest overdue class, however many
  // they owe. A separate message per class would be four notifications for one
  // conversation.

  const oldestByStudent = new Map<string, OverdueRow>();
  const countByStudent = new Map<string, number>();
  const itemIdsByStudent = new Map<string, string[]>();
  for (const o of nudgeable) {
    countByStudent.set(o.student_id, (countByStudent.get(o.student_id) || 0) + 1);
    const ids = itemIdsByStudent.get(o.student_id) || [];
    ids.push(o.id);
    itemIdsByStudent.set(o.student_id, ids);
    const prev = oldestByStudent.get(o.student_id);
    if (!prev || o.scheduled_date < prev.scheduled_date) oldestByStudent.set(o.student_id, o);
  }

  const targets = [...oldestByStudent.values()].slice(0, MAX_NUDGES_PER_RUN);
  result.capped = oldestByStudent.size > MAX_NUDGES_PER_RUN;

  for (const t of targets) {
    const n = countByStudent.get(t.student_id) || 1;
    const line =
      n === 1
        ? `You have not finished catching up on ${t.title} from ${t.scheduled_date}. The class has moved on since.`
        : `You have ${n} classes still to catch up on, the oldest from ${t.scheduled_date}. The class has moved on since.`;

    try {
      await sendNudge({
        studentIds: [t.student_id],
        subject: n === 1 ? 'A class you missed is still open' : `${n} classes still to catch up on`,
        plain: `${line}\n\nOpen Nexus, watch the recording, finish the work, and it clears itself.`,
        teamsText: line,
        eventType: 'catchup_overdue',
        metadata: { scheduled_class_id: t.scheduled_class_id, overdue_count: n },
      });

      await supabase
        .from('nexus_class_absences')
        .update({ followup_sent_at: new Date().toISOString() })
        .in('id', itemIdsByStudent.get(t.student_id) || []);

      result.studentsNudged += 1;
    } catch (err) {
      result.errors.push(
        `overdue nudge ${t.student_id}: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  // Tell the teachers. One row per classroom: a row per student would bury it.
  for (const [classroomId, studentSet] of byClassroom) {
    try {
      const { data: staff } = await supabase
        .from('nexus_enrollments')
        .select('user_id')
        .eq('classroom_id', classroomId)
        .eq('role', 'teacher')
        .eq('is_active', true);

      const count = studentSet.size;
      const notifications = (staff || []).map((s: any) => ({
        classroom_id: classroomId,
        user_id: s.user_id,
        event_type: 'catchup_overdue',
        title: `${count} ${count === 1 ? 'student is' : 'students are'} overdue on a missed class`,
        message: 'Open the catch-up dashboard to see who needs a call.',
        metadata: { count },
      }));

      if (notifications.length > 0) {
        const { error: insErr } = await supabase
          .from('nexus_timetable_notifications')
          .insert(notifications);
        if (insErr) {
          result.errors.push(`classroom ${classroomId}: ${insErr.message}`);
        } else {
          result.teachersNotified += notifications.length;
        }
      }
    } catch (err) {
      result.errors.push(
        `classroom ${classroomId}: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }

  if (result.capped) {
    // Never let a bounded run read as full coverage.
    console.warn(
      `[catchup-overdue] hit the ${MAX_NUDGES_PER_RUN} nudge cap; ${oldestByStudent.size - MAX_NUDGES_PER_RUN} student(s) were not messaged this run`,
    );
  }

  return result;
}
