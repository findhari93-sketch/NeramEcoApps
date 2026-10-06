import { NextRequest, NextResponse } from 'next/server';
import { resolveAssistantCaller } from '@/lib/assistant/caller';
import { NO_STORE, assistantErrorResponse } from '@/lib/assistant/http';
import { assertTutorOn } from '@/lib/assistant/tutor/gate';
import { readAction, runTutorTurn } from '@/lib/assistant/tutor/turn';

export const dynamic = 'force-dynamic';
// At most one Gemini call per turn (a typed reply the rules cannot read).
export const maxDuration = 15;

/**
 * POST /api/assistant/tutor/turn   (student)
 * body { questionId, action, clientMessageId }  ->  TutorEnvelope
 * Contract: lib/assistant/tutor/types.ts.
 */
export async function POST(request: NextRequest) {
  try {
    const { caller, supabase, features } = await resolveAssistantCaller(request.headers.get('Authorization'));
    await assertTutorOn(supabase, features);
    const body = await request.json().catch(() => ({}));
    const action = readAction(body?.action);
    if (!action) return NextResponse.json({ error: 'That did not come through. Tap it again.' }, { status: 400, headers: NO_STORE });
    const questionId = typeof body?.questionId === 'string' ? body.questionId : '';
    const clientMessageId = typeof body?.clientMessageId === 'string' ? body.clientMessageId : '';
    const envelope = await runTutorTurn({ supabase, caller, questionId, action, clientMessageId });
    return NextResponse.json(envelope, { headers: NO_STORE });
  } catch (err) {
    return assistantErrorResponse(err, 'tutor turn');
  }
}
