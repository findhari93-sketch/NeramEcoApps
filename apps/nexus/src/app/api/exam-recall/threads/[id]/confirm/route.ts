import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import { toggleConfirm } from '@neram/database/queries';

/**
 * POST /api/exam-recall/threads/[id]/confirm
 *
 * Toggle confirm on a thread.
 * Body: { exam_date?, session_number?, note? }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));
    const { id } = await params;

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { exam_date, session_number, note } = body;

    const result = await toggleConfirm(
      id,
      user.id,
      exam_date,
      session_number,
      note,
    );

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to toggle confirm';
    console.error('[exam-recall/threads/[id]/confirm] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
