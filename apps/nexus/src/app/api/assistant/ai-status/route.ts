import { NextRequest, NextResponse } from 'next/server';
import { buildAiStatus } from '@/lib/assistant/ai-access';
import { resolveAssistantCaller } from '@/lib/assistant/caller';
import { NO_STORE, assistantErrorResponse } from '@/lib/assistant/http';

export const dynamic = 'force-dynamic';
// GET-only: Next 14 would otherwise write the uncached Graph /me fetch in ms-verify to the Data Cache.
export const fetchCache = 'force-no-store';

/**
 * GET /api/assistant/ai-status   (student)
 * Whether this student has AI answers right now, why, and how many are left
 * today. Called when the panel opens, never on page load (D8).
 */
export async function GET(request: NextRequest) {
  try {
    const { caller, supabase } = await resolveAssistantCaller(request.headers.get('Authorization'));
    return NextResponse.json(await buildAiStatus(supabase, caller.id, new Date(), { impersonating: caller.impersonating }), { headers: NO_STORE });
  } catch (err) {
    return assistantErrorResponse(err, 'ai-status');
  }
}
