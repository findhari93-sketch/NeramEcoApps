import { NextRequest, NextResponse } from 'next/server';
import { verifyMsToken } from '@/lib/ms-verify';
import {
  getSupabaseAdminClient,
  bulkActivateQuestions,
} from '@neram/database';
import { createDrawingQuestionFromQB } from '@neram/database/queries/nexus';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const msUser = await verifyMsToken(authHeader);
    const supabase = getSupabaseAdminClient();

    const { data: caller } = await supabase
      .from('users')
      .select('id, user_type')
      .eq('ms_oid', msUser.oid)
      .single();

    if (!caller) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!['teacher', 'admin'].includes(caller.user_type ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await bulkActivateQuestions(params.id);

    // Auto-create drawing_questions rows for DRAWING_PROMPT questions
    const { data: drawingQuestions } = await supabase
      .from('nexus_qb_questions')
      .select('id')
      .eq('original_paper_id', params.id)
      .eq('question_format', 'DRAWING_PROMPT')
      .eq('is_active', true);

    let drawingBridgeCount = 0;
    if (drawingQuestions && drawingQuestions.length > 0) {
      for (const dq of drawingQuestions) {
        try {
          await createDrawingQuestionFromQB(dq.id);
          drawingBridgeCount++;
        } catch {
          // Non-fatal: log but don't fail the activation
          console.warn(`[Activate API] Failed to bridge drawing question ${dq.id}`);
        }
      }
    }

    return NextResponse.json({
      data: { ...result, drawing_questions_bridged: drawingBridgeCount },
      message: `${result.activated} questions activated${drawingBridgeCount > 0 ? `, ${drawingBridgeCount} drawing questions linked to practice module` : ''}`,
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Activate API] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
