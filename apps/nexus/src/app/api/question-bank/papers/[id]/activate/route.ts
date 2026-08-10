import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import {
  getSupabaseAdminClient,
  bulkActivateQuestions,
} from '@neram/database';
import { createDrawingQuestionFromQB } from '@neram/database/queries/nexus';

import { describeError } from '@/lib/api-errors';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const access = await verifyQBStaff(authHeader);
    if (!access.ok) return access.response;
    const supabase = getSupabaseAdminClient();

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
    console.error('[Activate API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
