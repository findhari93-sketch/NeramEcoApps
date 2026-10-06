/**
 * The nightly jobs, each callable from a cron route or an admin's "Run now".
 *
 *   ingest       Google Ads -> ads_entity_daily (last 35 days, idempotent upsert;
 *                Google revises recent days as late conversions arrive), plus
 *                today's state of campaigns, ad groups, keywords and ads on the
 *                last day. An admin can backfill from an earlier date (history).
 *   analyze      rules + AI -> recommendations, then measure past changes,
 *                then autopilot, then the digest email
 *   conversions  approved applications and paid admissions -> Google Ads
 *
 * Each writes a marketing_ai_runs row with its stats, and a failure is stored
 * on that row rather than swallowed.
 */

import { analystForEnv, type AnalystModel } from './ai/analyst';
import { PROMPT_VERSION } from './ai/prompts';
import { getAdsClient, type AdsClient } from './ads/client';
import { uploadConversions } from './ads/conversions';
import { INGEST_LEVELS, SNAPSHOT_LEVELS, buildQuery, geoNamesQuery, snapshotQuery, type SnapshotLevel } from './ads/gaql';
import { mergeDuplicates, normalizeRow } from './ads/normalize';
import { measureExecuted, runAutopilot } from './autopilot';
import { readAdsEnv, missingLiveEnv, type AdsEnv } from './config';
import { sendDigest } from './digest';
import { aggregate, comparePeriods, lastCompleteDayIST, shiftDate, windowEnding } from './metrics';
import { countSignups } from './funnel';
import { writeAudit } from './audit';
import { expireStale, persistFindings } from './recommendations';
import { lastSeason, notServingCampaigns, runRules, searchTermCandidates, type IntentLabel, type RuleContext } from './rules';
import { db as defaultDb, finishRun, loadEntityDays, loadSettings, startRun, upsertEntityDays } from './store';
import type { AgentSettings, EntityDay, Finding } from './types';

export interface AgentContext {
  db: any;
  env: AdsEnv;
  ads: AdsClient;
  settings: AgentSettings;
}

export class NotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(`Google Ads is not connected. Missing: ${missing.join(', ')}`);
    this.name = 'NotConfiguredError';
  }
}

export async function agentContext(client: any = defaultDb()): Promise<AgentContext> {
  const env = readAdsEnv();
  if (env.mode === 'live') {
    const missing = missingLiveEnv(env);
    if (missing.length) throw new NotConfiguredError(missing);
  }
  return { db: client, env, ads: getAdsClient(env), settings: await loadSettings(client) };
}

type Trigger = { trigger: 'cron' | 'manual'; by: string | null };

const INGEST_DAYS = 35;

/** The furthest back a backfill may go: Google keeps search terms and most reports for about 13 months. */
export const MAX_HISTORY_DAYS = 400;

/** Validates a backfill start date; returns an error message or null. */
export function historyFromError(from: unknown, endDate: string): string | null {
  if (typeof from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(from)) return 'from must be a date, YYYY-MM-DD';
  if (from > endDate) return 'from must be before the last complete day';
  if (from < shiftDate(endDate, -(MAX_HISTORY_DAYS - 1))) return `from may be at most ${MAX_HISTORY_DAYS} days back`;
  return null;
}

export async function runIngest(ctx: AgentContext, t: Trigger, endDate = lastCompleteDayIST(), opts: { from?: string } = {}) {
  const runId = await startRun(ctx.db, 'ingest', t.trigger, t.by, ctx.ads.mode);
  const from = opts.from ?? shiftDate(endDate, -(INGEST_DAYS - 1));
  const stats: Record<string, number | string> = { from, to: endDate };
  try {
    const bad = historyFromError(from, endDate);
    if (bad) throw new Error(bad);
    for (const level of INGEST_LEVELS) {
      const raw = await ctx.ads.search(buildQuery(level, from, endDate));
      // Today's state rides on the last day, so a campaign that stopped serving still has a row.
      if ((SNAPSHOT_LEVELS as readonly string[]).includes(level)) {
        const state = await ctx.ads.search(snapshotQuery(level as SnapshotLevel));
        raw.push(...state.map((r: any) => ({ ...r, segments: { ...(r?.segments ?? {}), date: endDate } })));
      }
      const rows = mergeDuplicates(raw.map((r) => normalizeRow(level, ctx.ads.customerId, r)).filter((r): r is EntityDay => r !== null));
      if (level === 'geo') await nameCities(ctx.ads, rows);
      stats[level] = await upsertEntityDays(ctx.db, rows);
    }
    await finishRun(ctx.db, runId, 'succeeded', { stats });
    return { runId, stats };
  } catch (err: any) {
    await finishRun(ctx.db, runId, 'failed', { stats, error: err?.message ?? 'ingest failed' });
    throw err;
  }
}

export async function runAnalyze(ctx: AgentContext, t: Trigger, opts: { endDate?: string; analyst?: AnalystModel; skipAutopilot?: boolean } = {}) {
  const endDate = opts.endDate ?? lastCompleteDayIST();
  const analyst = opts.analyst ?? analystForEnv(ctx.ads.mode, process.env, { profile: ctx.settings.profile, date: endDate });
  const runId = await startRun(ctx.db, 'analyze', t.trigger, t.by, ctx.ads.mode);
  const stats: Record<string, unknown> = { end_date: endDate };
  try {
    const rows = await loadAnalysisRows(ctx, endDate);
    stats.rows = rows.length;
    if (!rows.length) throw new Error('No Google Ads data for this period yet. Run an ingest first.');

    const ruleCtx: RuleContext = { rows, endDate, settings: ctx.settings, intents: new Map<string, IntentLabel>() };
    ruleCtx.intents = await analyst.classifySearchTerms(searchTermCandidates(ruleCtx));
    const findings = await addAdCopy(runRules(ruleCtx), ruleCtx, analyst);
    const assessments = await analyst.explainFindings(findings);
    for (const f of findings) f.aiAssessment = assessments.get(f.dedupeKey) ?? f.aiAssessment ?? null;

    const persisted = await persistFindings(ctx.db, findings, runId);
    const expired = await expireStale(ctx.db);
    const usage = analyst.usage();

    Object.assign(stats, {
      findings: findings.length,
      by_priority: countBy(findings, (f) => f.priority),
      by_category: countBy(findings, (f) => f.category),
      ...persisted,
      expired,
      ai: { provider: usage.provider, calls: usage.calls, blocked: usage.blocked, errors: usage.errors },
      // The latest labels, for the Search terms tab. At most 80, so small enough to keep on the run.
      intents: Object.fromEntries([...ruleCtx.intents].map(([k, v]) => [k, { intent: v.intent, confidence: v.confidence, reason: v.reason }])),
    });

    const measured = await measureExecuted(ctx.db, ctx.settings, ctx.ads.customerId, (from, to) => loadEntityDays(ctx.db, ctx.ads.customerId, from, to, ['campaign']));
    stats.measured = measured;
    if (measured.demoted.length) ctx.settings = await loadSettings(ctx.db);

    if (!opts.skipAutopilot) stats.autopilot = await runAutopilot(ctx);

    await finishRun(ctx.db, runId, 'succeeded', {
      stats,
      provider: usage.provider,
      model: usage.model,
      prompt_version: PROMPT_VERSION,
      tokens_in: usage.tokensIn,
      tokens_out: usage.tokensOut,
      cost_usd: usage.costUsd,
    });

    if (t.trigger === 'cron') stats.digest = await sendDigest(ctx.db, runId, stats);
    return { runId, stats };
  } catch (err: any) {
    await finishRun(ctx.db, runId, 'failed', { stats, error: err?.message ?? 'analyze failed', prompt_version: PROMPT_VERSION });
    throw err;
  }
}

/**
 * The last 35 days at every level, plus older history: campaign rows for a
 * year (last season's benchmark), and keyword and search-term rows back to
 * targets.proxy_history_since while the OTP conversion has under 21 days.
 */
async function loadAnalysisRows(ctx: AgentContext, endDate: string): Promise<EntityDay[]> {
  const recentFrom = shiftDate(endDate, -(INGEST_DAYS - 1));
  const before = shiftDate(recentFrom, -1);
  const yearFrom = shiftDate(endDate, -(MAX_HISTORY_DAYS - 1));
  const recent = await loadEntityDays(ctx.db, ctx.ads.customerId, recentFrom, endDate);
  const older = await loadEntityDays(ctx.db, ctx.ads.customerId, yearFrom, before, ['campaign']);
  const { conversions_since: since, proxy_history_since: proxySince } = ctx.settings.targets;
  const otpTrusted = !!since && since <= shiftDate(endDate, -20);
  if (otpTrusted || !proxySince || proxySince >= recentFrom) return [...older, ...recent];
  const proxy = await loadEntityDays(ctx.db, ctx.ads.customerId, proxySince > yearFrom ? proxySince : yearFrom, before, ['keyword', 'search_term']);
  return [...older, ...proxy, ...recent];
}

/** Geo rows only carry a resource name; look the city names up once per ingest. */
async function nameCities(ads: AdsClient, rows: EntityDay[]) {
  const resources = [...new Set(rows.map((r) => r.text).filter((t): t is string => !!t))];
  const q = geoNamesQuery(resources);
  if (!q) return;
  try {
    const names = new Map((await ads.search(q)).map((r: any) => [r?.geoTargetConstant?.resourceName, r?.geoTargetConstant?.name]));
    for (const r of rows) {
      const name = names.get(r.text);
      if (name) {
        r.text = name;
        r.attributes = { ...(r.attributes ?? {}), city: name };
      }
    }
  } catch (err: any) {
    // Names are cosmetic; the rule still works on the resource name.
    console.warn('[marketing-ai] city name lookup failed:', err?.message);
  }
}

/**
 * Ask the AI to write the new ads (at most three a run). A new-ad finding the
 * AI could not write for is dropped: there is nothing to approve without copy.
 */
async function addAdCopy(findings: Finding[], ctx: RuleContext, analyst: AnalystModel): Promise<Finding[]> {
  const w = windowEnding(ctx.endDate, 30);
  const keywords = aggregate(ctx.rows, 'keyword', w);
  const terms = aggregate(ctx.rows, 'search_term', w);
  // Only ads without copy yet: R20's year swap arrives already written.
  for (const f of findings.filter((x) => x.proposedChange.kind === 'new_ad' && x.proposedChange.headlines.length === 0).slice(0, 3)) {
    if (f.proposedChange.kind !== 'new_ad') continue;
    const agId = f.proposedChange.ad_group_id;
    const copy = await analyst.draftAdCopy({
      adGroupName: f.evidence.rows[0]?.label ?? agId,
      keywords: keywords.filter((k) => k.ad_group_id === agId).map((k) => k.text ?? '').filter(Boolean),
      searchTerms: terms.filter((s) => s.ad_group_id === agId).sort((a, b) => b.clicks - a.clicks).slice(0, 15).map((s) => s.text ?? ''),
    });
    if (copy) f.proposedChange = { ...f.proposedChange, ...copy };
  }
  return findings.filter((f) => f.proposedChange.kind !== 'new_ad' || f.proposedChange.headlines.length >= 3);
}

export async function runConversions(ctx: AgentContext, t: Trigger) {
  const runId = await startRun(ctx.db, 'conversions', t.trigger, t.by, ctx.ads.mode);
  try {
    const stats = await uploadConversions(ctx.db, ctx.ads, ctx.env, runId);
    await finishRun(ctx.db, runId, 'succeeded', { stats });
    return { runId, stats };
  } catch (err: any) {
    await finishRun(ctx.db, runId, 'failed', { error: err?.message ?? 'conversion upload failed' });
    throw err;
  }
}

/**
 * The weekly report: the last 7 days against the 7 before, what the agent
 * changed, what is waiting, and Neram's own sign-up count, summarised by the
 * AI with three next steps. Stored in marketing_ai_reports and shown on the
 * Overview. Any number the AI quotes must be one of the facts given to it.
 */
export async function runWeekly(ctx: AgentContext, t: Trigger, opts: { endDate?: string; analyst?: AnalystModel } = {}) {
  const endDate = opts.endDate ?? lastCompleteDayIST();
  const analyst = opts.analyst ?? analystForEnv(ctx.ads.mode, process.env, { profile: ctx.settings.profile, date: endDate });
  const runId = await startRun(ctx.db, 'weekly', t.trigger, t.by, ctx.ads.mode);
  try {
    const weekStart = shiftDate(endDate, -6);
    const rows = await loadEntityDays(ctx.db, ctx.ads.customerId, shiftDate(endDate, -(MAX_HISTORY_DAYS - 1)), endDate, ['campaign']);
    const season = lastSeason(rows, ctx.settings, endDate);
    const stopped = notServingCampaigns({ rows, endDate, settings: ctx.settings, intents: new Map() });
    const cmp = comparePeriods(rows, endDate, 7);
    const toIso = new Date(`${shiftDate(endDate, 1)}T00:00:00+05:30`).toISOString();
    const fromIso = new Date(`${weekStart}T00:00:00+05:30`).toISOString();
    const signups = await countSignups(ctx.db, fromIso, toIso);

    const { data: actions } = await ctx.db
      .from('marketing_ai_actions')
      .select('operation, status, actor, recommendation_id, created_at')
      .eq('status', 'succeeded')
      .gte('created_at', fromIso)
      .limit(100);
    const recIds = [...new Set((actions ?? []).map((a: any) => a.recommendation_id).filter(Boolean))];
    const { data: recs } = recIds.length ? await ctx.db.from('marketing_ai_recommendations').select('id, title, decided_by').in('id', recIds) : { data: [] };
    const { count: pending } = await ctx.db.from('marketing_ai_recommendations').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval');

    const facts: Record<string, number | null> = {
      spend_inr: Math.round(cmp.current.cost),
      spend_prev_inr: Math.round(cmp.previous.cost),
      clicks: cmp.current.clicks,
      clicks_prev: cmp.previous.clicks,
      google_conversions: cmp.current.conversions,
      google_conversions_prev: cmp.previous.conversions,
      cost_per_conversion_inr: cmp.current.cpa === null ? null : Math.round(cmp.current.cpa),
      cost_per_conversion_prev_inr: cmp.previous.cpa === null ? null : Math.round(cmp.previous.cpa),
      otp_signups_all_sources: signups.verified,
      otp_signups_from_google_ads: signups.from_google_ads,
      cost_per_google_signup_inr: signups.from_google_ads ? Math.round(cmp.current.cost / signups.from_google_ads) : null,
      changes_made: (actions ?? []).length,
      recommendations_waiting: pending ?? 0,
      ads_serving: stopped.size ? 0 : 1,
      last_season_spend_inr: season?.spend ?? null,
      last_season_cost_per_conversion_inr: season?.cpa ?? null,
    };
    const changes = (recs ?? []).map((r: any) => `${r.title}${r.decided_by === 'autopilot' ? ' (automatic)' : ''}`);
    const report = await analyst.weeklyReport({ weekStart, endDate, facts, changes });
    const usage = analyst.usage();
    const summary = report?.summary ?? 'The AI summary was not available this week. The numbers below are complete.';

    const { error } = await ctx.db
      .from('marketing_ai_reports')
      .upsert({ week_start: weekStart, summary, next_steps: report?.next_steps ?? [], facts: { ...facts, changes }, run_id: runId }, { onConflict: 'week_start' });
    if (error) throw new Error(`marketing_ai_reports: ${error.message}`);
    await writeAudit(ctx.db, { actor: { type: 'cron' }, event: 'report.weekly', entityType: 'report', entityId: weekStart, runId, result: report ? 'ai' : 'numbers only' });

    const stats = { week_start: weekStart, facts, ai: { provider: usage.provider, blocked: usage.blocked, errors: usage.errors } };
    await finishRun(ctx.db, runId, 'succeeded', { stats, provider: usage.provider, model: usage.model, prompt_version: PROMPT_VERSION, tokens_in: usage.tokensIn, tokens_out: usage.tokensOut, cost_usd: usage.costUsd });
    return { runId, stats };
  } catch (err: any) {
    await finishRun(ctx.db, runId, 'failed', { error: err?.message ?? 'weekly report failed' });
    throw err;
  }
}

function countBy<T>(items: T[], key: (t: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[key(i)] = (out[key(i)] ?? 0) + 1;
  return out;
}
