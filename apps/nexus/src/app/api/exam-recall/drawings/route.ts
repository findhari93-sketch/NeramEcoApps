import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import { getSupabaseAdminClient } from '@neram/database';
import {
  listDrawingRecalls,
  createDrawingRecall,
} from '@neram/database/queries';

/**
 * GET /api/exam-recall/drawings?thread_id=...
 *
 * List drawing recalls for a thread.
 */
export async function GET(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

    const supabase = getSupabaseAdminClient();
    const { data: user } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const threadId = request.nextUrl.searchParams.get('thread_id');

    if (!threadId) {
      return NextResponse.json({ error: 'Missing thread_id parameter' }, { status: 400 });
    }

    const drawings = await listDrawingRecalls(threadId);

    return NextResponse.json({ drawings });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list drawing recalls';
    console.error('[exam-recall/drawings] GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/exam-recall/drawings
 *
 * Create a drawing recall entry.
 * Body: matches NexusExamRecallDrawingInsert
 */
export async function POST(request: NextRequest) {
  try {
    const msUser = await verifyMsToken(request.headers.get('Authorization'));

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

    if (!body.thread_id || !body.question_number) {
      return NextResponse.json(
        { error: 'Missing required fields: thread_id, question_number' },
        { status: 400 },
      );
    }

    const drawing = await createDrawingRecall({
      ...body,
      created_by: user.id,
    });

    return NextResponse.json(drawing, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create drawing recall';
    console.error('[exam-recall/drawings] POST error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
