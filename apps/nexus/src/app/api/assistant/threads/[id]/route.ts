import { NextRequest, NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api-errors';
import { resolveAssistantCaller } from '@/lib/assistant/caller';
import { getThread, listMessages } from '@/lib/assistant/store';

export const dynamic = 'force-dynamic';

/** GET /api/assistant/threads/[id]: the messages of one of the caller's threads. */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { caller, supabase } = await resolveAssistantCaller(request.headers.get('Authorization'));
    const thread = await getThread(supabase, params.id);
    if (!thread || thread.user_id !== caller.id) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    const messages = await listMessages(supabase, thread.id, 50);
    return NextResponse.json(
      { thread: { id: thread.id }, messages: messages.map((m) => ({ id: m.id, role: m.role, text: m.text, envelope: m.envelope, created_at: m.created_at })) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    return errorResponse(err, 'Could not load the chat');
  }
}
