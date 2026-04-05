import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * POST /api/exam-schedule/my-date
 * Student submits their exam date, city, and session.
 * Body: { exam_date_id, exam_city, exam_session, classroom_id }
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
    const { exam_date_id, exam_city, exam_session, classroom_id } = body;

    if (!exam_date_id || !classroom_id) {
      return NextResponse.json(
        { error: 'Missing required fields: exam_date_id, classroom_id' },
        { status: 400 }
      );
    }

    if (exam_session && !['morning', 'afternoon'].includes(exam_session)) {
      return NextResponse.json({ error: 'exam_session must be morning or afternoon' }, { status: 400 });
    }

    // Verify student enrollment
    const { data: enrollment } = await db
      .from('nexus_enrollments')
      .select('role')
      .eq('user_id', user.id)
      .eq('classroom_id', classroom_id)
      .eq('role', 'student')
      .eq('is_active', true)
      .single();

    if (!enrollment) {
      return NextResponse.json({ error: 'Not enrolled as student in this classroom' }, { status: 403 });
    }

    // Look up the exam date to get phase and attempt_number
    const { data: examDate, error: dateError } = await db
      .from('nexus_exam_dates')
      .select('exam_type, phase, attempt_number')
      .eq('id', exam_date_id)
      .single();

    if (dateError || !examDate) {
      return NextResponse.json({ error: 'Exam date not found' }, { status: 404 });
    }

    // Upsert the attempt
    const { data, error } = await db
      .from('nexus_student_exam_attempts')
      .upsert(
        {
          student_id: user.id,
          classroom_id,
          exam_type: examDate.exam_type,
          phase: examDate.phase,
          attempt_number: examDate.attempt_number,
          exam_date_id,
          exam_city: exam_city || null,
          exam_session: exam_session || null,
          state: 'applied',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,classroom_id,exam_type,phase,attempt_number' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ attempt: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit exam date';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
