import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/documents/exam-plans?classroom={id}
 * Returns student's exam plans for the classroom
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

    // nexus_student_exam_plans may not be in generated types
    const { data, error } = await (supabase as any)
      .from('nexus_student_exam_plans')
      .select('*')
      .eq('student_id', user.id)
      .eq('classroom_id', classroomId);

    if (error) throw error;

    return NextResponse.json({ plans: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load exam plans';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/documents/exam-plans
 * Create or update an exam plan
 * Body: { classroom_id, exam_type, state, application_number?, notes? }
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
    const { classroom_id, exam_type, state, application_number, notes } = body;

    if (!classroom_id || !exam_type || !state) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data, error } = await (supabase as any)
      .from('nexus_student_exam_plans')
      .upsert(
        {
          student_id: user.id,
          classroom_id,
          exam_type,
          state,
          application_number: application_number || null,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,classroom_id,exam_type' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ plan: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update exam plan';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
