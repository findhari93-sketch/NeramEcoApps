/**
 * Per-student attendance counts for the Students page, counted in SQL.
 *
 * /api/students used to pull every nexus_attendance row for the roster and
 * count them in JavaScript. That shipped one row per student per class on every
 * load and, past PostgREST's 1,000-row cap, silently undercounted. The
 * nexus_attendance_counts RPC (migration 20261026090100) returns one row per
 * student instead, scoped to the classroom's own classes.
 */

export interface AttendanceCountRow {
  student_id: string;
  attended: number | string | null;
  total: number | string | null;
}

export type AttendanceCounts = Record<string, { attended: number; total: number }>;

/** bigint comes back from PostgREST as a number or a string; normalise both. */
export function attendanceCountsByStudent(rows: AttendanceCountRow[] | null | undefined): AttendanceCounts {
  const out: AttendanceCounts = {};
  for (const row of rows || []) {
    if (!row?.student_id) continue;
    out[row.student_id] = {
      attended: Number(row.attended) || 0,
      total: Number(row.total) || 0,
    };
  }
  return out;
}

/** PostgREST / Postgres codes for "that function does not exist (yet)". */
function isMissingFunction(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'PGRST202' || code === '42883';
}

/**
 * The RPC call, so the route and its tests share one shape. Resolves to
 * `{ data: AttendanceCountRow[] | null, error }` like any Supabase read.
 *
 * If the database has not run the migration yet (a deploy that lands before
 * `supabase db push`, or a drifted staging), it falls back to the old row read
 * and counts in JS, so the Students page degrades to the previous behaviour
 * instead of failing.
 */
export async function fetchAttendanceCounts(
  supabase: any,
  classroomIds: string[],
  studentIds: string[],
): Promise<{ data: AttendanceCountRow[] | null; error: unknown }> {
  const res = await supabase.rpc('nexus_attendance_counts', {
    p_classroom_ids: classroomIds,
    p_student_ids: studentIds,
  });
  if (!isMissingFunction(res?.error)) return { data: res?.data ?? null, error: res?.error ?? null };

  console.warn('[attendance-counts] nexus_attendance_counts missing, counting rows instead');
  const { data, error } = await supabase
    .from('nexus_attendance')
    .select('student_id, attended')
    .in('student_id', studentIds);
  if (error) return { data: null, error };
  const counts = new Map<string, AttendanceCountRow>();
  for (const row of (data || []) as Array<{ student_id: string; attended: boolean }>) {
    const entry = counts.get(row.student_id) ?? { student_id: row.student_id, attended: 0, total: 0 };
    entry.total = Number(entry.total) + 1;
    if (row.attended) entry.attended = Number(entry.attended) + 1;
    counts.set(row.student_id, entry);
  }
  return { data: [...counts.values()], error: null };
}
