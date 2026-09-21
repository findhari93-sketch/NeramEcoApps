import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { loadOwnAttendance } from '@/lib/student-attendance';
import { getSupabaseAdminClient } from '@neram/database';
import { CLASS_IMAGES_EMBED } from '@/lib/class-cover';
import { applyClassPrepGate } from '@/lib/class-prep-server';
import { resolveExamCountdown } from '@/lib/exam-countdown-server';

/**
 * GET /api/dashboard/student?classroom={id}
 *
 * Returns student dashboard data: upcoming classes, attendance summary,
 * checklist progress, topic progress, and the exam countdown.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    // Get user by MS OID
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Sequential on purpose, exactly as api/parent/overview is: batch_id decides
    // which classes count, so it has to be known before attendance is read.
    const { data: enrollment } = await supabase
      .from('nexus_enrollments')
      .select('batch_id, enrolled_at')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true)
      .maybeSingle();

    // Compute "now" in IST (Asia/Kolkata, UTC+5:30) so time filtering
    // works correctly on Vercel's UTC servers.
    const now = new Date();
    const istNow = new Date(now.getTime() + (5.5 * 60 + now.getTimezoneOffset()) * 60 * 1000);
    const today = istNow.toISOString().split('T')[0];
    const nowTimeHHMM = istNow.toTimeString().slice(0, 5); // "HH:MM"

    // Fetch all data in parallel
    const [
      upcomingClassesRaw,
      ownAttendance,
      recentCompletedResult,
      checklistTotalResult,
      checklistCompletedResult,
      topicTotalResult,
      topicCompletedResult,
      examCountdown,
    ] = await Promise.all([
      // Upcoming classes (over-fetch to filter today's ended classes in JS)
      supabase
        .from('nexus_scheduled_classes')
        // classroom_id is selected for applyClassPrepGate, which keys the
        // decision on that class's own enrolment role.
        .select('id, title, classroom_id, scheduled_date, start_time, end_time, status, teams_meeting_url, topic:nexus_topics(title, category), teacher:users!nexus_scheduled_classes_teacher_id_fkey(name)')
        .eq('classroom_id', classroomId)
        .gte('scheduled_date', today)
        .in('status', ['scheduled', 'live'])
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(10),

      /*
       * Attendance, through the one shared loader.
       *
       * This replaces two count queries that were wrong in both of the ways
       * lib/parent-attendance.ts exists to prevent. `attended` counted
       * nexus_attendance rows on student_id ALONE, with no classroom filter, so
       * a student in two classrooms counted both over one classroom's
       * denominator and could score over 100%. And a class nobody synced has no
       * rows at all, so an unsynced term read as 0% rather than as unknown.
       *
       * It is the same call the Attendance page makes. The card and the page it
       * opens are one tap apart; they cannot be allowed to disagree.
       */
      loadOwnAttendance(user.id, {
        classroom_id: classroomId,
        batch_id: (enrollment?.batch_id as string | null) ?? null,
        enrolled_at: (enrollment?.enrolled_at as string | null) ?? null,
      }),

      // Recent completed classes with recordings (for dashboard section).
      // cover_image_id + class_images drive the cover thumbnail on each card.
      // Cast because neither is in the generated Database type, and an unknown
      // COLUMN (unlike an unresolvable embed) collapses the whole row type.
      (supabase as any)
        .from('nexus_scheduled_classes')
        .select(`id, title, scheduled_date, start_time, end_time, status, recording_url, cover_image_id, topic:nexus_topics(title, category), teacher:users!nexus_scheduled_classes_teacher_id_fkey(name), ${CLASS_IMAGES_EMBED}`)
        .eq('classroom_id', classroomId)
        .eq('status', 'completed')
        .order('scheduled_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(5),

      // Total checklist items
      supabase
        .from('nexus_checklist_items')
        .select('id', { count: 'exact', head: true })
        .eq('classroom_id', classroomId)
        .eq('is_active', true),

      // Completed checklist items
      supabase
        .from('nexus_student_checklist_progress')
        .select('id, checklist_item:nexus_checklist_items!inner(classroom_id)', { count: 'exact', head: true })
        .eq('student_id', user.id)
        .eq('is_completed', true)
        .eq('nexus_checklist_items.classroom_id', classroomId),

      // Total topics
      supabase
        .from('nexus_topics')
        .select('id', { count: 'exact', head: true })
        .eq('classroom_id', classroomId)
        .eq('is_active', true),

      // Completed topics
      supabase
        .from('nexus_student_topic_progress')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', user.id)
        .eq('classroom_id', classroomId)
        .eq('status', 'completed'),

      // Days left until the exam this classroom's active plan targets. The
      // student's own booked slot, if they have one, outranks the cohort date, so
      // this number can never contradict the one on their exam screen.
      resolveExamCountdown(supabase, { classroomId, studentId: user.id }),
    ]);

    // Filter out today's classes whose end_time has already passed
    const upcomingClasses = (upcomingClassesRaw.data || []).filter((cls) => {
      if (cls.scheduled_date > today) return true;
      return cls.end_time > nowTimeHHMM;
    }).slice(0, 5);

    // The class prep gate. This is a student-only route, so every class here is
    // seen as a student, and the dashboard hero's Join must not outlive the lock
    // that my-schedule already applies on the timetable.
    const prep = await applyClassPrepGate(supabase as any, user.id, upcomingClasses as any, {
      roleByClassroom: new Map([[classroomId, 'student']]),
    });

    return NextResponse.json({
      upcomingClasses,
      prep,
      completedClasses: recentCompletedResult.data || [],
      attendanceSummary: {
        // `total` is now the MEASURED count, not every completed class, so
        // "attended 12 of 14" never counts two classes nobody recorded.
        total: ownAttendance.summary.measuredClasses,
        attended: ownAttendance.summary.attended,
        /**
         * null, never 0, when nothing was measured. "We have not recorded your
         * attendance" and "you attended nothing" are different sentences, and a
         * percentage cannot tell them apart. Render `sentence` when this is
         * null rather than inventing a number.
         */
        percentage: ownAttendance.summary.attendanceRate,
        notMeasured: ownAttendance.summary.notMeasuredClasses,
        sentence: ownAttendance.sentence,
      },
      checklistProgress: {
        completed: checklistCompletedResult.count || 0,
        total: checklistTotalResult.count || 0,
      },
      topicProgress: {
        completed: topicCompletedResult.count || 0,
        total: topicTotalResult.count || 0,
      },
      examCountdown,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load dashboard';
    console.error('Dashboard error:', message);
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
