import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/exams/student/{studentId}?exam_type=nata
 * Returns detailed exam data for a specific student.
 * Auth: teacher must share a classroom with the student, or student viewing themselves.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> },
) {
  try {
    const { studentId } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const examType = request.nextUrl.searchParams.get('exam_type') || 'nata';

    const supabase = getSupabaseAdminClient();
    const db = supabase as any;

    const { data: viewer } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!viewer) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Auth check: viewer is the student themselves, or shares a classroom
    if (viewer.id !== studentId) {
      const { data: sharedClassroom } = await db
        .from('nexus_enrollments')
        .select('classroom_id')
        .eq('user_id', viewer.id)
        .eq('is_active', true);

      const viewerClassrooms = (sharedClassroom || []).map((e: any) => e.classroom_id);

      const { data: studentEnrollment } = await db
        .from('nexus_enrollments')
        .select('classroom_id')
        .eq('user_id', studentId)
        .eq('is_active', true)
        .in('classroom_id', viewerClassrooms)
        .limit(1);

      if (!studentEnrollment || studentEnrollment.length === 0) {
        return NextResponse.json({ error: 'Not authorized to view this student' }, { status: 403 });
      }
    }

    // Get student info
    const { data: student } = await supabase
      .from('users')
      .select('id, first_name, last_name, name')
      .eq('id', studentId)
      .single();

    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const studentName = student.first_name && student.last_name
      ? `${student.first_name} ${student.last_name}`
      : student.name || 'Unknown';

    // Get academic year from onboarding
    const { data: onboarding } = await db
      .from('nexus_student_onboarding')
      .select('academic_year')
      .eq('student_id', studentId)
      .limit(1);

    const academicYear = onboarding?.[0]?.academic_year ?? null;

    // Get all attempts for this exam type (all phases)
    const { data: attempts } = await db
      .from('nexus_student_exam_attempts')
      .select('id, exam_type, phase, attempt_number, exam_date, exam_city, exam_session, state, aptitude_score, drawing_score, total_score, exam_completed_at')
      .eq('student_id', studentId)
      .eq('exam_type', examType)
      .is('deleted_at', null)
      .order('phase', { ascending: true })
      .order('attempt_number', { ascending: true });

    // Get exam plan
    const { data: plans } = await db
      .from('nexus_student_exam_plans')
      .select('state, target_year, application_number')
      .eq('student_id', studentId)
      .eq('exam_type', examType);

    const plan = plans?.[0] ?? null;

    // Get exam registration
    const { data: registrations } = await db
      .from('nexus_student_exam_registrations')
      .select('is_writing, application_number')
      .eq('student_id', studentId)
      .eq('exam_type', examType);

    const registration = registrations?.[0] ?? null;

    // Normalize dates
    const normalizedAttempts = (attempts || []).map((a: any) => ({
      ...a,
      exam_date: a.exam_date?.split('T')[0] || null,
    }));

    return NextResponse.json({
      student: {
        id: studentId,
        name: studentName,
        academic_year: academicYear,
      },
      attempts: normalizedAttempts,
      plan,
      registration,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load student details';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
