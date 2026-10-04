/**
 * Stage 4 of a turn: a free question goes to Gemini with the read tools this
 * caller may use in this mode. Writes never: every action stays behind a guided
 * flow and its confirm card (D1). Exam mode (the free key) gets exam tools only
 * (policy.ts), and no name, classroom or general turn (prompt.ts, history.ts).
 * Every failure is a sentence the student can act on, never an error (D4).
 */
import { AiBlockedError, hashClientKey, type GeminiContent } from '@neram/ai';
import { describeError } from '@/lib/api-errors';
import { loadAiAccess, readDailyLimit } from './ai-access';
import { historyFor, istDayStartIso } from './history';
import { runModelLoop, type LoopToolCall } from './loop';
import { bindStudentSelf } from './policy';
import { SYSTEM_EXAM, SYSTEM_GENERAL, cleanReply, contextBlock } from './prompt';
import { toolsFor } from './registry-all';
import { countLlmRepliesToday, listMessages } from './store';
import type { Mode, PageContext, ToolContext, ToolLink, ToolResult } from './types';

export const PAUSED_REPLY = 'AI answers are paused right now. The buttons below still work.';

/** What a student reads at the allowance. An allowance of 0 is an admin pause, said as such. */
export function limitReply(limit: number): string {
  if (limit <= 0) return PAUSED_REPLY;
  return `You have used today's ${limit} AI questions. They reset at midnight. The buttons below still work.`;
}
export const IMPERSONATING_REPLY = "Viewing as a student, I do not answer free questions, so this student's AI questions are not used. Everything else here still works.";
export const BUSY_REPLY = 'I could not answer that just now. Try again in a minute, or use one of these.';

/** The model loop starts no new call after this long (a round of tools must not run the request out). */
const LOOP_BUDGET_MS = 25_000;

export interface LlmMeta { model: string; promptTokens: number; outputTokens: number; costUsd: number | null; toolCalls: LoopToolCall[] }

export interface LlmInput {
  ctx: ToolContext;
  mode: Mode;
  text: string;
  page: PageContext | null;
  /** The user message this turn already stored; it is sent last, not as history. */
  currentMessageId: string | null;
  classroomName: string | null;
}

const firstNameOf = (name: string | null) => String(name || '').trim().split(/\s+/)[0] || null;

export async function runLlmStage(input: LlmInput): Promise<{ reply: string; links: ToolLink[]; meta: LlmMeta | null; mode: Mode }> {
  const { ctx } = input;
  // Exam help needs the question bank; with it off the turn is a plain general one (no exam feature, prompt or tools).
  const mode: Mode = input.mode === 'exam' && !ctx.features.questionBank ? 'general' : input.mode;
  // Impersonation may read, never act. Spending the student's paid allowance is acting.
  if (ctx.caller.impersonating) return { reply: IMPERSONATING_REPLY, links: [], meta: null, mode };
  // Who may spend money (addendum spec): a student who is not caught up, or
  // whose teacher switched AI answers off, gets the reason and a way back,
  // never a model call.
  let access: Awaited<ReturnType<typeof loadAiAccess>>;
  let limit: number;
  let used: number;
  let rows: Awaited<ReturnType<typeof listMessages>>;
  try {
    access = await loadAiAccess(ctx.supabase, ctx.caller.id, ctx.now);
    if (!access.on) return { reply: access.sentence, links: access.link ? [access.link] : [], meta: null, mode };
    limit = await readDailyLimit(ctx.supabase);
    used = limit > 0 ? await countLlmRepliesToday(ctx.supabase, ctx.caller.id, istDayStartIso(ctx.now), limit) : 0;
    if (limit <= 0 || used >= limit) return { reply: limitReply(limit), links: [], meta: null, mode };
    rows = ctx.threadId ? await listMessages(ctx.supabase, ctx.threadId, 30) : [];
  } catch (err) {
    // D4: a failed read is a sentence, never a 500.
    console.error('[assistant llm]', describeError(err));
    return { reply: BUSY_REPLY, links: [], meta: null, mode };
  }
  const contents: GeminiContent[] = [
    ...historyFor(mode, rows.filter((r) => r.id !== input.currentMessageId)),
    { role: 'user', parts: [{ text: input.text }] },
  ];
  const tools = toolsFor(ctx.caller, mode, ctx.features).filter((t) => t.kind === 'read');
  const toolCtx: ToolContext = { ...ctx, mode };
  const system = (mode === 'exam' ? SYSTEM_EXAM : SYSTEM_GENERAL)
    + contextBlock(mode, { now: ctx.now, firstName: firstNameOf(ctx.caller.name), classroomName: input.classroomName, page: input.page });

  const runTool = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
    const def = tools.find((t) => t.name === name);
    if (!def) return { ok: false, error: 'No such tool.' };
    try {
      return await def.run(toolCtx, bindStudentSelf(ctx.caller, args));
    } catch (err) {
      console.error(`[assistant tool ${name}]`, describeError(err));
      return { ok: false, error: 'That lookup failed.' };
    }
  };

  try {
    const out = await runModelLoop({
      feature: mode === 'exam' ? 'nexus.assistant-exam' : 'nexus.assistant-student',
      system, contents, tools,
      maxIterations: ctx.channel === 'teams' ? 3 : 4,
      maxOutputTokens: mode === 'exam' ? 700 : 400,
      actorId: ctx.caller.id,
      clientKey: hashClientKey('assistant', ctx.caller.id),
      runTool,
      deadlineMs: Date.now() + LOOP_BUDGET_MS,
    });
    const reply = cleanReply(out.text, out.finishReason);
    if (!reply) return { reply: BUSY_REPLY, links: [], meta: null, mode };
    return {
      reply,
      links: out.links.slice(0, 3),
      mode,
      meta: { model: out.model, promptTokens: out.usage.promptTokens, outputTokens: out.usage.outputTokens, costUsd: out.costUsd, toolCalls: out.toolCalls },
    };
  } catch (err) {
    if (err instanceof AiBlockedError) return { reply: err.reason === 'client_cap' ? err.message : PAUSED_REPLY, links: [], meta: null, mode };
    console.error('[assistant llm]', describeError(err));
    return { reply: BUSY_REPLY, links: [], meta: null, mode };
  }
}
