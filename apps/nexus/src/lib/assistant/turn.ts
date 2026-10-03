/**
 * One message in, one envelope out. Four stages, in order:
 *   1. the regex router (cancel, a guided flow, a direct tool),
 *   2. a flow already in progress on the thread (unless stale),
 *   3. running the tool with no model,
 *   4. the model (M2). In M1 this stage is a polite "not yet" with chips.
 * Stages 1 to 3 never import @neram/ai.
 */
import { getStudentPrimaryClassroom } from '@neram/database/queries/nexus';
import { loadDeclinedClassIds, loadUpcomingClasses, istNow } from '@/lib/upcoming-classes';
import { proposeAction } from './actions';
import * as cannotAttend from './flows/cannot-attend';
import * as remindMe from './flows/remind-me';
import * as uploadSketch from './flows/upload-sketch';
import { isStale, type FlowDeps, type FlowOutcome, type FlowState, type Proposal } from './flows/types';
import { defaultSuggestions } from './page-suggestions';
import { findActionTool, findTool, toolsFor } from './registry-all';
import { routeIntent, type FlowName } from './router';
import { appendMessage, createThread, findReplyToExternalId, findThreadByExternalId, getThread, touchThread, type ThreadRow } from './store';
import type { AssistantCaller, Attachment, Channel, Envelope, Mode, PageContext, ToolContext, ToolLink } from './types';

export const MAX_TEXT = 2000;

const FLOWS: Record<FlowName, { start: typeof cannotAttend.start; step: typeof cannotAttend.step }> = {
  'cannot-attend': cannotAttend,
  'remind-me': remindMe,
  'upload-sketch': uploadSketch,
};

export interface TurnInput {
  supabase: any;
  caller: AssistantCaller;
  channel: Channel;
  /** A thread the caller already has open (Nexus). Ignored when it is not theirs. */
  threadId?: string | null;
  /** Teams: the conversation id, one thread per conversation. */
  threadExternalId?: string | null;
  /** Teams: the activity id, so a redelivery is answered from the store. */
  externalId?: string | null;
  text: string;
  attachment?: Attachment | null;
  pageContext?: PageContext | null;
  baseUrl: string;
  now?: Date;
}

const READ_ONLY = 'Viewing as a student is read only, so I cannot do that from here. Everything else still works.';
const NOT_YET = 'I cannot answer free questions yet. Here is what I can do right now.';

async function resolveThread(input: TurnInput): Promise<ThreadRow> {
  if (input.threadId) {
    const t = await getThread(input.supabase, input.threadId);
    if (t && t.user_id === input.caller.id && t.channel === input.channel) return t;
  }
  if (input.threadExternalId) {
    const t = await findThreadByExternalId(input.supabase, input.caller.id, input.channel, input.threadExternalId);
    if (t) return t;
  }
  return createThread(input.supabase, {
    userId: input.caller.id, channel: input.channel, externalId: input.threadExternalId ?? null, pageContext: (input.pageContext as unknown as Record<string, unknown> | null) ?? null,
  });
}

/** The flows' inputs, loaded on the turn's own clock so startedAt and isStale agree (Ruling 1). */
async function flowDeps(ctx: ToolContext): Promise<FlowDeps> {
  const { today, nowHHMM } = istNow(ctx.now);
  if (!ctx.classroomId) return { today, now: ctx.now, upcoming: [], declined: new Set() };
  const upcoming = (await loadUpcomingClasses(ctx.supabase, ctx.classroomId, { today, nowHHMM, limit: 6 })).filter((c) => c.scheduled_date <= addDays(today, 14));
  const declined = await loadDeclinedClassIds(ctx.supabase, ctx.caller.id, upcoming.map((c) => c.id));
  return { today, now: ctx.now, upcoming, declined };
}

function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function runAssistantTurn(input: TurnInput): Promise<Envelope> {
  const now = input.now ?? new Date();
  const text = input.text.trim().slice(0, MAX_TEXT);
  const page = input.pageContext ?? null;

  if (!text && !input.attachment) {
    return { reply: 'Say what you need, or tap one of these.', suggestions: defaultSuggestions(page), links: [], action: null, mode: 'general', threadId: input.threadId || '' };
  }

  const thread = await resolveThread(input);
  const stored = await appendMessage(input.supabase, { threadId: thread.id, role: 'user', text: text || '(photo)', externalId: input.externalId ?? null });
  if (!stored.inserted && input.externalId) {
    // Redelivery: answer with the reply to this very message. If the first
    // attempt died before replying, there is none, so do the work now.
    const reply = await findReplyToExternalId(input.supabase, thread.id, input.externalId);
    if (reply?.envelope) return reply.envelope;
  }

  const classroom = await getStudentPrimaryClassroom(input.caller.id, input.supabase).catch(() => null);
  const ctx: ToolContext = {
    caller: input.caller, channel: input.channel, mode: 'general', supabase: input.supabase,
    classroomId: classroom?.id ?? null, threadId: thread.id, now, baseUrl: input.baseUrl,
  };

  const route = routeIntent(text, page);
  let outcome: FlowOutcome;
  let links: ToolLink[] = [];
  let mode: Mode = 'general';

  const activeFlow = thread.flow_state as FlowState | null;
  const live = activeFlow && !isStale(activeFlow, now) ? activeFlow : null;

  if (route.kind === 'cancel') {
    outcome = { state: null, reply: 'Okay, cancelled. Nothing was changed.', suggestions: defaultSuggestions(page) };
  } else if (live) {
    outcome = FLOWS[live.flow].step(live, { text, attachment: input.attachment ?? null }, await flowDeps(ctx));
  } else if (route.kind === 'flow') {
    outcome = FLOWS[route.flow].start({ text, attachment: input.attachment ?? null }, await flowDeps(ctx));
  } else if (route.kind === 'tool') {
    const tool = findTool(route.tool);
    const allowed = toolsFor(input.caller, 'general').some((t) => t.name === route.tool);
    if (!tool || !allowed) {
      outcome = { state: null, reply: NOT_YET, suggestions: defaultSuggestions(page) };
    } else {
      const result = await tool.run(ctx, {});
      outcome = {
        state: null,
        reply: result.ok ? result.reply || 'Done.' : result.error || 'That did not work.',
        suggestions: result.suggest ?? defaultSuggestions(page),
      };
      links = result.links ?? [];
    }
  } else {
    mode = route.mode;
    outcome = { state: null, reply: NOT_YET, suggestions: defaultSuggestions(page) };
  }

  let action: Envelope['action'] = null;
  if (outcome.propose) {
    if (input.caller.impersonating) {
      outcome = { ...outcome, reply: READ_ONLY, propose: undefined, state: null };
    } else {
      // Ruling 11: every proposal is checked by the action tool's own run, the
      // same path the model will use in M2. A refusal is the reply; nothing is proposed.
      const tool = findActionTool(outcome.propose.kind);
      const checked = tool ? await tool.run(ctx, outcome.propose.args) : { ok: false, error: 'I no longer know how to do that.' };
      if (!checked.ok) {
        outcome = { state: null, reply: checked.error || 'That did not work.', suggestions: defaultSuggestions(page) };
      } else {
        action = await proposeAction(ctx, checked.data as Proposal);
      }
    }
  }

  await touchThread(input.supabase, thread.id, { flowState: (outcome.state as unknown as Record<string, unknown>) ?? null, lastMessageAt: now.toISOString(), pageContext: (page as unknown as Record<string, unknown> | null) ?? thread.page_context });

  const envelope: Envelope = {
    reply: outcome.reply,
    suggestions: outcome.suggestions,
    links,
    action,
    mode,
    threadId: thread.id,
    ...(outcome.wantsAttachment ? { wantsAttachment: true } : {}),
  };
  await appendMessage(input.supabase, { threadId: thread.id, role: 'assistant', text: envelope.reply, envelope, mode, llm: false });
  return envelope;
}
