import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { addStudentToClassroomTeams } from '@neram/auth';
import { verifyMsToken } from '@/lib/ms-verify';
import { errorResponse } from '@/lib/api-errors';
import { hasPendingClassTeams, mayHavePendingClassTeams, pickYearClassroom, teamsStepAfter } from '@/lib/class-account-teams';

/**
 * POST /api/student/class-teams
 *
 * Finishes the class account's Teams step (class Team and student group chat)
 * that Admin could not, because the new account had not reached Teams yet.
 * The browser calls it once, only when /api/auth/me said the step is pending
 * (lib/class-account-teams.ts). Both adds are safe to repeat. Always for the
 * signed-in student themselves, never while staff view as a student.
 */
export const dynamic = 'force-dynamic';
// Adding to a Team and a group chat is a few Graph calls.
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    if (msUser.impersonatorUserId) return NextResponse.json({ status: 'none' });
    const supabase = getSupabaseAdminClient() as any;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, user_type, linked_classroom_at')
      .eq('ms_oid', msUser.oid)
      .maybeSingle();
    if (userError) throw userError;
    if (!user || !mayHavePendingClassTeams(user, { impersonating: false, now: Date.now() })) {
      return NextResponse.json({ status: 'none' });
    }
    if (!(await hasPendingClassTeams(supabase, user.id))) return NextResponse.json({ status: 'none' });

    const [{ data: setup, error: setupError }, { data: enrolments, error: enrolError }] = await Promise.all([
      supabase.from('class_account_setups').select('upn, steps').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('nexus_enrollments')
        .select('classroom:nexus_classrooms(id, academic_year, is_archived, is_active)')
        .eq('user_id', user.id)
        .eq('role', 'student')
        .eq('is_active', true),
    ]);
    if (setupError) throw setupError;
    if (enrolError) throw enrolError;
    const classroomId = pickYearClassroom(enrolments || []);
    if (!setup?.upn || !classroomId) return NextResponse.json({ status: 'none' });

    const result = await addStudentToClassroomTeams(supabase, {
      classroomId,
      userId: user.id,
      upn: setup.upn,
      source: 'class_account_first_open',
    });
    const now = new Date().toISOString();
    const step = teamsStepAfter(result, now);
    const { error: saveError } = await supabase
      .from('class_account_setups')
      .update({ steps: { ...(setup.steps || {}), teams: step }, updated_at: now })
      .eq('user_id', user.id);
    if (saveError) throw saveError;

    return NextResponse.json({ status: step.status });
  } catch (err) {
    return errorResponse(err, 'Could not finish the class Team step');
  }
}
