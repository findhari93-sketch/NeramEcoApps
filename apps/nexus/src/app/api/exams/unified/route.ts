import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * GET /api/exams/unified?classroom={id}&exam_type=nata&year=2026&phase=phase_1&week_offset=0
 * Returns combined personal exam data + classroom schedule in one call.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');
    const examType = request.nextUrl.searchParams.get('exam_type') || 'nata';
    const year = parseInt(request.nextUrl.searchParams.get('year') || String(new Date().getFullYear()));

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

    // Verify enrollment
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

    // 1. Personal: registrations
    const { data: registrations } = await db
      .from('nexus_student_exam_registrations')
      .select('id, exam_type, is_writing, application_number')
      .eq('student_id', user.id)
      .eq('classroom_id', classroomId);

    // 2. Personal: my attempts (with resolved exam_date)
    const { data: rawAttempts } = await db
      .from('nexus_student_exam_attempts')
      .select('id, exam_type, phase, attempt_number, exam_date, exam_date_id, exam_city, exam_session, state, aptitude_score, drawing_score, total_score, exam_completed_at')
      .eq('student_id', user.id)
      .eq('classroom_id', classroomId)
      .eq('exam_type', examType)
      .order('attempt_number', { ascending: true });

    // Resolve exam_date from exam_date_id for any missing
    let myAttempts = rawAttempts || [];
    const needsResolution = myAttempts.filter((a: any) => !a.exam_date && a.exam_date_id);
    if (needsResolution.length > 0) {
      const dateIds = [...new Set(needsResolution.map((a: any) => a.exam_date_id))] as string[];
      const { data: resolved } = await db
        .from('nexus_exam_dates')
        .select('id, exam_date')
        .in('id', dateIds);
      const dateMap: Record<string, string> = {};
      for (const d of (resolved || [])) dateMap[d.id] = d.exam_date;
      myAttempts = myAttempts.map((a: any) => ({
        ...a,
        exam_date: a.exam_date || dateMap[a.exam_date_id] || null,
      }));
    }

    // 3. Compute next_exam
    const today = formatLocalDate(new Date());
    const upcomingAttempts = myAttempts
      .filter((a: any) => a.exam_date && a.exam_date >= today && a.state !== 'completed' && a.state !== 'scorecard_uploaded')
      .sort((a: any, b: any) => a.exam_date.localeCompare(b.exam_date));

    let nextExam = null;
    if (upcomingAttempts.length > 0) {
      const next = upcomingAttempts[0];
      const examDate = new Date(next.exam_date + 'T00:00:00');
      const todayDate = new Date(today + 'T00:00:00');
      const daysAway = Math.ceil((examDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24));
      nextExam = {
        date: next.exam_date,
        city: next.exam_city,
        days_away: daysAway,
        attempt_number: next.attempt_number,
        phase: next.phase,
        attempt_id: next.id,
      };
    }

    // 4. Overall progress
    const totalPossible = examType === 'nata' ? 3 : 2; // Phase 1 (2) + Phase 2 (1) for NATA
    const activated = myAttempts.length;
    const completed = myAttempts.filter((a: any) => a.state === 'completed' || a.state === 'scorecard_uploaded').length;
    const scores = myAttempts
      .map((a: any) => a.total_score)
      .filter((s: any) => s !== null && s !== undefined) as number[];
    const bestScore = scores.length > 0 ? Math.max(...scores) : null;

    // 5. Forward to schedule API (reuse the same request with params)
    const phase = request.nextUrl.searchParams.get('phase') || 'phase_1';
    const weekOffset = request.nextUrl.searchParams.get('week_offset') || '0';

    const scheduleUrl = new URL('/api/exam-schedule', request.url);
    scheduleUrl.searchParams.set('classroom', classroomId);
    scheduleUrl.searchParams.set('exam_type', examType);
    scheduleUrl.searchParams.set('year', String(year));
    scheduleUrl.searchParams.set('phase', phase);
    scheduleUrl.searchParams.set('week_offset', weekOffset);

    const scheduleRes = await fetch(scheduleUrl.toString(), {
      headers: { Authorization: request.headers.get('Authorization') || '' },
    });

    const schedule = scheduleRes.ok ? await scheduleRes.json() : null;

    return NextResponse.json({
      registrations: registrations || [],
      my_attempts: myAttempts,
      next_exam: nextExam,
      overall_progress: {
        total_possible: totalPossible,
        activated,
        completed,
        best_score: bestScore,
      },
      schedule,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load unified exams';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
