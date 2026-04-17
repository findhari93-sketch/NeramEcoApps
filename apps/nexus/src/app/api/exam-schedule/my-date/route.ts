import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { getExamConfig, getPhaseConfig } from '@/lib/exam-config';

/**
 * POST /api/exam-schedule/my-date
 * Student submits their exam date, city, and session.
 * Body: { exam_date, exam_city, exam_session, attempt_number, phase, exam_type }
 * No classroom_id required. Exam data is student-level.
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();
    const db = supabase as any;

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { exam_date, exam_city, exam_session, attempt_number, phase, exam_type } = body;
    // Accept classroom_id for backward compat but don't require it
    const classroom_id = body.classroom_id || null;

    const resolvedExamType = exam_type || 'nata';

    if (!exam_date) {
      return NextResponse.json({ error: 'Missing required field: exam_date' }, { status: 400 });
    }

    if (exam_session && !['morning', 'afternoon'].includes(exam_session)) {
      return NextResponse.json({ error: 'exam_session must be morning or afternoon' }, { status: 400 });
    }

    // Validate exam_date is valid for the phase
    const d = new Date(exam_date + 'T00:00:00');
    const phaseConfig = getPhaseConfig(resolvedExamType, phase || 'phase_1');
    if (phaseConfig && phaseConfig.dayFilter.length > 0) {
      if (!phaseConfig.dayFilter.includes(d.getDay())) {
        const dayNames = phaseConfig.dayFilter.map(day => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]);
        return NextResponse.json(
          { error: `Exam date must be a ${dayNames.join(' or ')}` },
          { status: 400 },
        );
      }
    }

    // Verify student has at least one active enrollment
    const { data: enrollments } = await db
      .from('nexus_enrollments')
      .select('classroom_id, role')
      .eq('user_id', user.id)
      .eq('role', 'student')
      .eq('is_active', true);

    if (!enrollments || enrollments.length === 0) {
      return NextResponse.json({ error: 'Not enrolled as student in any classroom' }, { status: 403 });
    }

    const attemptNum = attempt_number || 1;
    const examPhase = phase || 'phase_1';

    // Phase enforcement for NATA
    const examConfig = getExamConfig(resolvedExamType);
    if (examConfig?.phase2Rule === 'only_if_missed_phase1' && examPhase === 'phase_2') {
      // Check if student has any Phase 1 attempts that are applied/completed
      const { data: phase1Attempts } = await db
        .from('nexus_student_exam_attempts')
        .select('id, state')
        .eq('student_id', user.id)
        .eq('exam_type', resolvedExamType)
        .eq('phase', 'phase_1')
        .is('deleted_at', null);

      const phase1Attempted = (phase1Attempts || []).some(
        (a: any) => ['applied', 'completed', 'scorecard_uploaded'].includes(a.state)
      );

      if (phase1Attempted) {
        return NextResponse.json(
          { error: 'Phase 2 is only available for students who missed Phase 1. You already have Phase 1 attempts.' },
          { status: 400 },
        );
      }
    }

    // Enforce max attempts per phase
    if (phaseConfig) {
      const { data: existingAttempts } = await db
        .from('nexus_student_exam_attempts')
        .select('id, attempt_number')
        .eq('student_id', user.id)
        .eq('exam_type', resolvedExamType)
        .eq('phase', examPhase)
        .is('deleted_at', null);

      const existingCount = (existingAttempts || []).length;
      const isUpdate = (existingAttempts || []).some((a: any) => a.attempt_number === attemptNum);

      if (!isUpdate && existingCount >= phaseConfig.maxAttempts) {
        return NextResponse.json(
          { error: `Maximum ${phaseConfig.maxAttempts} attempt(s) allowed for ${phaseConfig.label}` },
          { status: 400 },
        );
      }
    }

    // Upsert the attempt (no classroom_id in unique constraint)
    const { data, error } = await db
      .from('nexus_student_exam_attempts')
      .upsert(
        {
          student_id: user.id,
          classroom_id: classroom_id || enrollments[0]?.classroom_id || null,
          exam_type: resolvedExamType,
          phase: examPhase,
          attempt_number: attemptNum,
          exam_date,
          exam_city: exam_city || null,
          exam_session: exam_session || null,
          state: 'applied',
          deleted_at: null,
          deletion_reason: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,exam_type,phase,attempt_number' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ attempt: data });
  } catch (err) {
    const message = err instanceof Error
      ? err.message
      : (err as any)?.message || 'Failed to submit exam date';
    console.error('Exam date submission error:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
