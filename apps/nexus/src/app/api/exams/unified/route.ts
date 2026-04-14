import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getExamConfig } from '@/lib/exam-config';
import { getExamRoster } from '@/lib/exam-roster';

function formatLocalDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * GET /api/exams/unified?exam_type=nata&year=2026&phase=phase_1&week_offset=0
 * Returns combined personal exam data + classroom schedule in one call.
 * Exam data is aggregated across all classrooms the user is enrolled in.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const examType = request.nextUrl.searchParams.get('exam_type') || 'nata';
    const year = parseInt(request.nextUrl.searchParams.get('year') || String(new Date().getFullYear()));

    const supabase = getSupabaseAdminClient();
    const db = supabase as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Verify user has at least one active enrollment
    const { studentIds, isTeacher } = await getExamRoster(db, user.id);
    if (studentIds.length === 0 && !isTeacher) {
      return NextResponse.json({ error: 'Not enrolled in any classroom' }, { status: 403 });
    }

    // Get exam config
    const examConfig = getExamConfig(examType);

    // 1. Personal: registrations (no classroom filter)
    const { data: registrations } = await db
      .from('nexus_student_exam_registrations')
      .select('id, exam_type, is_writing, application_number')
      .eq('student_id', user.id)
      .eq('exam_type', examType);

    // 2. Personal: my attempts (no classroom filter)
    const { data: rawAttempts } = await db
      .from('nexus_student_exam_attempts')
      .select('id, exam_type, phase, attempt_number, exam_date, exam_date_id, exam_city, exam_session, state, aptitude_score, drawing_score, total_score, exam_completed_at')
      .eq('student_id', user.id)
      .eq('exam_type', examType)
      .is('deleted_at', null)
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
      for (const d of (resolved || [])) dateMap[d.id] = d.exam_date?.split('T')[0] || d.exam_date;
      myAttempts = myAttempts.map((a: any) => ({
        ...a,
        exam_date: a.exam_date?.split('T')[0] || dateMap[a.exam_date_id] || null,
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
    const totalPossible = examType === 'nata' ? 3 : 2;
    const activated = myAttempts.length;
    const completed = myAttempts.filter((a: any) => a.state === 'completed' || a.state === 'scorecard_uploaded').length;
    const scores = myAttempts
      .map((a: any) => a.total_score)
      .filter((s: any) => s !== null && s !== undefined) as number[];
    const bestScore = scores.length > 0 ? Math.max(...scores) : null;

    // 5. Phase 2 eligibility (NATA-specific)
    let phase2Eligible = true;
    let phase2Reason: string | null = null;
    if (examType === 'nata' && examConfig?.phase2Rule === 'only_if_missed_phase1') {
      const phase1Attempted = myAttempts.some(
        (a: any) => a.phase === 'phase_1' && ['applied', 'completed', 'scorecard_uploaded'].includes(a.state)
      );
      if (phase1Attempted) {
        phase2Eligible = false;
        phase2Reason = 'Phase 2 is only for students who missed Phase 1';
      }
    }

    // 6. Forward to schedule API
    const phase = request.nextUrl.searchParams.get('phase') || 'phase_1';
    const weekOffset = request.nextUrl.searchParams.get('week_offset') || '0';

    const scheduleUrl = new URL('/api/exam-schedule', request.url);
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
      phase_2_eligible: phase2Eligible,
      phase_2_reason: phase2Reason,
      exam_config: examConfig || null,
      schedule,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load unified exams';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
