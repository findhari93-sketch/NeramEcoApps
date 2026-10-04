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
import { isUuid } from './ids';
import { defaultSuggestions } from './page-suggestions';
import { findActionTool, findTool, isActionTool, toolsFor } from './registry-all';
import { routeIntent, type FlowName } from './router';
import { appendMessage, createThread, findReplyToExternalId, findThreadByExternalId, findThreadForMessage, getThread, touchThread, type ThreadRow } from './store';
import type { AssistantCaller, AssistantFeatures, Attachment, Channel, Envelope, Mode, PageContext, ToolContext, ToolLink } from './types';

export const MAX_TEXT = 2000;

const FLOWS: Record<FlowName, { start: typeof cannotAttend.start; step: typeof cannotAttend.step }> = {
  'cannot-attend': cannotAttend,
  'remind-me': remindMe,
  'upload-sketch': uploadSketch,
};

/** The student feature a flow leads into. A flow whose feature is off is never started or continued (Ruling 25). */
const FLOW_FEATURE: Partial<Record<FlowName, keyof AssistantFeatures>> = {
  'upload-sketch': 'sketchbook',
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
  /** From the gate (assertAssistantAccess): the student features the assistant may open. */
  features: AssistantFeatures;
}

const READ_ONLY = 'Viewing as a student is read only, so I cannot do that from here. Everything else still works.';
const NOT_YET = 'I cannot answer free questions yet. Here is what I can do right now.';
const NOT_AVAILABLE = 'That is not available yet. Here is what I can do right now.';

async function resolveThread(input: TurnInput): Promise<ThreadRow> {
  // A malformed id would reach Postgres as a uuid cast error; treat it as absent (Ruling 26).
  if (input.threadId && isUuid(input.threadId)) {
    const t = await getThread(input.supabase, input.threadId);
    if (t && t.user_id === input.caller.id && t.channel === input.channel) return t;
  }
  if (input.threadExternalId) {
    const t = await findThreadByExternalId(input.supabase, input.caller.id, input.channel, input.threadExternalId);
    if (t) return t;
  }
  // A resend after a lost reply: the phone never learned the thread id, but
  // the message it is resending is already stored. Answer from that thread.
  if (input.externalId) {
    const t = await findThreadForMessage(input.supabase, input.caller.id, input.channel, input.externalId);
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
  const features = input.features;
  const chips = () => defaultSuggestions(page, features);
  const flowOn = (flow: FlowName) => {
    const need = FLOW_FEATURE[flow];
    return !need || features[need];
  };
  const notAvailable = (): FlowOutcome => ({ state: null, reply: NOT_AVAILABLE, suggestions: chips() });

  if (!text && !input.attachment) {
    return { reply: 'Say what you need, or tap one of these.', suggestions: chips(), links: [], action: null, mode: 'general', threadId: input.threadId || '' };
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
    classroomId: classroom?.id ?? null, threadId: thread.id, now, baseUrl: input.baseUrl, features,
  };

  const route = routeIntent(text, page);
  let outcome: FlowOutcome;
  let links: ToolLink[] = [];
  let mode: Mode = 'general';

  const activeFlow = thread.flow_state as FlowState | null;
  const live = activeFlow && !isStale(activeFlow, now) ? activeFlow : null;
  const flowInput = { text, attachment: input.attachment ?? null };

  if (route.kind === 'cancel') {
    outcome = { state: null, reply: 'Okay, cancelled. Nothing was changed.', suggestions: chips() };
  } else if (live) {
    // A flow left open when its feature went off ends here, before it asks or proposes anything.
    outcome = flowOn(live.flow) ? FLOWS[live.flow].step(live, flowInput, await flowDeps(ctx)) : notAvailable();
  } else if (route.kind === 'flow') {
    outcome = flowOn(route.flow) ? FLOWS[route.flow].start(flowInput, await flowDeps(ctx)) : notAvailable();
  } else if (input.attachment && route.kind === 'llm') {
    // A photo with no flow running is a sketch to file: start that flow with
    // it, at the caption step, rather than ignoring the photo.
    outcome = flowOn('upload-sketch') ? uploadSketch.start(flowInput, await flowDeps(ctx)) : notAvailable();
  } else if (route.kind === 'tool') {
    const tool = findTool(route.tool);
    const allowed = toolsFor(input.caller, 'general', features).some((t) => t.name === route.tool);
    if (!tool) {
      outcome = { state: null, reply: NOT_YET, suggestions: chips() };
    } else if (!allowed) {
      outcome = notAvailable();
    } else {
      const result = await tool.run(ctx, {});
      outcome = {
        state: null,
        reply: result.ok ? result.reply || 'Done.' : result.error || 'That did not work.',
        suggestions: result.suggest ?? chips(),
      };
      links = result.links ?? [];
    }
  } else {
    mode = route.mode;
    outcome = { state: null, reply: NOT_YET, suggestions: chips() };
  }

  let action: Envelope['action'] = null;
  if (outcome.propose) {
    if (input.caller.impersonating) {
      outcome = { ...outcome, reply: READ_ONLY, propose: undefined, state: null };
    } else {
      // Ruling 11: every proposal is checked by the action tool's own run, the
      // same path the model will use in M2. A refusal is the reply; nothing is
      // proposed. Only a tool this caller may use right now counts (Ruling 25).
      const kind = outcome.propose.kind;
      const tool = toolsFor(input.caller, 'general', features).find((t) => t.name === kind);
      if (!isActionTool(tool)) {
        outcome = findActionTool(kind) ? notAvailable() : { state: null, reply: 'I no longer know how to do that.', suggestions: chips() };
      } else {
        const checked = await tool.run(ctx, outcome.propose.args);
        if (!checked.ok) {
          outcome = { state: null, reply: checked.error || 'That did not work.', suggestions: chips() };
        } else {
          action = await proposeAction(ctx, checked.data as Proposal);
        }
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
