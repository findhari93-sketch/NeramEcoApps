import { NextRequest, NextResponse } from 'next/server';
import { getStudentPrimaryClassroom } from '@neram/database/queries/nexus';
import { errorResponse } from '@/lib/api-errors';
import { cancelAction, confirmAction } from '@/lib/assistant/actions';
import { baseUrlOf, resolveAssistantCaller } from '@/lib/assistant/caller';
import '@/lib/assistant/registry-all';
import { appendMessage } from '@/lib/assistant/store';
import type { ToolContext } from '@/lib/assistant/types';

export const dynamic = 'force-dynamic';
const NO_STORE = { 'Cache-Control': 'no-store' };

async function contextFor(request: NextRequest): Promise<ToolContext> {
  const { caller, supabase, features } = await resolveAssistantCaller(request.headers.get('Authorization'));
  const classroom = await getStudentPrimaryClassroom(caller.id, supabase).catch(() => null);
  return { caller, channel: 'nexus', mode: 'general', supabase, classroomId: classroom?.id ?? null, threadId: null, now: new Date(), baseUrl: baseUrlOf(request), features };
}

async function respond(ctx: ToolContext, outcome: Awaited<ReturnType<typeof confirmAction>>) {
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status, headers: NO_STORE });
  if (outcome.threadId) {
    await appendMessage(ctx.supabase, { threadId: outcome.threadId, role: 'assistant', text: outcome.reply, envelope: { reply: outcome.reply, suggestions: [], links: outcome.links, action: null, mode: 'general', threadId: outcome.threadId } }).catch(() => undefined);
  }
  return NextResponse.json(outcome, { headers: NO_STORE });
}

/** POST /api/assistant/actions/[id]  body { token }: confirm and execute. */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await contextFor(request);
    const body = await request.json().catch(() => ({}));
    if (typeof body?.token !== 'string' || !body.token) return NextResponse.json({ error: 'Missing token' }, { status: 400, headers: NO_STORE });
    return respond(ctx, await confirmAction(ctx, { id: params.id, token: body.token }));
  } catch (err) {
    return errorResponse(err, 'Could not confirm that');
  }
}

/** DELETE /api/assistant/actions/[id]: cancel a pending action. */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ctx = await contextFor(request);
    return respond(ctx, await cancelAction(ctx, { id: params.id }));
  } catch (err) {
    return errorResponse(err, 'Could not cancel that');
  }
}
