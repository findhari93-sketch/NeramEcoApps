import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { computeAbsencesForClass, LATE_THRESHOLD_MINUTES } from '@/lib/class-absences';
import { notifyStudents } from '@/lib/notify-students';

/**
 * Reconciling one class: who was expected, who joined, and who to chase.
 *
 * GET recomputes the absence list on the way through, so opening the screen
 * after syncing Teams shows the truth rather than whatever the 9 PM cron saw.
 *
 * POST sends the follow-up. Only a person can do that; the cron deliberately
 * drafts and stops.
 */

interface Ctx {
  params: { classId: string };
}

async function resolveStaff(supabase: any, msOid: string, classId: string) {
  const { data: user } = await supabase
    .from('users')
    .select('id, user_type, name')
    .eq('ms_oid', msOid)
    .single();
  if (!user) return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) };

  const { data: cls } = await supabase
    .from('nexus_scheduled_classes')
    .select('id, classroom_id, title, scheduled_date, start_time, end_time, status, recording_url, youtube_url')
    .eq('id', classId)
    .single();
  if (!cls) return { error: NextResponse.json({ error: 'Class not found' }, { status: 404 }) };

  const { data: enrollment } = await supabase
    .from('nexus_enrollments')
    .select('role')
    .eq('user_id', user.id)
    .eq('classroom_id', cls.classroom_id)
    .eq('is_active', true)
    .maybeSingle();

  const isAdmin = user.user_type === 'admin';
  const canEdit = isAdmin || user.user_type === 'teacher' || enrollment?.role === 'teacher';
  if (!canEdit) {
    return { error: NextResponse.json({ error: 'Only staff can reconcile attendance' }, { status: 403 }) };
  }

  return { userId: user.id as string, userName: (user.name as string) || 'Your teacher', cls };
}

/**
 * GET /api/timetable/[classId]/followup  (staff)
 *
 * One row per enrolled student, each already reconciled: present, late, opted
 * out with a reason, or an unexplained no-show. Plus the stat totals the
 * dashboard shows and whether there is anything to attach to a follow-up.
 */
export async function GET(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveStaff(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    const cls = access.cls;

    // Recompute first: the teacher may have just synced Teams, and a stale list
    // is worse than a slow one.
    const stats = await computeAbsencesForClass(supabase, cls).catch(() => null);

    const [{ data: roster }, { data: attendance }, { data: absences }, { data: assignments }] =
      await Promise.all([
        supabase
          .from('nexus_enrollments')
          .select('user_id, user:users!nexus_enrollments_user_id_fkey(id, name, email, avatar_url)')
          .eq('classroom_id', cls.classroom_id)
          .eq('role', 'student')
          .eq('is_active', true),
        supabase
          .from('nexus_attendance')
          .select('student_id, attended, joined_at, duration_minutes')
          .eq('scheduled_class_id', params.classId),
        supabase
          .from('nexus_class_absences')
          .select('*')
          .eq('scheduled_class_id', params.classId),
        supabase
          .from('nexus_class_assignments')
          .select('id, title, status')
          .eq('scheduled_class_id', params.classId),
      ]);

    const attById = new Map((attendance || []).map((a: any) => [a.student_id, a]));
    const absById = new Map((absences || []).map((a: any) => [a.student_id, a]));
    const startedAt = new Date(`${cls.scheduled_date}T${cls.start_time}+05:30`).getTime();

    const students = (roster || []).map((r: any) => {
      const att: any = attById.get(r.user_id);
      const abs: any = absById.get(r.user_id);
      const joinedAt = att?.attended ? att.joined_at : null;
      const lateBy = joinedAt
        ? Math.round((new Date(joinedAt).getTime() - startedAt) / 60000)
        : null;

      return {
        id: r.user_id,
        name: r.user?.name || r.user?.email || 'Unnamed',
        email: r.user?.email || null,
        avatar_url: r.user?.avatar_url || null,
        present: !!att?.attended,
        joined_at: joinedAt,
        // Negative means they were early, which is not lateness.
        late_by_minutes: lateBy !== null && lateBy > LATE_THRESHOLD_MINUTES ? lateBy : null,
        duration_minutes: att?.duration_minutes ?? null,
        absence: abs
          ? {
              kind: abs.kind,
              reason_code: abs.reason_code,
              reason_note: abs.reason_note,
              followup_sent_at: abs.followup_sent_at,
              caught_up_at: abs.caught_up_at,
              recording_watched_at: abs.recording_watched_at,
            }
          : null,
      };
    });

    const noShows = students.filter((s: any) => s.absence?.kind === 'no_show');

    return NextResponse.json({
      class: cls,
      students,
      stats: {
        rosterSize: students.length,
        present: students.filter((s: any) => s.present).length,
        lateJoiners: students.filter((s: any) => s.late_by_minutes !== null).length,
        optedOut: students.filter((s: any) => s.absence?.kind === 'opted_out').length,
        // The number that matters: missed it AND has not said why.
        unexplained: noShows.filter((s: any) => !s.absence?.reason_code).length,
        awaitingFollowup: noShows.filter((s: any) => !s.absence?.followup_sent_at).length,
        ...(stats ? { computed: true } : {}),
      },
      attachments: {
        hasRecording: !!(cls.recording_url || cls.youtube_url),
        assignments: (assignments || []).filter((a: any) => a.status === 'published'),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load the follow-up';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/timetable/[classId]/followup  (staff)
 * Body: { student_ids: string[], message?: string, teams?: boolean }
 *
 * Asks the listed students why they missed the class and points them at the
 * catch-up. Records who sent it and when, so nobody gets chased twice by two
 * different teachers.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const body = await request.json();
    const supabase = getSupabaseAdminClient() as any;

    const access = await resolveStaff(supabase, msUser.oid, params.classId);
    if ('error' in access) return access.error;
    const cls = access.cls;

    const requested: string[] = Array.isArray(body.student_ids) ? body.student_ids : [];
    if (requested.length === 0) {
      return NextResponse.json({ error: 'Pick at least one student to follow up.' }, { status: 400 });
    }

    // Only chase people who actually have an absence row for this class. A
    // stale browser tab must not be able to message a student who turned up.
    const { data: absences } = await supabase
      .from('nexus_class_absences')
      .select('student_id')
      .eq('scheduled_class_id', params.classId)
      .in('student_id', requested);

    const targets = (absences || []).map((a: any) => a.student_id as string);
    if (targets.length === 0) {
      return NextResponse.json(
        { error: 'None of those students are marked absent for this class. Refresh and try again.' },
        { status: 409 },
      );
    }

    const custom = typeof body.message === 'string' ? body.message.trim() : '';
    const message =
      custom ||
      `We missed you in "${cls.title}". Tap to tell us why, then watch the recording and finish the assignment.`;

    const result = await notifyStudents({
      classroomId: cls.classroom_id,
      studentIds: targets,
      eventType: 'absence_reason_needed',
      title: 'You missed a class',
      message,
      teamsText: `${access.userName} is asking about a missed class`,
      metadata: { class_id: params.classId, catch_up: true },
      teams: body.teams !== false,
    });

    await supabase
      .from('nexus_class_absences')
      .update({ followup_sent_at: new Date().toISOString(), followup_sent_by: access.userId })
      .eq('scheduled_class_id', params.classId)
      .in('student_id', targets);

    return NextResponse.json({ sent: targets.length, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send the follow-up';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
