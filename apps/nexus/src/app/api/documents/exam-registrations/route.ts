import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * GET /api/documents/exam-registrations?classroom={id}
 * Returns student's own exam registrations for the classroom
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

    const { data, error } = await (supabase as any)
      .from('nexus_exam_registrations')
      .select('*')
      .eq('student_id', user.id)
      .eq('classroom_id', classroomId);

    if (error) throw error;

    return NextResponse.json({ registrations: data || [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load exam registrations';
    return NextResponse.json({ error: message }, { status: 401 });
  }
}

/**
 * POST /api/documents/exam-registrations
 * Create or update an exam registration
 * Body: { classroom_id, exam_type, is_writing, application_number?, notes? }
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
    const { classroom_id, exam_type, is_writing, application_number, notes } = body;

    if (!classroom_id || !exam_type || is_writing === undefined) {
      return NextResponse.json({ error: 'Missing required fields: classroom_id, exam_type, is_writing' }, { status: 400 });
    }

    const { data, error } = await (supabase as any)
      .from('nexus_exam_registrations')
      .upsert(
        {
          student_id: user.id,
          classroom_id,
          exam_type,
          is_writing,
          application_number: application_number || null,
          notes: notes || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'student_id,classroom_id,exam_type' }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ registration: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update exam registration';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
