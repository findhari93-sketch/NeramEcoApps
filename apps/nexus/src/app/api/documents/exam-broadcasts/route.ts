import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/documents/exam-broadcasts?classroom={id}&exam_type=jee
 * Returns broadcasts for classroom, optional exam_type filter
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
      .from('nexus_exam_broadcasts')
      .select('*')
      .eq('classroom_id', classroomId);

    const examType = request.nextUrl.searchParams.get('exam_type');
    if (examType) query = query.eq('exam_type', examType);

    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({ broadcasts: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load exam broadcasts';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/documents/exam-broadcasts (teacher-only)
 * Body: { classroom_id, exam_type, broadcast_type, message? }
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
    const { classroom_id, exam_type, broadcast_type, message } = body;

    if (!classroom_id || !exam_type || !broadcast_type) {
      return NextResponse.json({ error: 'Missing required fields: classroom_id, exam_type, broadcast_type' }, { status: 400 });
    }

    const { data, error } = await (supabase as any)
      .from('nexus_exam_broadcasts')
      .insert({
        classroom_id,
        exam_type,
        broadcast_type,
        message: message || null,
        sent_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ broadcast: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create broadcast';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
