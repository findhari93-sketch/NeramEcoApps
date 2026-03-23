import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  getExamRecallThread,
  updateThreadStatus,
} from '@neram/database/queries';

/**
 * GET /api/exam-recall/threads/[id]
 *
 * Get full thread detail including versions, confirms, comments, drawings, variants, uploads.
 */
export async function GET(
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

    const thread = await getExamRecallThread(id, user.id);

    if (!thread) {
      return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
    }

    return NextResponse.json(thread);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to get exam recall thread';
    console.error('[exam-recall/threads/[id]] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/exam-recall/threads/[id]
 *
 * Update thread status. Only teachers/admins.
 * Body: { status, published_question_id? }
 */
export async function PATCH(
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

    if (!['teacher', 'admin'].includes(user.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden: only teachers and admins can update thread status' }, { status: 403 });
    }

    const body = await request.json();
    const { status, published_question_id } = body;

    if (!status) {
      return NextResponse.json({ error: 'Missing required field: status' }, { status: 400 });
    }

    const updated = await updateThreadStatus(id, status, user.id, published_question_id);

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update thread status';
    console.error('[exam-recall/threads/[id]] PATCH error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
