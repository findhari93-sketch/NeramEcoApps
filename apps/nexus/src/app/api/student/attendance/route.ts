import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient, getNexusSetting } from '@neram/database';
import { verifyMsToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';
import { loadOwnAttendance } from '@/lib/student-attendance';
import { FEATURE_FLAGS_KEY, resolveFlags, type FlagMap } from '@/lib/feature-flags';
import type { AttendanceSummary, ClassAttendanceView } from '@/lib/parent-attendance';

/** The flag that decides whether a student sees their own record at all. */
const STUDENT_ATTENDANCE_FEATURE = 'student.attendance';

export const dynamic = 'force-dynamic';

export interface StudentAttendanceResponse {
  /** The first date counted, so the page can say what "so far" means. */
  from: string;
  to: string;
  summary: AttendanceSummary;
  sentence: string;
  classes: ClassAttendanceView[];
}

/**
 * GET /api/student/attendance?days=
 *
 * A student's own attendance: how many classes have run, how many they were in
 * the room for, and for each one when they joined, when they left and whether
 * they were only partly there. The same numbers their teacher reads on
 * /teacher/attendance and their parent reads on /parent/dashboard, because all
 * three are built by loadChildAttendance and summarise.
 *
 * ---------------------------------------------------------------------------
 * THE STUDENT ID COMES FROM THE TOKEN. NEVER FROM THE QUERY STRING.
 *
 * Nexus authenticates through MSAL, so `auth.uid()` is always null and every
 * RLS policy on the nexus_* tables is dead code (see lib/parent-auth.ts). Every
 * read here runs on the service-role client, which bypasses RLS anyway. There
 * is no database-level safety net: this route is the only thing standing
 * between one student and another student's record, so it takes no id from the
 * caller at all. Adding a `?student=` parameter to this route would be a data
 * breach, not a feature.
 * ---------------------------------------------------------------------------
 *
 * Read-only. Per-user and mutable within a session, so `no-store`: a student
 * who has just told us why they missed a class must not be shown the answer
 * from before they said it.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Enrolment as a student, not staffness. A teacher has no attendance record
    // of their own to read, and View-as-Student already swaps the token.
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('classroom_id, batch_id, enrolled_at')
      .eq('user_id', user.id)
      .eq('role', 'student')
      .eq('is_active', true)
      .maybeSingle();
    if (!enrollment) {
      return NextResponse.json({ error: 'You are not enrolled in a class.' }, { status: 403 });
    }

    // Checked server-side as well as in the nav, so the payload does not exist
    // for anyone to find in devtools before we have decided to show it.
    const flagRow = await getNexusSetting(FEATURE_FLAGS_KEY).catch(() => null);
    const enabled =
      resolveFlags((flagRow?.value as FlagMap) || {})[STUDENT_ATTENDANCE_FEATURE] === true;
    if (!enabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // `?days=` narrows the window for a range toggle; without it the page
    // counts from the day they enrolled, which is what "so far" means to them.
    const daysParam = Number(request.nextUrl.searchParams.get('days'));
    const payload = await loadOwnAttendance(
      user.id,
      enrollment,
      Number.isFinite(daysParam) ? daysParam : undefined,
    );

    return NextResponse.json(payload satisfies StudentAttendanceResponse, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    // errorResponse already maps an auth failure to 401 and a wrong-role one
    // to 403; only a genuine fault reaches the caller as a 500.
    return errorResponse(err, 'Could not load your attendance.');
  }
}
