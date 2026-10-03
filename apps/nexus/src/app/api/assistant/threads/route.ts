import { NextRequest, NextResponse } from 'next/server';
import { resolveAssistantCaller } from '@/lib/assistant/caller';
import { NO_STORE, assistantErrorResponse, readPage } from '@/lib/assistant/http';
import { createThread } from '@/lib/assistant/store';

export const dynamic = 'force-dynamic';

/** POST /api/assistant/threads  body { pageContext? }: "New chat". */
export async function POST(request: NextRequest) {
  try {
    const { caller, supabase } = await resolveAssistantCaller(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    // The same validation as the turn route: a path and two ids, never the raw body.
    const thread = await createThread(supabase, { userId: caller.id, channel: 'nexus', pageContext: readPage(body?.pageContext) as Record<string, unknown> | null });
    return NextResponse.json({ threadId: thread.id }, { headers: NO_STORE });
  } catch (err) {
    return assistantErrorResponse(err, 'threads POST');
  }
}
