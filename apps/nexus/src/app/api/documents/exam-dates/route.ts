import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/documents/exam-dates?exam_type=nata&year=2026
 * Returns active exam dates, ordered by exam_date
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    let query = (supabase as any)
      .from('nexus_exam_dates')
      .select('*')
      .eq('is_active', true);

    const examType = request.nextUrl.searchParams.get('exam_type');
    if (examType) query = query.eq('exam_type', examType);

    const year = request.nextUrl.searchParams.get('year');
    if (year) query = query.eq('year', parseInt(year, 10));

    const { data, error } = await query.order('exam_date', { ascending: true });
    if (error) throw error;

    return NextResponse.json({ exam_dates: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load exam dates';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/documents/exam-dates (teacher-only)
 * Body: { exam_type, year, phase, attempt_number, exam_date, label?, registration_deadline? }
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

    // Teacher check
    const { data: teacher } = await (supabase as any)
      .from('nexus_enrollments')
      .select('id')
      .eq('user_id', user.id)
      .eq('role', 'teacher')
      .eq('is_active', true)
      .limit(1)
      .single();
    if (!teacher) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const body = await request.json();
    const { exam_type, year, phase, attempt_number, exam_date, label, registration_deadline } = body;

    if (!exam_type || !year || !phase || !attempt_number || !exam_date) {
      return NextResponse.json({ error: 'Missing required fields: exam_type, year, phase, attempt_number, exam_date' }, { status: 400 });
    }

    const { data, error } = await (supabase as any)
      .from('nexus_exam_dates')
      .insert({
        exam_type,
        year,
        phase,
        attempt_number,
        exam_date,
        label: label || null,
        registration_deadline: registration_deadline || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ exam_date: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create exam date';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
