import { NextRequest, NextResponse } from 'next/server';
import { resolveAssistantCaller } from '@/lib/assistant/caller';
import { NO_STORE, assistantErrorResponse } from '@/lib/assistant/http';
import { isUuid } from '@/lib/assistant/ids';
import { getThread, listMessages } from '@/lib/assistant/store';

export const dynamic = 'force-dynamic';
// GET-only: Next 14 would otherwise write the uncached Graph /me fetch in ms-verify to the Data Cache (billed as ISR writes).
export const fetchCache = 'force-no-store';

/** GET /api/assistant/threads/[id]: the messages of one of the caller's threads. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { caller, supabase } = await resolveAssistantCaller(request.headers.get('Authorization'));
    if (!isUuid(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
    const thread = await getThread(supabase, params.id);
    if (!thread || thread.user_id !== caller.id) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: NO_STORE });
    const messages = await listMessages(supabase, thread.id, 50);
    return NextResponse.json(
      { thread: { id: thread.id }, messages: messages.map((m) => ({ id: m.id, role: m.role, text: m.text, envelope: m.envelope, created_at: m.created_at })) },
      { headers: NO_STORE },
    );
  } catch (err) {
    return assistantErrorResponse(err, 'threads GET');
  }
}
