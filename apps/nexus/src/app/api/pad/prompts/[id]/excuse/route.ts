import { NextRequest } from 'next/server';
import { assertPadStaff, resolvePadCaller } from '@/lib/pad/caller';
import { parseExcuseRequest } from '@/lib/pad/prompt-requests';
import { PadRefusal, callPad, padErrorResponse, padJson } from '@/lib/pad/rpc';
import { isUuid } from '@/lib/pad/session-binding';
import { hintPrompt, padDb } from '@/lib/pad/sessions';
import { storeRoundResultsForPrompt } from '@/lib/pad/store-results';

export const dynamic = 'force-dynamic';

/**
 * POST /api/pad/prompts/:id/excuse  (session teacher, any state)
 *
 * Body: { studentIds: uuid[], approve?: boolean | null }
 *    or { reason: 'cant_see' | ..., approve?: boolean | null }   every reason of that kind
 *
 * The teacher's decision on "I can't answer" reasons. approve true (the
 * default) excuses the student: the question counts neither for nor against
 * them. false turns the reason down; null clears the decision. Everyone's pad
 * is told, so an excused student sees it at once.
 *
 * 200 { changed, count }
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = await resolvePadCaller(request.headers.get('Authorization'));
    assertPadStaff(caller);
    if (!isUuid(params.id)) throw new PadRefusal('NOT_FOUND');

    const parsed = parseExcuseRequest(await request.json().catch(() => null));
    if (!parsed.ok) throw new PadRefusal('INVALID_INPUT', { field: parsed.field });

    const result = await callPad<{ changed: boolean; count: number }>(padDb(), 'pad_excuse', {
      p_actor: caller.user.id,
      p_prompt: params.id.toLowerCase(),
      p_students: parsed.value.studentIds,
      p_reason: parsed.value.reason,
      p_approve: parsed.value.approve,
    });
    if (result.changed) {
      await hintPrompt(params.id.toLowerCase(), 'everyone');
      await storeRoundResultsForPrompt(params.id.toLowerCase(), caller.user.id);
    }
    return padJson({ changed: result.changed, count: result.count });
  } catch (err) {
    return padErrorResponse(err, 'excuse');
  }
}
