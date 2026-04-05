import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/exam-schedule?classroom={id}&exam_type=nata&year=2026&phase=phase_1
 * Returns aggregated exam schedule: upcoming dates with students grouped by city,
 * students who haven't submitted dates, and recently completed students.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');
    const examType = request.nextUrl.searchParams.get('exam_type') || 'nata';
    const year = parseInt(request.nextUrl.searchParams.get('year') || String(new Date().getFullYear()));
    const phase = request.nextUrl.searchParams.get('phase');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const db = supabase as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Verify enrollment in classroom
    const { data: enrollment } = await db
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled in this classroom' }, { status: 403 });
    }

    // 1. Upcoming exam dates with students
    let datesQuery = db
      .from('nexus_exam_dates')
      .select('id, exam_date, phase, attempt_number, label')
      .eq('exam_type', examType)
      .eq('year', year)
      .eq('is_active', true)
      .gte('exam_date', new Date().toISOString().split('T')[0])
      .order('exam_date', { ascending: true });

    if (phase) datesQuery = datesQuery.eq('phase', phase);

    const { data: examDates, error: datesError } = await datesQuery;
    if (datesError) throw datesError;

    // Get all attempts for these dates
    const dateIds = (examDates || []).map((d: any) => d.id);
    let attemptsForDates: any[] = [];

    if (dateIds.length > 0) {
      const { data, error } = await db
        .from('nexus_student_exam_attempts')
        .select('student_id, exam_date_id, exam_city, exam_session, state')
        .eq('classroom_id', classroomId)
        .eq('exam_type', examType)
        .in('exam_date_id', dateIds);

      if (error) throw error;
      attemptsForDates = data || [];
    }

    // Get student names for all attempts
    const studentIds = [...new Set(attemptsForDates.map((a: any) => a.student_id))];
    let studentNames: Record<string, string> = {};

    if (studentIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, first_name, last_name, name')
        .in('id', studentIds);

      if (users) {
        for (const u of users) {
          studentNames[u.id] = u.first_name && u.last_name
            ? `${u.first_name} ${u.last_name}`
            : u.name || 'Unknown';
        }
      }
    }

    // Build upcoming response
    const upcoming = (examDates || []).map((ed: any) => {
      const dateAttempts = attemptsForDates.filter((a: any) => a.exam_date_id === ed.id);
      const studentsByCity: Record<string, any[]> = {};

      for (const attempt of dateAttempts) {
        const city = attempt.exam_city || 'Unspecified';
        if (!studentsByCity[city]) studentsByCity[city] = [];
        studentsByCity[city].push({
          student_id: attempt.student_id,
          name: studentNames[attempt.student_id] || 'Unknown',
          session: attempt.exam_session,
          state: attempt.state,
        });
      }

      return {
        exam_date: {
          id: ed.id,
          exam_date: ed.exam_date,
          phase: ed.phase,
          attempt_number: ed.attempt_number,
          label: ed.label,
        },
        students_by_city: studentsByCity,
        total_students: dateAttempts.length,
      };
    });

    // 2. Students who haven't submitted any exam date
    const { data: allStudents } = await db
      .from('nexus_enrollments')
      .select('user_id')
      .eq('classroom_id', classroomId)
      .eq('role', 'student')
      .eq('is_active', true);

    const allStudentIds = (allStudents || []).map((s: any) => s.user_id);

    // Get students who have at least one attempt with a non-null exam_date_id
    let submittedStudentIds: string[] = [];
    if (allStudentIds.length > 0) {
      const { data: submitted } = await db
        .from('nexus_student_exam_attempts')
        .select('student_id')
        .eq('classroom_id', classroomId)
        .eq('exam_type', examType)
        .not('exam_date_id', 'is', null)
        .in('student_id', allStudentIds);

      submittedStudentIds = [...new Set((submitted || []).map((s: any) => s.student_id))] as string[];
    }

    const notSubmittedIds = allStudentIds.filter((id: string) => !submittedStudentIds.includes(id));
    let notSubmitted: any[] = [];

    if (notSubmittedIds.length > 0) {
      const { data: nsUsers } = await supabase
        .from('users')
        .select('id, first_name, last_name, name')
        .in('id', notSubmittedIds);

      notSubmitted = (nsUsers || []).map((u: any) => ({
        id: u.id,
        name: u.first_name && u.last_name
          ? `${u.first_name} ${u.last_name}`
          : u.name || 'Unknown',
      }));
    }

    // 3. Recently completed (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentlyCompletedRaw } = await db
      .from('nexus_student_exam_attempts')
      .select('student_id, exam_city, exam_completed_at, exam_date_id')
      .eq('classroom_id', classroomId)
      .eq('exam_type', examType)
      .in('state', ['completed', 'scorecard_uploaded'])
      .gte('exam_completed_at', sevenDaysAgo.toISOString())
      .order('exam_completed_at', { ascending: false });

    // Get names for recently completed
    const rcStudentIds = [...new Set((recentlyCompletedRaw || []).map((r: any) => r.student_id))] as string[];
    let rcNames: Record<string, string> = {};

    if (rcStudentIds.length > 0) {
      const { data: rcUsers } = await supabase
        .from('users')
        .select('id, first_name, last_name, name')
        .in('id', rcStudentIds);

      if (rcUsers) {
        for (const u of rcUsers) {
          rcNames[u.id] = u.first_name && u.last_name
            ? `${u.first_name} ${u.last_name}`
            : u.name || 'Unknown';
        }
      }
    }

    // Get exam dates for recently completed
    const rcDateIds = [...new Set((recentlyCompletedRaw || []).map((r: any) => r.exam_date_id).filter(Boolean))];
    let rcExamDates: Record<string, string> = {};

    if (rcDateIds.length > 0) {
      const { data: rcDates } = await db
        .from('nexus_exam_dates')
        .select('id, exam_date')
        .in('id', rcDateIds);

      if (rcDates) {
        for (const d of rcDates) {
          rcExamDates[d.id] = d.exam_date;
        }
      }
    }

    const recentlyCompleted = (recentlyCompletedRaw || []).map((r: any) => ({
      student_id: r.student_id,
      name: rcNames[r.student_id] || 'Unknown',
      exam_date: r.exam_date_id ? rcExamDates[r.exam_date_id] || '' : '',
      completed_at: r.exam_completed_at,
      city: r.exam_city,
    }));

    return NextResponse.json({
      upcoming,
      not_submitted: notSubmitted,
      recently_completed: recentlyCompleted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load exam schedule';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
