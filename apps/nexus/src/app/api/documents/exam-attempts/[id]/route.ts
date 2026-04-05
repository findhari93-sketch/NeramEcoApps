import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * PATCH /api/documents/exam-attempts/[id]
 * Update an exam attempt's state, exam_date_id, or completion date
 * Body: { state?, exam_date_id?, exam_completed_at?, application_date? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { id } = await params;
    const body = await request.json();

    const allowedFields = ['state', 'exam_date_id', 'exam_completed_at', 'application_date', 'notes', 'exam_city', 'exam_session'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    const db = supabase as any;

    // Verify ownership
    const { data: existing } = await db
      .from('nexus_student_exam_attempts')
      .select('student_id')
      .eq('id', id)
      .single();

    if (!existing || existing.student_id !== user.id) {
      return NextResponse.json({ error: 'Not found or not authorized' }, { status: 404 });
    }

    const { data, error } = await db
      .from('nexus_student_exam_attempts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ attempt: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update attempt';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
