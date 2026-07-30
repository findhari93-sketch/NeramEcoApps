/**
 * Server-side data loading for the parent portal.
 *
 * Two rules govern this file.
 *
 * ONE: `measuredClassIds` is computed from attendance rows belonging to the
 * WHOLE roster, not to this child. That is the entire point. A class nobody
 * synced has no rows at all, and without checking the roster we cannot tell
 * "your child was absent" apart from "nobody recorded this class". See
 * lib/parent-attendance.ts for the rule and lib/inactivity-score.ts for why the
 * gap exists.
 *
 * TWO: a parent sees exactly the classes their child sees, no more. That means
 * published only, and the child's batch only. The student path already does this
 * (api/timetable/my-schedule/route.ts), and for a long time this file did not,
 * so a parent could be shown a draft class or another batch's class. Both then
 * rendered as an unexplained absence for a class the child was never in, which
 * is the same class of bug as the dormant-student report that prompted the
 * parent portal rebuild. `ClassScope` is a required argument rather than an
 * optional one so that adding a new parent class query without deciding the
 * scope is a type error, not a silent leak.
 */

import { getSupabaseAdminClient } from '@neram/database';
import {
  buildClassAttendanceViews,
  type AbsenceRow,
  type AttendanceRow,
  type ClassAttendanceView,
  type ScheduledClassRow,
} from '@/lib/parent-attendance';

/** Classes a parent should never see in an attendance list. */
const HIDDEN_CLASS_STATUSES = ['cancelled', 'rescheduled'];

/**
 * Which classes in a classroom belong to this child.
 *
 * `batchId` comes from lib/parent-enrollment.ts and nowhere else. A null batch
 * means the child is not in a batch, which restricts them to classroom-wide
 * classes: it does NOT mean "no filter". Getting that backwards would show one
 * batch's parents another batch's timetable.
 */
export interface ClassScope {
  batchId: string | null;
}

/**
 * Narrow a nexus_scheduled_classes query to what the child can actually see.
 *
 * Ported from the student branch of api/timetable/my-schedule/route.ts so the
 * two can never disagree about which classes exist for a given child.
 */
function applyClassScope<T>(query: T, scope: ClassScope): T {
  let q = query as any;
  q = q.eq('publish_state', 'published');
  q = scope.batchId
    ? q.or(`batch_id.is.null,batch_id.eq.${scope.batchId}`)
    : q.is('batch_id', null);
  return q as T;
}

/** Today in IST as YYYY-MM-DD. */
export function istToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/** `days` before IST today, as YYYY-MM-DD. */
export function istDaysAgo(days: number): string {
  const ms = Date.parse(`${istToday()}T00:00:00Z`) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export interface ChildAttendanceWindow {
  views: ClassAttendanceView[];
  /** Classes in the window, newest first, before any attendance joining. */
  classes: ScheduledClassRow[];
}

/**
 * Every class in [from, to] for the classroom, with this child's attendance
 * resolved against it and each class correctly marked measured or not.
 *
 * `to` defaults to today: a parent should not see a class that has not happened
 * yet sitting in their attendance list looking like an absence.
 */
export async function loadChildAttendance(
  studentId: string,
  classroomId: string,
  from: string,
  scope: ClassScope,
  to: string = istToday()
): Promise<ChildAttendanceWindow> {
  const supabase = getSupabaseAdminClient();

  const { data: classRows } = await applyClassScope(
    supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date, start_time, end_time, status')
      .eq('classroom_id', classroomId)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to),
    scope
  )
    .order('scheduled_date', { ascending: false })
    .order('start_time', { ascending: false });

  const classes = ((classRows || []) as ScheduledClassRow[]).filter(
    (c) => !HIDDEN_CLASS_STATUSES.includes(String(c.status || ''))
  );

  if (classes.length === 0) {
    return { views: [], classes: [] };
  }

  const classIds = classes.map((c) => c.id);

  // Each query is wrapped so its result is narrowed to a plain array before it
  // meets the others. Handing three different Supabase query builders straight
  // to Promise.all makes TypeScript try to unify three deep generic result
  // types and it gives up with "type instantiation is excessively deep".
  const [measuredRows, mineRows, absenceRows] = await Promise.all([
    // Roster-wide, deliberately. One row from ANY student proves the class was
    // synced, which is what lets this child's missing row mean "absent" instead
    // of "unknown".
    (async (): Promise<{ scheduled_class_id: string }[]> => {
      const { data } = await supabase
        .from('nexus_attendance')
        .select('scheduled_class_id')
        .in('scheduled_class_id', classIds);
      return (data || []) as { scheduled_class_id: string }[];
    })(),
    (async (): Promise<AttendanceRow[]> => {
      const { data } = await supabase
        .from('nexus_attendance')
        .select(
          'scheduled_class_id, attended, joined_at, left_at, duration_minutes, attendance_intervals'
        )
        .eq('student_id', studentId)
        .in('scheduled_class_id', classIds);
      return (data || []) as unknown as AttendanceRow[];
    })(),
    (async (): Promise<AbsenceRow[]> => {
      // `nexus_class_absences` is missing from database.generated.ts (the table
      // predates the last type regeneration), so PostgREST cannot infer this
      // row shape and the chained filters blow the type instantiation depth.
      // The `as any` on .from() is the pattern already used elsewhere in the
      // repo for this table. The real fix is `pnpm supabase:gen:types`, which is
      // out of scope here because it rewrites a shared package and rebuilds all
      // four apps.
      const { data } = await (supabase.from('nexus_class_absences' as any) as any)
        .select('scheduled_class_id, kind, reason_code, reason_note, reason_source')
        .eq('student_id', studentId)
        .in('scheduled_class_id', classIds);
      return (data || []) as AbsenceRow[];
    })(),
  ]);

  const measuredClassIds = new Set<string>(
    measuredRows.map((r) => r.scheduled_class_id)
  );

  return {
    classes,
    views: buildClassAttendanceViews(classes, mineRows, measuredClassIds, absenceRows),
  };
}

export interface UpcomingClass {
  id: string;
  title: string;
  scheduled_date: string;
  start_time: string;
  end_time: string;
  status: string | null;
}

/**
 * The next classes for a classroom.
 *
 * Per-classroom rather than per-parent, so every parent of the same cohort gets
 * an identical answer. Cheap enough to read directly; if this ever gets hot,
 * it is the one parent-portal read that is safe to cache.
 */
export async function loadUpcomingClasses(
  classroomId: string,
  scope: ClassScope,
  limit = 5
): Promise<UpcomingClass[]> {
  const supabase = getSupabaseAdminClient();
  const today = istToday();

  const { data } = await applyClassScope(
    supabase
      .from('nexus_scheduled_classes')
      .select('id, title, scheduled_date, start_time, end_time, status')
      .eq('classroom_id', classroomId)
      .gte('scheduled_date', today),
    scope
  )
    .order('scheduled_date', { ascending: true })
    .order('start_time', { ascending: true })
    // Over-fetch, then apply the same status filter as the past-class list, so
    // a cancelled class cannot silently consume one of the `limit` slots and
    // leave a parent seeing fewer upcoming classes than there are.
    .limit(limit * 2);

  return ((data || []) as UpcomingClass[])
    .filter((c) => !HIDDEN_CLASS_STATUSES.includes(String(c.status || '')))
    .slice(0, limit);
}
