import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/documents/exam-attempts?classroom={id}&exam_type=nata
 * Returns student's own attempts for the classroom
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const classroomId = request.nextUrl.searchParams.get('classroom');

    if (!classroomId) {
      return NextResponse.json({ error: 'Missing classroom parameter' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let query = (supabase as any)
      .from('nexus_student_exam_attempts')
      .select('*')
      .eq('student_id', user.id)
      .eq('classroom_id', classroomId);

    const examType = request.nextUrl.searchParams.get('exam_type');
    if (examType) query = query.eq('exam_type', examType);

    const { data, error } = await query.order('attempt_number', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ attempts: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load exam attempts';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/documents/exam-attempts
 * Create or update an exam attempt
 * Body: { classroom_id, exam_type, phase, attempt_number, exam_date_id?, state?, application_date?, notes? }
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const { classroom_id, exam_type, phase, attempt_number, exam_date_id, state, application_date, notes } = body;

    if (!classroom_id || !exam_type || !phase || !attempt_number) {
      return NextResponse.json({ error: 'Missing required fields: classroom_id, exam_type, phase, attempt_number' }, { status: 400 });
    }

    const { data, error } = await (supabase as any)
      .from('nexus_student_exam_attempts')
      .upsert(
        {
          student_id: user.id,
          classroom_id,
          exam_type,
          phase,
          attempt_number,
          exam_date_id: exam_date_id || null,
          state: state || 'planning',
          application_date: application_date || null,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,classroom_id,exam_type,phase,attempt_number' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ attempt: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update exam attempt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
