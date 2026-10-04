/**
 * Propose, confirm, execute. The assistant never writes directly: a tool or a
 * flow proposes an action with every field visible, the person confirms, and
 * only then does the tool's `execute` run, re-checked here against the owner,
 * the token, the clock, impersonation, the feature flags and the tool's own
 * `run` (the world may have moved since the card was made).
 */
import { randomUUID } from 'crypto';
import { describeError } from '@/lib/api-errors';
import { findActionTool } from './registry';
import { cancelPendingAction, claimPendingAction, createAction, getAction, updateAction } from './store';
import type { ActionProposal, ToolContext, ToolLink } from './types';

export const ACTION_TTL_MS = 10 * 60_000;

export type ConfirmOutcome =
  | { ok: true; reply: string; links: ToolLink[]; threadId: string | null }
  | { ok: false; status: number; error: string };

export async function proposeAction(
  ctx: ToolContext,
  input: { kind: string; args: Record<string, unknown>; summary: string; fields: Array<{ label: string; value: string }> },
): Promise<ActionProposal> {
  if (!findActionTool(input.kind)) throw new Error(`Unknown action: ${input.kind}`);
  const row = await createAction(ctx.supabase, {
    threadId: ctx.threadId,
    userId: ctx.caller.id,
    kind: input.kind,
    args: input.args,
    summary: input.summary,
    fields: input.fields,
    confirmToken: randomUUID(),
    expiresAt: new Date(ctx.now.getTime() + ACTION_TTL_MS).toISOString(),
  });
  return { id: row.id, kind: row.kind, summary: row.summary, fields: row.fields, confirmToken: row.confirm_token, expiresAt: row.expires_at };
}

export async function confirmAction(ctx: ToolContext, input: { id: string; token: string }): Promise<ConfirmOutcome> {
  const row = await getAction(ctx.supabase, input.id);
  if (!row) return { ok: false, status: 404, error: 'That action is gone.' };
  if (row.user_id !== ctx.caller.id) return { ok: false, status: 403, error: 'That is not your action.' };
  if (ctx.caller.impersonating) return { ok: false, status: 403, error: 'Viewing as a student is read only.' };
  if (row.status !== 'pending') return { ok: false, status: 409, error: 'That action was already handled.' };
  if (Date.parse(row.expires_at) < ctx.now.getTime()) {
    await updateAction(ctx.supabase, row.id, { status: 'expired' });
    return { ok: false, status: 410, error: 'That took a while, so I let it go. Ask me again and I will set it up fresh.' };
  }
  if (row.confirm_token !== input.token) return { ok: false, status: 403, error: 'That confirmation did not match.' };

  const tool = findActionTool(row.kind);
  if (!tool) return { ok: false, status: 500, error: 'I no longer know how to do that.' };

  // Conditional claim: only one confirm moves pending to executing, so a double
  // tap cannot run the same action twice.
  if (!(await claimPendingAction(ctx.supabase, row.id))) {
    return { ok: false, status: 409, error: 'That action was already handled.' };
  }
  const execCtx: ToolContext = { ...ctx, threadId: row.thread_id ?? ctx.threadId };
  try {
    // Re-run the tool's own checks before writing: the world may have moved since
    // the card was made. decline_class compares the class's date and start time
    // with the ones on the card and refuses a cancelled class; a reminder or an
    // away window re-checks its dates against today. A refusal marks the action
    // failed and its sentence goes back to the student.
    if (tool.feature && !ctx.features[tool.feature]) {
      await updateAction(ctx.supabase, row.id, { status: 'failed', result: { error: 'feature off' } });
      return { ok: false, status: 400, error: 'That is not available right now.' };
    }
    const check = await tool.run(execCtx, row.args);
    if (!check.ok) {
      const error = check.error || 'That can no longer be done. Ask me again.';
      await updateAction(ctx.supabase, row.id, { status: 'failed', result: { error } });
      return { ok: false, status: 400, error };
    }
    const result = await tool.execute(execCtx, row.args);
    if (!result.ok) {
      await updateAction(ctx.supabase, row.id, { status: 'failed', result: { error: result.error ?? 'failed' } });
      return { ok: false, status: 400, error: result.error || 'That did not work.' };
    }
    await updateAction(ctx.supabase, row.id, {
      status: 'executed',
      result: { ok: true, reply: result.reply ?? null, data: (result.data as Record<string, unknown>) ?? null },
      executed_at: ctx.now.toISOString(),
    });
    return { ok: true, reply: result.reply || 'Done.', links: result.links || [], threadId: row.thread_id };
  } catch (err) {
    const message = describeError(err);
    console.error(`[assistant action] ${row.kind} failed:`, message);
    await updateAction(ctx.supabase, row.id, { status: 'failed', result: { error: message } }).catch(() => undefined);
    // Never "nothing was changed": the write may have landed before the throw.
    return { ok: false, status: 500, error: 'Something went wrong while doing that. Check the page before trying again.' };
  }
}

export async function cancelAction(ctx: ToolContext, input: { id: string }): Promise<ConfirmOutcome> {
  const row = await getAction(ctx.supabase, input.id);
  if (!row) return { ok: false, status: 404, error: 'That action is gone.' };
  if (row.user_id !== ctx.caller.id) return { ok: false, status: 403, error: 'That is not your action.' };
  if (ctx.caller.impersonating) return { ok: false, status: 403, error: 'Viewing as a student is read only.' };
  if (row.status !== 'pending') return { ok: false, status: 409, error: 'That action was already handled.' };
  // Conditional, like the claim: a confirm that got there first wins, and this cancel says so.
  if (!(await cancelPendingAction(ctx.supabase, row.id))) return { ok: false, status: 409, error: 'That action was already handled.' };
  // No Edit on the card in M1 (Ruling 23): asking again is how a student changes it.
  return { ok: true, reply: 'Okay, cancelled. Nothing was changed. Ask me again whenever you want it set up differently.', links: [], threadId: row.thread_id };
}
