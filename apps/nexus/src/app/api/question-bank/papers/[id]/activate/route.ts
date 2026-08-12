import { NextRequest, NextResponse } from 'next/server';
import { verifyQBStaff } from '@/lib/qb-auth';
import { activatePaperQuestions } from '@/lib/activate-paper';

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

    const result = await activatePaperQuestions(params.id);
    const drawingBridgeCount = result.drawing_questions_bridged;

    return NextResponse.json({
      data: result,
      message: `${result.activated} questions activated${drawingBridgeCount > 0 ? `, ${drawingBridgeCount} drawing questions linked to practice module` : ''}`,
    }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    console.error('[Activate API] Error:', describeError(err));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
