import { NextRequest, NextResponse } from 'next/server';
import { resolveAssistantCaller } from '@/lib/assistant/caller';
import { NO_STORE, assistantErrorResponse } from '@/lib/assistant/http';
import { isUuid } from '@/lib/assistant/ids';
import { filterSuggestions } from '@/lib/assistant/page-suggestions';
import { getThread, listMessages } from '@/lib/assistant/store';

export const dynamic = 'force-dynamic';
// GET-only: Next 14 would otherwise write the uncached Graph /me fetch in ms-verify to the Data Cache (billed as ISR writes).
export const fetchCache = 'force-no-store';

/** GET /api/assistant/threads/[id]: the messages of one of the caller's threads. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { caller, supabase, features } = await resolveAssistantCaller(request.headers.get('Authorization'));
    if (!isUuid(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
    const thread = await getThread(supabase, params.id);
    if (!thread || thread.user_id !== caller.id) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
    const messages = await listMessages(supabase, thread.id, 50);
    return NextResponse.json(
      {
        thread: { id: thread.id },
        messages: messages.map((m) => ({
          id: m.id, role: m.role, text: m.text, created_at: m.created_at,
          // Chips stored under yesterday's switches are re-filtered under today's (parked minor c).
          envelope: m.envelope ? { ...m.envelope, suggestions: filterSuggestions(m.envelope.suggestions || [], features) } : null,
        })),
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    return assistantErrorResponse(err, 'threads GET');
  }
}
