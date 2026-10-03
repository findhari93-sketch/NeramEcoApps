import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';
import { errorResponse } from '@/lib/api-errors';
import { verifyMsToken } from '@/lib/ms-verify';
import { getRequestUser } from '@/lib/study-materials';
import { assertAssistantAccess } from '@/lib/assistant/access';
import { buildBrief } from '@/lib/assistant/brief';
import { istHour, loadBriefFacts } from '@/lib/assistant/brief-load';

export const dynamic = 'force-dynamic';
// GET-only: Next 14 would otherwise write the uncached Graph /me fetch in ms-verify to the Data Cache (billed as ISR writes).
export const fetchCache = 'force-no-store';

/**
 * GET /api/assistant/brief   (student)
 *
 * The dashboard card. Its own route rather than a field on the dashboard
 * payload because the dashboard route is the page's critical path and this
 * needs six loaders it does not have; the card shows a skeleton meanwhile.
 * Per-user and gate-dependent, so uncacheable by construction.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = request.headers.get('Authorization');
    await verifyMsToken(auth);
    const caller = await getRequestUser(auth);
    const supabase = getSupabaseAdminClient() as any;
    const features = await assertAssistantAccess(supabase, caller);

    const now = new Date();
    const facts = await loadBriefFacts(supabase, caller.id, now, features);
    return NextResponse.json({ brief: buildBrief(facts, istHour(now)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not build your brief');
  }
}
