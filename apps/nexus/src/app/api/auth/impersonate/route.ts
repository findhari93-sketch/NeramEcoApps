import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { signImpersonationToken } from '@/lib/impersonation-token';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/auth/impersonate
 *
 * Mints an impersonation token so a teacher/admin can "View as Student".
 * Authorization:
 *   - admin   -> may impersonate any student
 *   - teacher -> may impersonate a student who shares a classroom in which the
 *                teacher is enrolled as 'teacher'
 * The target must be a real student (not staff) with a non-null ms_oid.
 *
 * Body: { studentId: string, reason?: string, ticketId?: string }
 * Returns: { token, expiresAt, student, impersonatorName }
 */
export async function POST(request: NextRequest) {
  try {
    const callerMs = await verifyMsToken(request.headers.get('Authorization'));

    // Block nested impersonation: a request already running as an impersonated
    // student cannot mint a new token.
    if (callerMs.impersonatorUserId) {
      return NextResponse.json(
        { error: 'Cannot start impersonation while already impersonating' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const studentId: string | undefined = body?.studentId;
    const reason: string | undefined =
      typeof body?.reason === 'string' ? body.reason.slice(0, 200) : undefined;
    const ticketId: string | undefined =
      typeof body?.ticketId === 'string' ? body.ticketId : undefined;

    if (!studentId) {
      return NextResponse.json({ error: 'studentId is required' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Resolve the caller and confirm they are a teacher/admin.
    const { data: caller } = await supabase
      .from('users')
      .select('id, name, user_type')
      .eq('ms_oid', callerMs.oid)
      .single();

    if (!caller) {
      return NextResponse.json({ error: 'Caller not found' }, { status: 401 });
    }

    const isAdmin = caller.user_type === 'admin';
    let isTeacher = caller.user_type === 'teacher';

    // A user can also be a teacher purely by virtue of a teacher enrollment.
    if (!isAdmin && !isTeacher) {
      const { data: teacherEnrollments } = await supabase
        .from('nexus_enrollments')
        .select('classroom_id')
        .eq('user_id', caller.id)
        .eq('role', 'teacher')
        .eq('is_active', true);
      isTeacher = !!teacherEnrollments && teacherEnrollments.length > 0;
    }

    if (!isAdmin && !isTeacher) {
      return NextResponse.json(
        { error: 'Only teachers and admins can view as a student' },
        { status: 403 }
      );
    }

    // Resolve the target student.
    const { data: student } = await supabase
      .from('users')
      .select('id, name, email, linked_classroom_email, avatar_url, ms_oid, user_type')
      .eq('id', studentId)
      .single();

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    if (student.user_type === 'admin' || student.user_type === 'teacher') {
      return NextResponse.json(
        { error: 'Can only view as a student account' },
        { status: 403 }
      );
    }
    if (!student.ms_oid) {
      return NextResponse.json(
        { error: 'This student has no linked Microsoft account yet, so their view cannot be loaded' },
        { status: 409 }
      );
    }

    // Teachers (non-admin) may only view students in classrooms they teach.
    if (!isAdmin) {
      const { data: myTeacherClassrooms } = await supabase
        .from('nexus_enrollments')
        .select('classroom_id')
        .eq('user_id', caller.id)
        .eq('role', 'teacher')
        .eq('is_active', true);

      const teacherClassroomIds = (myTeacherClassrooms || []).map((e: any) => e.classroom_id);

      if (teacherClassroomIds.length === 0) {
        return NextResponse.json(
          { error: 'You are not assigned as a teacher to any classroom' },
          { status: 403 }
        );
      }

      const { data: sharedEnrollment } = await supabase
        .from('nexus_enrollments')
        .select('classroom_id')
        .eq('user_id', student.id)
        .eq('role', 'student')
        .eq('is_active', true)
        .in('classroom_id', teacherClassroomIds)
        .limit(1)
        .maybeSingle();

      if (!sharedEnrollment) {
        return NextResponse.json(
          { error: 'You can only view students in classrooms you teach' },
          { status: 403 }
        );
      }
    }

    // Mint the signed token and log the session.
    const { token, expiresAt } = signImpersonationToken({
      targetUserId: student.id,
      targetMsOid: student.ms_oid,
      impersonatorUserId: caller.id,
      reason,
    });

    // Cast: nexus_impersonation_sessions is a new table not yet in the generated
    // Supabase types. Run `pnpm supabase:gen:types` after the migration applies
    // to drop this cast.
    await (supabase as any).from('nexus_impersonation_sessions').insert({
      impersonator_id: caller.id,
      student_id: student.id,
      reason: reason || null,
      ticket_id: ticketId || null,
    });

    return NextResponse.json({
      token,
      expiresAt,
      impersonatorName: caller.name,
      student: {
        id: student.id,
        name: student.name,
        email: student.email || student.linked_classroom_email || null,
        avatar_url: student.avatar_url,
        ms_oid: student.ms_oid,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start impersonation';
    console.error('Impersonate error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
