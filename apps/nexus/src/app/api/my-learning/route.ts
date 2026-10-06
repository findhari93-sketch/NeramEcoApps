import { NextRequest, NextResponse } from 'next/server';
import { resolveAssistantCaller } from '@/lib/assistant/caller';
import { NO_STORE, assistantErrorResponse } from '@/lib/assistant/http';
import { assertTutorOn } from '@/lib/assistant/tutor/gate';
import { listLearningItems } from '@/lib/assistant/tutor/learning-items';

export const dynamic = 'force-dynamic';
// GET-only: Next 14 would otherwise write the uncached Graph /me fetch in ms-verify to the Data Cache (billed as ISR writes).
export const fetchCache = 'force-no-store';

/** GET /api/my-learning?kind=formula|concept|explanation|mistake|...|important   (student, own items) */
export async function GET(request: NextRequest) {
  try {
    const { caller, supabase, features } = await resolveAssistantCaller(request.headers.get('Authorization'));
    await assertTutorOn(supabase, features);
    const items = await listLearningItems(supabase, caller.id, request.nextUrl.searchParams.get('kind'));
    return NextResponse.json({ items }, { headers: NO_STORE });
  } catch (err) {
    return assistantErrorResponse(err, 'my-learning GET');
  }
}
