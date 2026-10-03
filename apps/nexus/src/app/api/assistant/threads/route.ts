import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { resolveAssistantCaller } from '@/lib/assistant/caller';
import { createThread } from '@/lib/assistant/store';

export const dynamic = 'force-dynamic';

/** POST /api/assistant/threads  body { pageContext? }: "New chat". */
export async function POST(request: NextRequest) {
  try {
    const { caller, supabase } = await resolveAssistantCaller(request.headers.get('Authorization'));
    const body = await request.json().catch(() => ({}));
    const thread = await createThread(supabase, { userId: caller.id, channel: 'nexus', pageContext: body?.pageContext ?? null });
    return NextResponse.json({ threadId: thread.id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return errorResponse(err, 'Could not start a chat');
  }
}
