import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/documents/exam-plans?exam_type=nata
 * Returns student's exam plans. No classroom filter needed.
 * Accepts optional classroom param for backward compatibility.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const examType = request.nextUrl.searchParams.get('exam_type');

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let query = (supabase as any)
      .from('nexus_student_exam_plans')
      .select('*')
      .eq('student_id', user.id);

    if (examType) {
      query = query.eq('exam_type', examType);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ plans: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load exam plans';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/documents/exam-plans
 * Create or update an exam plan.
 * Body: { exam_type, state, application_number?, notes?, classroom_id? }
 * classroom_id is optional (kept for backward compat, stored for audit).
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
    const { exam_type, state, application_number, notes, classroom_id, target_year } = body;

    if (!exam_type || !state) {
      return NextResponse.json({ error: 'Missing required fields: exam_type, state' }, { status: 400 });
    }

    const { data, error } = await (supabase as any)
      .from('nexus_student_exam_plans')
      .upsert(
        {
          student_id: user.id,
          classroom_id: classroom_id || null,
          exam_type,
          state,
          application_number: application_number || null,
          target_year: target_year || null,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,exam_type' }
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
