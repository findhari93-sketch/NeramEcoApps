import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';

/**
 * PATCH /api/documents/exam-attempts/[id]/scores
 * Update scores for an exam attempt and set state to 'scorecard_uploaded'
 * Body: { aptitude_score?, drawing_score?, total_score? }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const supabase = getSupabaseAdminClient();

    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Validate the attempt belongs to the authenticated user
    const { data: attempt } = await (supabase as any)
      .from('nexus_student_exam_attempts')
      .select('id, student_id')
      .eq('id', id)
      .single();

    if (!attempt) {
      return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
    }

    if (attempt.student_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { aptitude_score, drawing_score, total_score } = body;

    const updateData: Record<string, unknown> = {
      state: 'scorecard_uploaded',
      updated_at: new Date().toISOString(),
    };

    if (aptitude_score !== undefined) updateData.aptitude_score = aptitude_score;
    if (drawing_score !== undefined) updateData.drawing_score = drawing_score;
    if (total_score !== undefined) updateData.total_score = total_score;

    const { data, error } = await (supabase as any)
      .from('nexus_student_exam_attempts')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ attempt: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update scores';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
