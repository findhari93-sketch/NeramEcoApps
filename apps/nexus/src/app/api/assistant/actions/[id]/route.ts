import { NextRequest, NextResponse } from 'next/server';
import { describeError } from '@/lib/api-errors';
import { getStudentPrimaryClassroom } from '@neram/database/queries/nexus';
import { cancelAction, confirmAction } from '@/lib/assistant/actions';
import { baseUrlOf, resolveAssistantCaller } from '@/lib/assistant/caller';
import { NO_STORE, assistantErrorResponse } from '@/lib/assistant/http';
import { isUuid } from '@/lib/assistant/ids';
import '@/lib/assistant/registry-all';
import { appendMessage } from '@/lib/assistant/store';
import type { ToolContext } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';

/** An id that is not a uuid cannot name an action (Ruling 26): the same answer as a missing one. */
const gone = () => NextResponse.json({ error: 'That action is gone.' }, { status: 404, headers: NO_STORE });

async function contextFor(request: NextRequest): Promise<ToolContext> {
  const { caller, supabase, features } = await resolveAssistantCaller(request.headers.get('Authorization'));
  const classroom = await getStudentPrimaryClassroom(caller.id, supabase).catch(() => null);
  return { caller, channel: 'nexus', mode: 'general', supabase, classroomId: classroom?.id ?? null, threadId: null, now: new Date(), baseUrl: baseUrlOf(request), features };
}

async function respond(ctx: ToolContext, outcome: Awaited<ReturnType<typeof confirmAction>>) {
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status, headers: NO_STORE });
  if (outcome.threadId) {
    await appendMessage(ctx.supabase, { threadId: outcome.threadId, role: 'assistant', text: outcome.reply, envelope: { reply: outcome.reply, suggestions: [], links: outcome.links, action: null, mode: 'general', threadId: outcome.threadId } })
      // The action already happened; a lost transcript line must not turn it into an error.
      .catch((err) => console.error('[assistant action] reply not stored:', describeError(err)));
  }
  return NextResponse.json(outcome, { headers: NO_STORE });
}

/** POST /api/assistant/actions/[id]  body { token }: confirm and execute. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await contextFor(request);
    if (!isUuid(params.id)) return gone();
    const body = await request.json().catch(() => ({}));
    if (typeof body?.token !== 'string' || !body.token) return NextResponse.json({ error: 'Missing token' }, { status: 400, headers: NO_STORE });
    return respond(ctx, await confirmAction(ctx, { id: params.id, token: body.token }));
  } catch (err) {
    return assistantErrorResponse(err, 'action confirm');
  }
}

/** DELETE /api/assistant/actions/[id]: cancel a pending action. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await contextFor(request);
    if (!isUuid(params.id)) return gone();
    return respond(ctx, await cancelAction(ctx, { id: params.id }));
  } catch (err) {
    return assistantErrorResponse(err, 'action cancel');
  }
}
