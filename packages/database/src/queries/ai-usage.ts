/**
 * Reads and writes for ai_usage_events and ai_usage_daily.
 *
 * These sit in @neram/database rather than @neram/ai so that all four apps and
 * the usage panel share one set of queries, and so @neram/ai keeps a single
 * dependency instead of its own Supabase client.
 *
 * The one rule that matters here: recordAiUsage NEVER throws. It is called on
 * the success path of every Gemini call, and a logging failure that broke a
 * teacher's chapter test would be a far worse bug than a missing usage row.
 * The chatbot_conversations insert in apps/marketing/src/app/api/chat/route.ts
 * has swallowed its errors the same way since it was written.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';

export type AiUsageStatus = 'ok' | 'error' | 'rate_limited' | 'blocked_budget' | 'manual';

export interface AiUsageInput {
  featureId: string;
  app: string;
  model?: string | null;
  keyTier?: 'paid' | 'free';
  promptTokens?: number;
  outputTokens?: number;
  /** NULL when the model had no known price. Never pass 0 to mean "unknown". */
  estimatedCostUsd?: number | null;
  latencyMs?: number | null;
  status: AiUsageStatus;
  error?: string | null;
  actorId?: string | null;
  /** Salted hash of one anonymous visitor, for the public chatbots' rate limit. */
  clientKey?: string | null;
}

export interface AiUsageDailyRow {
  day: string;
  app: string;
  feature_id: string;
  model: string;
  calls: number;
  blocked_calls: number;
  prompt_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface AiUsageEventRow {
  id: string;
  feature_id: string;
  app: string;
  model: string | null;
  key_tier: string;
  prompt_tokens: number;
  output_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number | null;
  latency_ms: number | null;
  status: AiUsageStatus;
  error: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface AiSpendTotals {
  calls: number;
  blockedCalls: number;
  promptTokens: number;
  outputTokens: number;
  costUsd: number;
}

const EMPTY_TOTALS: AiSpendTotals = {
  calls: 0,
  blockedCalls: 0,
  promptTokens: 0,
  outputTokens: 0,
  costUsd: 0,
};

/** UTC day key, matching the DATE column the rollup is bucketed by. */
export function utcDay(at: Date = new Date()): string {
  return at.toISOString().slice(0, 10);
}

/** First day of the current UTC month, as a DATE string. */
export function utcMonthStart(at: Date = new Date()): string {
  return `${at.toISOString().slice(0, 7)}-01`;
}

/**
 * Write one call to both tables. Returns nothing and throws nothing.
 *
 * The rollup goes through the record_ai_usage_daily function rather than a
 * client-side upsert because several serverless invocations finish at the same
 * moment and a read-modify-write would lose counts to whichever wrote last.
 */
export async function recordAiUsage(
  input: AiUsageInput,
  client?: TypedSupabaseClient
): Promise<void> {
  try {
    const supabase = client || getSupabaseAdminClient();
    const promptTokens = input.promptTokens ?? 0;
    const outputTokens = input.outputTokens ?? 0;
    const blocked = input.status === 'blocked_budget' || input.status === 'manual' ? 1 : 0;

    await supabase.from('ai_usage_events').insert({
      feature_id: input.featureId,
      app: input.app,
      model: input.model ?? null,
      key_tier: input.keyTier ?? 'paid',
      prompt_tokens: promptTokens,
      output_tokens: outputTokens,
      total_tokens: promptTokens + outputTokens,
      estimated_cost_usd: input.estimatedCostUsd ?? null,
      latency_ms: input.latencyMs ?? null,
      status: input.status,
      error: input.error ?? null,
      actor_id: input.actorId ?? null,
      client_key: input.clientKey ?? null,
    } as never);

    await supabase.rpc('record_ai_usage_daily', {
      p_day: utcDay(),
      p_app: input.app,
      p_feature_id: input.featureId,
      p_model: input.model ?? '',
      // A blocked or manual call is not a call to Google, so it must not count
      // towards `calls`, or the panel's average cost per call goes wrong.
      p_calls: blocked ? 0 : 1,
      p_blocked: blocked,
      p_prompt_tokens: promptTokens,
      p_output_tokens: outputTokens,
      p_cost_usd: input.estimatedCostUsd ?? 0,
    } as never);
  } catch (err) {
    console.error('[ai-usage] failed to record usage (call itself was unaffected):', err);
  }
}

/**
 * Totals from the rollup between two DATE strings, inclusive.
 *
 * This is what the budget guard reads before every AI call, so it stays a
 * single indexed range scan over a table with at most a few rows per feature
 * per day.
 */
export async function getAiSpend(
  fromDay: string,
  toDay: string,
  client?: TypedSupabaseClient
): Promise<AiSpendTotals> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('ai_usage_daily')
    .select('calls, blocked_calls, prompt_tokens, output_tokens, cost_usd')
    .gte('day', fromDay)
    .lte('day', toDay);

  if (error) throw error;
  return sumRows((data ?? []) as Partial<AiUsageDailyRow>[]);
}

/** Today's totals for one feature, for the per-feature dailyCallCap check. */
export async function getAiSpendForFeature(
  featureId: string,
  fromDay: string,
  toDay: string,
  client?: TypedSupabaseClient
): Promise<AiSpendTotals> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('ai_usage_daily')
    .select('calls, blocked_calls, prompt_tokens, output_tokens, cost_usd')
    .eq('feature_id', featureId)
    .gte('day', fromDay)
    .lte('day', toDay);

  if (error) throw error;
  return sumRows((data ?? []) as Partial<AiUsageDailyRow>[]);
}

/** Every rollup row in a range, for the panel's by-feature and by-model tables. */
export async function getAiUsageBreakdown(
  fromDay: string,
  toDay: string,
  client?: TypedSupabaseClient
): Promise<AiUsageDailyRow[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('ai_usage_daily')
    .select('*')
    .gte('day', fromDay)
    .lte('day', toDay)
    .order('cost_usd', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as AiUsageDailyRow[];
}

/**
 * How many calls one anonymous visitor has made since a moment.
 *
 * The public chatbots are unauthenticated and mounted on every page, so without
 * this a single script can spend the whole month's budget in an afternoon. An
 * in-process counter cannot do this job: each Vercel invocation gets its own
 * memory, so the count has to live where every invocation can see it.
 *
 * Counts rows rather than summing cost, because the point is to stop abuse
 * early, before enough spend has accumulated for a cost-based cap to notice.
 */
export async function countAiCallsForClient(
  clientKey: string,
  sinceIso: string,
  client?: TypedSupabaseClient
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();
  const { count, error } = await supabase
    .from('ai_usage_events')
    .select('id', { count: 'exact', head: true })
    .eq('client_key', clientKey)
    .gte('created_at', sinceIso);

  if (error) throw error;
  return count ?? 0;
}

/** Most recent individual calls, for the panel's drill-down table. */
export async function getRecentAiEvents(
  limit = 50,
  client?: TypedSupabaseClient
): Promise<AiUsageEventRow[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('ai_usage_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as AiUsageEventRow[];
}

function sumRows(rows: Partial<AiUsageDailyRow>[]): AiSpendTotals {
  return rows.reduce<AiSpendTotals>(
    (acc, row) => ({
      calls: acc.calls + num(row.calls),
      blockedCalls: acc.blockedCalls + num(row.blocked_calls),
      promptTokens: acc.promptTokens + num(row.prompt_tokens),
      outputTokens: acc.outputTokens + num(row.output_tokens),
      costUsd: acc.costUsd + num(row.cost_usd),
    }),
    { ...EMPTY_TOTALS }
  );
}

/**
 * numeric(12,6) arrives from PostgREST as a string, not a number. Coercing here
 * rather than at each call site is the difference between adding costs and
 * concatenating them.
 */
function num(value: unknown): number {
  const n = typeof value === 'string' ? parseFloat(value) : (value as number);
  return Number.isFinite(n) ? n : 0;
}
