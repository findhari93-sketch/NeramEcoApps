/**
 * The deterministic half of the agent: thresholds over observed data.
 *
 * A rule decides THAT something deserves attention, from numbers alone. The AI
 * only adds the why (search intent, an explanation, ad copy). Two consequences:
 *
 *  - Every rule works with the AI switched off or over budget. R1 then raises
 *    an approval-only negative with no confidence, which autopilot ignores.
 *  - A rule never fires on thin data. Neram's account spends about ₹180 a
 *    day off-season, so a keyword with eight clicks has not proven anything yet.
 *  - A campaign that is not showing ads (R0) is not judged at all: a run of
 *    zero days says nothing about its keywords.
 *
 * Each rule is a pure function of RuleContext, unit tested in rules.test.ts.
 */

import { aggregate, derive, evidenceRow, inr, median, shiftDate, toTotals, windowEnding, type Aggregate, type Window } from './metrics';
import { DAYS_PER_BILLING_MONTH, effectiveTargets, examCycleYear, MIN_DAILY_BUDGET_INR, MIN_KEYWORD_BID_INR, pastCycleYears } from './config';
import type { AgentSettings, EntityDay, Finding, Priority } from './types';

export type Intent =
  | 'high_intent'
  | 'research'
  | 'free_seeker'
  | 'job_seeker'
  | 'other_exam'
  | 'other_course'
  | 'competitor'
  | 'unclear';

/**
 * Intents that are never a NATA / JEE Paper 2 sign-up. free_seeker is not one:
 * the free app is how most OTP sign-ups happen, so a search for free NATA
 * material is judged by its numbers (R1), never blocked for its intent.
 */
export const NEGATIVE_INTENTS: readonly Intent[] = ['job_seeker', 'other_exam', 'other_course'];

export interface IntentLabel {
  intent: Intent;
  confidence: number;
  reason: string;
  /** A shorter phrase to block instead of the whole term, e.g. "jobs". Checked before use. */
  suggested_negative?: string | null;
}

export interface RuleContext {
  rows: EntityDay[];
  /** Last complete day of data, YYYY-MM-DD. */
  endDate: string;
  settings: AgentSettings;
  /** AI labels keyed by search-term entity_key. Empty when the AI did not run. */
  intents: Map<string, IntentLabel>;
}

const EXCLUDED_TERM_STATUSES = new Set(['EXCLUDED', 'ADDED_EXCLUDED', 'ADDED']);

const window30 = (ctx: RuleContext) => windowEnding(ctx.endDate, 30);

/** Season or off-season targets, for the day the data ends. */
const targets = (ctx: RuleContext) => effectiveTargets(ctx.settings, ctx.endDate);

const dayNumber = (d: string) => Math.round(new Date(`${d}T00:00:00Z`).getTime() / 86_400_000);

/** Fewest days of trusted conversion data before a rule may judge by conversions. */
export const MIN_JUDGE_DAYS = 21;

/**
 * The window in which conversions can be trusted: the last `days` days, but
 * never before targets.conversions_since (the day "Phone verified" became the
 * primary conversion). Null until there are 21 days of it, so no rule pauses a
 * keyword or adds one on the old definition or on a week of new data.
 */
export function judgeWindow(ctx: RuleContext, days = 30, opts: { proxy?: boolean } = {}): JudgeWindow | null {
  const since = ctx.settings.targets.conversions_since;
  if (since) {
    const w = windowEnding(ctx.endDate, days);
    const from = since > w.from ? since : w.from;
    const span = dayNumber(ctx.endDate) - dayNumber(from) + 1;
    if (span >= MIN_JUDGE_DAYS) return { from, to: ctx.endDate, days: span, proxy: false };
  }
  return opts.proxy ? proxyWindow(ctx) : null;
}

export type JudgeWindow = Window & { proxy: boolean };

/** Furthest back the proxy history reaches: about 13 months. */
const PROXY_MAX_DAYS = 400;

/**
 * Last season's history, for suggestions that wait for a person (user
 * decision, 2026-10-06): from targets.proxy_history_since up to the day before
 * the OTP conversion went live. Its conversions are the old "Sign-up" goal,
 * which mostly fired on app account creation, so they are close to, but not
 * the same as, an OTP sign-up. Evidence from it is flagged proxy, and
 * autopilot never acts on a proxy finding.
 */
function proxyWindow(ctx: RuleContext): JudgeWindow | null {
  const start = ctx.settings.targets.proxy_history_since;
  if (!start) return null;
  const since = ctx.settings.targets.conversions_since;
  const to = since && since <= ctx.endDate ? shiftDate(since, -1) : ctx.endDate;
  const earliest = shiftDate(ctx.endDate, -(PROXY_MAX_DAYS - 1));
  const from = start > earliest ? start : earliest;
  if (from > to) return null;
  const span = dayNumber(to) - dayNumber(from) + 1;
  return span >= MIN_JUDGE_DAYS ? { from, to, days: span, proxy: true } : null;
}

const stateCache = new WeakMap<EntityDay[], Map<string, Map<string, EntityDay>>>();

/** The latest row of each entity at a level: its current status, budget, bids and extras. */
export function currentState(ctx: RuleContext, level: EntityDay['level']): Map<string, EntityDay> {
  // Many rules ask for this per entity, so it is worked out once per row set.
  const perRows = stateCache.get(ctx.rows) ?? new Map<string, Map<string, EntityDay>>();
  stateCache.set(ctx.rows, perRows);
  const cacheKey = `${level}|${ctx.endDate}`;
  const cached = perRows.get(cacheKey);
  if (cached) return cached;
  const out = new Map<string, EntityDay>();
  perRows.set(cacheKey, out);
  for (const r of ctx.rows) {
    if (r.level !== level || r.date > ctx.endDate) continue;
    const prev = out.get(r.entity_key);
    if (!prev || r.date >= prev.date) out.set(r.entity_key, r);
  }
  return out;
}

/** Days of zero impressions before an enabled campaign counts as not serving. */
export const NOT_SERVING_DAYS = 3;

/**
 * Enabled campaigns with no impressions in the last 3 days, by id, with their
 * latest state. Needs a state row (the ingest snapshot) within those days, so
 * stale data never raises it.
 */
export function notServingCampaigns(ctx: RuleContext): Map<string, EntityDay> {
  const w = windowEnding(ctx.endDate, NOT_SERVING_DAYS);
  const impressions = new Map<string, number>();
  for (const r of ctx.rows) if (r.level === 'campaign' && r.date >= w.from && r.date <= w.to) impressions.set(r.campaign_id!, (impressions.get(r.campaign_id!) ?? 0) + r.impressions);
  const out = new Map<string, EntityDay>();
  for (const c of currentState(ctx, 'campaign').values()) {
    if (c.status !== 'ENABLED' || c.date < w.from || !c.campaign_id) continue;
    if ((impressions.get(c.campaign_id) ?? 0) === 0) out.set(c.campaign_id, c);
  }
  return out;
}

const attr = (r: { attributes?: Record<string, unknown> | null } | undefined, k: string): any => (r?.attributes as any)?.[k] ?? null;

/** True when the campaign bids by hand (Manual CPC), so keyword bids and bid adjustments matter. */
export function isManualCpc(ctx: RuleContext, campaignId: string | null): boolean {
  if (!campaignId) return false;
  const c = currentState(ctx, 'campaign').get(campaignId);
  return attr(c, 'bidding_strategy_type') === 'MANUAL_CPC';
}

const norm = (s: string | null | undefined) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** A protected keyword (Agent Settings > Account profile) is never paused, cut or blocked. */
export function isProtected(ctx: RuleContext, text: string | null | undefined): boolean {
  return ctx.settings.profile.protected_keywords.includes(norm(text));
}

/** The competitor a text names, if any. */
export function competitorIn(ctx: RuleContext, text: string | null | undefined): string | null {
  const t = ` ${norm(text).replace(/[^a-z0-9]+/g, ' ')} `;
  const squeezed = t.replace(/ /g, '');
  // "i arch" also matches "iarch"; a squeezed name only when it is long enough not to hide inside a word.
  return ctx.settings.profile.competitors.find((c) => t.includes(` ${c} `) || (c.replace(/ /g, '').length >= 5 && squeezed.includes(c.replace(/ /g, '')))) ?? null;
}

/** Years in a text that are before the current exam cycle (2026 when NATA 2027 is next). */
export function staleYears(text: string | null | undefined, endDate: string): string[] {
  return pastCycleYears(text, examCycleYear(endDate));
}

/** Enabled campaigns with a budget, as of the last week of data. */
function enabledBudgets(ctx: RuleContext) {
  return aggregate(ctx.rows, 'campaign', windowEnding(ctx.endDate, 7)).filter((c) => c.status === 'ENABLED' && (c.budget_micros ?? 0) > 0);
}

function evidence(w: Window | JudgeWindow, aggs: Aggregate[], facts?: Finding['evidence']['facts']): Finding['evidence'] {
  const ev: Finding['evidence'] = { window: { from: w.from, to: w.to, days: w.days }, rows: aggs.map((a) => evidenceRow(a)), facts };
  if ('proxy' in w && w.proxy) ev.proxy = true;
  return ev;
}

const PROXY_NOTE = " Based on last season's Sign-up conversions, before the OTP conversion went live.";

/**
 * Search terms worth asking the AI about: the costliest ones that did not
 * convert (possible negatives) and the ones that did but are not keywords yet
 * (possible new keywords). Not already handled either way.
 */
export function searchTermCandidates(ctx: RuleContext, limit = 80): Aggregate[] {
  const open = aggregate(ctx.rows, 'search_term', window30(ctx)).filter((a) => a.clicks >= 1 && !EXCLUDED_TERM_STATUSES.has(a.status ?? ''));
  const winners = open.filter((a) => a.conversions > 0).sort((a, b) => b.conversions - a.conversions).slice(0, 20);
  const losers = open.filter((a) => a.conversions === 0).sort((a, b) => b.cost - a.cost).slice(0, limit - winners.length);
  return [...winners, ...losers];
}

/**
 * A negative must not block traffic that converts or a keyword we bid on.
 * Returns the phrase to block and its match type, or null if nothing is safe.
 */
export function safeNegative(
  term: string,
  suggested: string | null | undefined,
  converting: string[],
  keywords: string[],
): { text: string; match_type: 'EXACT' | 'PHRASE' } | null {
  const t = term.trim().toLowerCase();
  // A phrase negative N blocks every search containing N, so it is unsafe when
  // a converting search or a keyword we bid on contains N. An exact negative
  // blocks only that one search.
  const blocks = (phrase: string, exact: boolean) =>
    converting.some((c) => (exact ? c === phrase : c.includes(phrase))) || keywords.some((k) => (exact ? k === phrase : k.includes(phrase)));

  const s = (suggested || '').trim().toLowerCase();
  if (s && s.length >= 3 && t.includes(s) && !blocks(s, false)) return { text: s, match_type: 'PHRASE' };
  if (!blocks(t, true)) return { text: t, match_type: 'EXACT' };
  return null;
}

/** R1 + R2: search terms that waste money, and terms that are off scope. */
export function ruleSearchTerms(ctx: RuleContext): Finding[] {
  const w = window30(ctx);
  const jw = judgeWindow(ctx);
  const { target_cpa_inr } = targets(ctx);
  const { min_clicks_to_judge } = ctx.settings.guardrails;
  const terms = aggregate(ctx.rows, 'search_term', w);
  // "Wasteful" judges by conversions, so it only looks at trusted conversion data.
  const judged = new Map(jw ? aggregate(ctx.rows, 'search_term', jw).map((a) => [a.key, a]) : []);
  const converting = terms.filter((a) => a.conversions > 0).map((a) => (a.text || '').toLowerCase());
  // A negative must never block a protected keyword or Neram's own name either.
  const keywords = [...aggregate(ctx.rows, 'keyword', w).map((a) => (a.text || '').toLowerCase()), ...ctx.settings.profile.protected_keywords, 'neram'];
  const stopped = notServingCampaigns(ctx);
  const out: Finding[] = [];

  for (const a of terms) {
    if (a.conversions > 0 || EXCLUDED_TERM_STATUSES.has(a.status ?? '') || !a.text || !a.campaign_id) continue;
    const label = ctx.intents.get(a.key);
    const j = judged.get(a.key);
    const wasteful = !!j && !stopped.has(a.campaign_id) && j.conversions === 0 && j.cost >= 2 * target_cpa_inr && j.clicks >= min_clicks_to_judge;
    const offScope = !!label && NEGATIVE_INTENTS.includes(label.intent) && label.confidence >= 0.6 && a.clicks >= 2;
    if (!wasteful && !offScope) continue;

    const facts = { target_cpa_inr, campaign: a.campaign_name ?? a.campaign_id };

    // Relevant or competitor traffic that does not convert is a page or ad problem, not a negative.
    if (label && !NEGATIVE_INTENTS.includes(label.intent) && label.intent !== 'unclear') {
      out.push({
        ruleId: 'R1',
        category: 'insight',
        entityType: 'search_term',
        entityId: a.key,
        campaignId: a.campaign_id,
        title: label.intent === 'competitor' ? `Competitor search "${a.text}" is not converting` : `Relevant search "${a.text}" is not converting`,
        reason: `${inr(a.cost)} spent on ${a.clicks} clicks in ${w.days} days with 0 conversions. The search looks ${label.intent === 'competitor' ? 'like a competitor name' : 'relevant'}, so blocking it may lose real students. Check the ad and landing page this search reaches.`,
        priority: 'medium',
        risk: 'low',
        proposedChange: { kind: 'none' },
        evidence: evidence(w, [a], facts),
        dedupeKey: `insight:term:${a.key}`,
      });
      continue;
    }

    const neg = safeNegative(a.text, label?.suggested_negative, converting, keywords);
    if (!neg) continue;
    const priority: Priority = a.cost >= target_cpa_inr ? 'high' : 'medium';
    out.push({
      ruleId: offScope ? 'R2' : 'R1',
      category: 'add_negative',
      entityType: 'search_term',
      entityId: a.key,
      campaignId: a.campaign_id,
      title: `Block "${neg.text}" as a ${neg.match_type === 'EXACT' ? 'exact' : 'phrase'} match negative`,
      reason: offScope
        ? `The search "${a.text}" is outside what Neram sells and has cost ${inr(a.cost)} for ${a.clicks} clicks with 0 conversions in ${w.days} days.`
        : `The search "${a.text}" has cost ${inr(a.cost)} for ${a.clicks} clicks with 0 conversions in ${w.days} days, more than twice the target CPA of ${inr(target_cpa_inr)}.`,
      priority,
      risk: 'low',
      estimatedImpact: `Saves about ${inr(a.cost)} a month at the current rate.`,
      proposedChange: { kind: 'add_negative', campaign_id: a.campaign_id, text: neg.text, match_type: neg.match_type },
      evidence: evidence(w, [a], facts),
      dedupeKey: `neg:${a.campaign_id}:${neg.text}`,
      aiIntent: label?.intent ?? null,
      confidence: label?.confidence ?? null,
    });
  }
  return out;
}

/** R3: keywords that spent three target CPAs and never converted. */
export function ruleKeywordWaste(ctx: RuleContext): Finding[] {
  const w = judgeWindow(ctx);
  if (!w) return [];
  const { target_cpa_inr } = targets(ctx);
  const minClicks = Math.max(30, ctx.settings.guardrails.min_clicks_to_judge);
  const stopped = notServingCampaigns(ctx);
  const all = aggregate(ctx.rows, 'keyword', w);
  // Protected keywords still count as siblings; they are only never paused themselves.
  const enabledPerGroup = new Map<string, number>();
  for (const k of all) if (k.status === 'ENABLED' && k.ad_group_id) enabledPerGroup.set(k.ad_group_id, (enabledPerGroup.get(k.ad_group_id) ?? 0) + 1);
  return all
    .filter((a) => !isProtected(ctx, a.text) && !stopped.has(a.campaign_id ?? ''))
    // Never the last enabled keyword of an ad group: that would stop the group entirely.
    .filter((a) => a.status === 'ENABLED' && a.conversions === 0 && a.clicks >= minClicks && a.cost >= 3 * target_cpa_inr && a.ad_group_id && a.criterion_id && (enabledPerGroup.get(a.ad_group_id) ?? 0) > 1)
    .map((a) => ({
      ruleId: 'R3',
      category: 'pause_keyword' as const,
      entityType: 'keyword' as const,
      entityId: a.key,
      campaignId: a.campaign_id,
      title: `Pause keyword "${a.text}"`,
      reason: `${inr(a.cost)} spent on ${a.clicks} clicks in ${w.days} days with 0 conversions, ${Math.round(a.cost / target_cpa_inr)} times the target CPA of ${inr(target_cpa_inr)}.`,
      priority: 'high' as const,
      risk: 'medium' as const,
      estimatedImpact: `Saves about ${inr(a.cost)} a month, which the campaign can spend on keywords that convert.`,
      proposedChange: { kind: 'pause_keyword' as const, ad_group_id: a.ad_group_id!, criterion_id: a.criterion_id!, text: a.text ?? '' },
      evidence: evidence(w, [a], { target_cpa_inr, ad_group: a.ad_group_name }),
      dedupeKey: `pause:${a.key}`,
    }));
}

/** R4: a campaign held back by its budget while beating the target CPA. */
export function ruleBudgetLimitedWinner(ctx: RuleContext): Finding[] {
  const w = judgeWindow(ctx);
  if (!w) return [];
  const { target_cpa_inr, monthly_spend_cap_inr } = targets(ctx);
  const pct = ctx.settings.guardrails.max_budget_change_pct;
  const stopped = notServingCampaigns(ctx);
  const campaigns = aggregate(ctx.rows, 'campaign', w).filter((c) => !stopped.has(c.campaign_id ?? ''));
  const totalDailyBudget = enabledBudgets(ctx).reduce((s, c) => s + (c.budget_micros ?? 0) / 1e6, 0);
  const out: Finding[] = [];

  for (const c of campaigns) {
    const d = derive(c);
    if (c.status !== 'ENABLED' || !c.budget_micros || !(c.primary_status ?? '').includes('BUDGET_CONSTRAINED')) continue;
    if (c.conversions < 5 || d.cpa === null || d.cpa > target_cpa_inr) continue;

    const current = c.budget_micros / 1e6;
    const headroom = monthly_spend_cap_inr / DAYS_PER_BILLING_MONTH - totalDailyBudget;
    const raise = Math.min(current * (pct / 100), headroom);
    if (raise < current * 0.05) continue; // under 5% is not worth a change; the cap is the limit

    const to = Math.round(current + raise);
    const realPct = Math.round(((to - current) / current) * 100);
    out.push({
      ruleId: 'R4',
      category: 'budget_raise',
      entityType: 'campaign',
      entityId: c.key,
      campaignId: c.campaign_id,
      title: `Raise the daily budget of "${c.campaign_name}" by ${realPct}%`,
      reason: `Google reports this campaign as limited by budget, and its CPA of ${inr(d.cpa)} over ${w.days} days is within the target of ${inr(target_cpa_inr)} on ${c.conversions} conversions.`,
      priority: 'medium',
      risk: 'medium',
      estimatedImpact: `Up to ${Math.round((c.conversions * realPct) / 100)} more conversions a month at the same CPA, if the extra budget finds the same quality of traffic.`,
      proposedChange: { kind: 'budget_change', campaign_id: c.campaign_id!, from_micros: c.budget_micros, to_micros: to * 1_000_000, pct: realPct },
      evidence: evidence(w, [c], { daily_budget_inr: current, proposed_daily_budget_inr: to, monthly_spend_cap_inr }),
      dedupeKey: `budget:${c.campaign_id}`,
    });
  }
  return out;
}

/** R5: CPA up 40% or more week on week, with enough conversions to mean it. */
export function ruleCpaDrift(ctx: RuleContext): Finding[] {
  const cur = windowEnding(ctx.endDate, 7);
  const prev = windowEnding(shiftDate(ctx.endDate, -7), 7);
  const now = aggregate(ctx.rows, 'campaign', cur);
  const before = new Map(aggregate(ctx.rows, 'campaign', prev).map((a) => [a.key, a]));
  const out: Finding[] = [];
  for (const c of now) {
    const p = before.get(c.key);
    if (!p || c.conversions < 3 || p.conversions < 3) continue;
    const cpaNow = derive(c).cpa!;
    const cpaBefore = derive(p).cpa!;
    if (cpaNow < cpaBefore * 1.4) continue;
    out.push({
      ruleId: 'R5',
      category: 'insight',
      entityType: 'campaign',
      entityId: c.key,
      campaignId: c.campaign_id,
      title: `CPA of "${c.campaign_name}" rose ${Math.round((cpaNow / cpaBefore - 1) * 100)}% this week`,
      reason: `Cost per conversion went from ${inr(cpaBefore)} (${prev.from} to ${prev.to}) to ${inr(cpaNow)} (${cur.from} to ${cur.to}).`,
      priority: 'high',
      risk: 'low',
      proposedChange: { kind: 'none' },
      evidence: { window: cur, rows: [evidenceRow(c, 'This week'), evidenceRow(p, 'Previous week')], facts: { cpa_now: cpaNow, cpa_before: cpaBefore } },
      dedupeKey: `drift:${c.key}:${cur.to}`,
    });
  }
  return out;
}

/** R6: clicks keep coming but conversions stopped. Usually a broken tag, not bad traffic. */
export function ruleTrackingBreak(ctx: RuleContext): Finding[] {
  const recent = windowEnding(ctx.endDate, 3);
  const before = windowEnding(shiftDate(ctx.endDate, -3), 14);
  const campaignRows = ctx.rows.filter((r) => r.level === 'campaign');
  const r = toTotals(campaignRows.filter((x) => x.date >= recent.from && x.date <= recent.to));
  const b = toTotals(campaignRows.filter((x) => x.date >= before.from && x.date <= before.to));
  const expectedClicks = (b.clicks / 14) * 3;
  if (r.clicks < 15 || r.conversions > 0 || b.conversions < 3 || r.clicks < expectedClicks * 0.5) return [];
  return [
    {
      ruleId: 'R6',
      category: 'alert',
      entityType: 'account',
      entityId: 'account',
      campaignId: null,
      title: 'Conversions stopped while clicks continue',
      reason: `${r.clicks} clicks and 0 conversions in the last 3 days, after ${b.conversions} conversions in the 14 days before. Check that OTP sign-ups are still happening in the app and that the Phone verified upload ran (Overview, Nightly jobs).`,
      priority: 'critical',
      risk: 'low',
      proposedChange: { kind: 'none' },
      evidence: {
        window: recent,
        rows: [
          { key: 'recent', label: 'Last 3 days', impressions: r.impressions, clicks: r.clicks, cost: r.cost, conversions: r.conversions, ...pick(derive(r)) },
          { key: 'before', label: 'Previous 14 days', impressions: b.impressions, clicks: b.clicks, cost: b.cost, conversions: b.conversions, ...pick(derive(b)) },
        ],
      },
      dedupeKey: `tracking:${recent.to}`,
    },
  ];
}

const pick = (d: ReturnType<typeof derive>) => ({ ctr: d.ctr, cpc: d.cpc, cpa: d.cpa });

/** R7: an enabled campaign that spent last week and showed nothing on the last day. Billing, policy or a pause. */
export function ruleDeliveryStop(ctx: RuleContext): Finding[] {
  const week = windowEnding(shiftDate(ctx.endDate, -1), 7);
  const lastDay = windowEnding(ctx.endDate, 1);
  const prior = aggregate(ctx.rows, 'campaign', week);
  const today = new Map(aggregate(ctx.rows, 'campaign', lastDay).map((a) => [a.key, a]));
  const stopped = notServingCampaigns(ctx); // three days or more: R0 says it instead
  return prior
    .filter((c) => c.status === 'ENABLED' && c.cost > 0 && (today.get(c.key)?.impressions ?? 0) === 0 && !stopped.has(c.campaign_id ?? ''))
    .map((c) => ({
      ruleId: 'R7',
      category: 'alert' as const,
      entityType: 'campaign' as const,
      entityId: c.key,
      campaignId: c.campaign_id,
      title: `"${c.campaign_name}" stopped showing ads`,
      reason: `0 impressions on ${ctx.endDate} after ${inr(c.cost)} of spend in the 7 days before. Check billing (the account has run low on balance before), policy notices and the campaign status in Google Ads.`,
      priority: 'critical' as const,
      risk: 'low' as const,
      proposedChange: { kind: 'none' as const },
      evidence: evidence(week, [c], { last_day: ctx.endDate }),
      dedupeKey: `delivery:${c.key}:${ctx.endDate}`,
    }));
}

/**
 * R8: an ad group whose ads are rarely clicked (CTR under half the account
 * median) or whose ad strength is POOR gets a new responsive search ad, written
 * by the AI in pipeline.ts. It reuses the final URL of the group's best ad, and
 * is skipped when the group already has Google's maximum of 3 enabled.
 */
export function ruleNewAd(ctx: RuleContext): Finding[] {
  const w = window30(ctx);
  const groups = aggregate(ctx.rows, 'ad_group', w).filter((a) => a.impressions >= 300 && a.ad_group_id);
  const med = median(groups.map((g) => derive(g).ctr ?? 0));
  const ads = aggregate(ctx.rows, 'ad', w);
  const out: Finding[] = [];
  for (const g of groups) {
    const groupAds = ads.filter((a) => a.ad_group_id === g.ad_group_id && a.status === 'ENABLED');
    const poor = groupAds.some((a) => (a.attributes as any)?.ad_strength === 'POOR');
    const weak = med !== null && groups.length >= 2 && (derive(g).ctr ?? 0) < med * 0.5;
    if (!poor && !weak) continue;
    const rsas = groupAds.filter((a) => ((a.attributes as any)?.type ?? 'RESPONSIVE_SEARCH_AD') === 'RESPONSIVE_SEARCH_AD');
    if (rsas.length >= 3) continue;
    const best = [...groupAds].sort((a, b) => b.clicks - a.clicks)[0];
    const finalUrls: string[] = ((best?.attributes as any)?.final_urls ?? []).filter((u: unknown) => typeof u === 'string');
    if (!finalUrls.length) continue;
    out.push({
      ruleId: 'R8',
      category: 'new_ad',
      entityType: 'ad_group',
      entityId: g.key,
      campaignId: g.campaign_id,
      title: `Test a new ad in "${g.ad_group_name}"`,
      reason: weak
        ? `CTR is ${derive(g).ctr}% over ${w.days} days against an account median of ${Math.round(med! * 100) / 100}%. A new ad that matches these searches more closely should lift clicks and Quality Score.`
        : `Google rates an ad in this group as POOR. A new ad with more varied headlines gives Google better combinations to test.`,
      priority: 'medium',
      risk: 'low',
      estimatedImpact: 'Runs beside the current ads, so Google can show whichever wins. The weaker ad can be paused later.',
      proposedChange: { kind: 'new_ad', campaign_id: g.campaign_id!, ad_group_id: g.ad_group_id!, headlines: [], descriptions: [], final_urls: finalUrls },
      evidence: evidence(w, [g, ...groupAds], { account_median_ctr: med === null ? null : Math.round(med * 100) / 100 }),
      dedupeKey: `newad:${g.key}`,
    });
  }
  return out;
}

/** R9: one device costing twice the campaign CPA. Advice only; bid adjustments are applied by hand. */
export function ruleDeviceSkew(ctx: RuleContext): Finding[] {
  const w = judgeWindow(ctx);
  if (!w) return [];
  const campaigns = new Map(aggregate(ctx.rows, 'campaign', w).map((c) => [c.campaign_id, c]));
  const out: Finding[] = [];
  for (const d of aggregate(ctx.rows, 'device', w)) {
    const c = campaigns.get(d.campaign_id);
    if (!c || c.conversions < 5 || d.clicks < 30) continue;
    const campaignCpa = derive(c).cpa!;
    const deviceCpa = d.conversions > 0 ? d.cost / d.conversions : Infinity;
    if (deviceCpa < campaignCpa * 2) continue;
    const device = (d.text ?? '').toLowerCase();
    out.push({
      ruleId: 'R9',
      category: 'device_bid',
      entityType: 'device',
      entityId: d.key,
      campaignId: d.campaign_id,
      title: `Lower bids on ${device} in "${c.campaign_name}"`,
      reason: `${device} costs ${Number.isFinite(deviceCpa) ? inr(deviceCpa) : `${inr(d.cost)} with no conversions`} per conversion against ${inr(campaignCpa)} for the campaign over ${w.days} days.`,
      priority: 'medium',
      risk: 'medium',
      proposedChange: { kind: 'device_bid', campaign_id: d.campaign_id!, device: d.text ?? '', suggested_modifier_pct: -30 },
      evidence: evidence(w, [d, c], { campaign_cpa: campaignCpa }),
      dedupeKey: `device:${d.key}`,
    });
  }
  return out;
}

/**
 * R10: the daily budgets allow more than the monthly cap. Google may spend up
 * to 30.4 times the daily budget in a month, so the budgets are trimmed in
 * proportion until they fit. This is how the off-season minimum is held: on
 * 1 July the cap drops and this rule proposes the cut.
 */
export function ruleBudgetOverCap(ctx: RuleContext): Finding[] {
  const t = targets(ctx);
  const campaigns = enabledBudgets(ctx);
  const total = campaigns.reduce((s, c) => s + c.budget_micros! / 1e6, 0);
  const allowed = t.monthly_spend_cap_inr / DAYS_PER_BILLING_MONTH;
  if (!campaigns.length || total <= allowed * 1.02) return [];
  const factor = allowed / total;
  const label = t.in_season ? 'season' : 'off-season';
  return campaigns.map((c) => {
    const from = c.budget_micros! / 1e6;
    const to = Math.max(MIN_DAILY_BUDGET_INR, Math.floor(from * factor));
    const pct = Math.round(((to - from) / from) * 100);
    return {
      ruleId: 'R10',
      category: 'budget_cut' as const,
      entityType: 'campaign' as const,
      entityId: c.key,
      campaignId: c.campaign_id,
      title: `Lower the daily budget of "${c.campaign_name}" to ${inr(to)} to stay within ${inr(t.monthly_spend_cap_inr)} a month`,
      reason: `The enabled campaigns have daily budgets of ${inr(total)} in total, which lets Google spend up to ${inr(total * DAYS_PER_BILLING_MONTH)} a month. The ${label} cap is ${inr(t.monthly_spend_cap_inr)}, so all daily budgets together should be about ${inr(allowed)}.`,
      priority: 'high' as const,
      risk: 'low' as const,
      estimatedImpact: `Keeps monthly spend at or under ${inr(t.monthly_spend_cap_inr)}. Expect fewer clicks; the other rules keep the remaining budget on the searches that convert.`,
      proposedChange: { kind: 'budget_change' as const, campaign_id: c.campaign_id!, from_micros: c.budget_micros!, to_micros: to * 1_000_000, pct },
      evidence: evidence(windowEnding(ctx.endDate, 7), [c], { daily_budget_inr: from, proposed_daily_budget_inr: to, monthly_cap_inr: t.monthly_spend_cap_inr, all_daily_budgets_inr: Math.round(total) }),
      dedupeKey: `budget:${c.campaign_id}`,
    };
  });
}

/** R11: month-to-date spend is running ahead of the monthly cap, or has reached it. */
export function ruleSpendPacing(ctx: RuleContext): Finding[] {
  const t = targets(ctx);
  if (t.monthly_spend_cap_inr <= 0) return [];
  const monthStart = `${ctx.endDate.slice(0, 7)}-01`;
  const mtd = toTotals(ctx.rows.filter((r) => r.level === 'campaign' && r.date >= monthStart && r.date <= ctx.endDate));
  const day = Number(ctx.endDate.slice(8, 10));
  const [y, m] = ctx.endDate.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const projected = (mtd.cost / day) * daysInMonth;
  const month = ctx.endDate.slice(0, 7);
  const base = {
    ruleId: 'R11',
    category: 'alert' as const,
    entityType: 'account' as const,
    entityId: 'account',
    campaignId: null,
    risk: 'low' as const,
    proposedChange: { kind: 'none' as const },
    evidence: {
      window: { from: monthStart, to: ctx.endDate, days: day },
      rows: [{ key: 'mtd', label: 'This month so far', impressions: mtd.impressions, clicks: mtd.clicks, cost: mtd.cost, conversions: mtd.conversions, ...pick(derive(mtd)) }],
      facts: { monthly_cap_inr: t.monthly_spend_cap_inr, projected_month_inr: Math.round(projected) },
    },
  };
  if (mtd.cost >= t.monthly_spend_cap_inr) {
    return [
      {
        ...base,
        title: `The ${inr(t.monthly_spend_cap_inr)} monthly cap is used up`,
        reason: `${inr(mtd.cost)} spent by ${ctx.endDate}. Pause the campaigns in Google Ads for the rest of the month, or raise the cap in Agent Settings.`,
        priority: 'critical' as const,
        dedupeKey: `pacing:${month}:over`,
      },
    ];
  }
  if (day >= 5 && projected > t.monthly_spend_cap_inr * 1.15) {
    return [
      {
        ...base,
        title: `On track to spend ${inr(projected)} this month, over the ${inr(t.monthly_spend_cap_inr)} cap`,
        reason: `${inr(mtd.cost)} spent in the first ${day} days. Approve the budget cuts the agent proposes, or lower budgets in Google Ads.`,
        priority: 'high' as const,
        dedupeKey: `pacing:${month}:ahead`,
      },
    ];
  }
  return [];
}

/**
 * The last finished admission season in the data: its spend and cost per
 * conversion (whatever conversion was primary then). A benchmark for the
 * season ramp and the weekly report, never a basis for an automatic change.
 */
export function lastSeason(rows: EntityDay[], settings: AgentSettings, endDate: string): { year: number; spend: number; conversions: number; cpa: number | null } | null {
  const months = settings.targets.season.months;
  if (!months.length) return null;
  const month = Number(endDate.slice(5, 7));
  const year = Number(endDate.slice(0, 4)) - (month > Math.max(...months) ? 0 : 1);
  const inSeason = rows.filter((r) => r.level === 'campaign' && Number(r.date.slice(0, 4)) === year && months.includes(Number(r.date.slice(5, 7))));
  if (!inSeason.length) return null;
  const t = toTotals(inSeason);
  return { year, spend: Math.round(t.cost), conversions: t.conversions, cpa: t.conversions > 0 ? Math.round(t.cost / t.conversions) : null };
}

/**
 * R12: the admission season has started (or starts next month) but the
 * budgets still allow only a fraction of the season cap. Spend should rise
 * ahead of the season, not after it.
 */
export function ruleSeasonRamp(ctx: RuleContext): Finding[] {
  const t = targets(ctx);
  const months = ctx.settings.targets.season.months;
  const nextMonth = (Number(ctx.endDate.slice(5, 7)) % 12) + 1;
  const startsNext = !t.in_season && months.length > 0 && nextMonth === Math.min(...months);
  if (!t.in_season && !startsNext) return [];
  const seasonCap = ctx.settings.targets.season.monthly_spend_cap_inr;
  const campaigns = enabledBudgets(ctx);
  const capacity = campaigns.reduce((s, c) => s + c.budget_micros! / 1e6, 0) * DAYS_PER_BILLING_MONTH;
  if (!campaigns.length || capacity >= seasonCap * 0.5) return [];
  const last = lastSeason(ctx.rows, ctx.settings, ctx.endDate);
  const benchmark = last && last.cpa !== null ? ` Last season (${last.year}) spent ${inr(last.spend)} at ${inr(last.cpa)} per conversion.` : '';
  return [
    {
      ruleId: 'R12',
      category: 'insight',
      entityType: 'account',
      entityId: 'account',
      campaignId: null,
      title: startsNext
        ? `Admission season starts next month: budgets allow only ${inr(capacity)} of the ${inr(seasonCap)} season cap`
        : `Admission season: budgets allow only ${inr(capacity)} of the ${inr(seasonCap)} season cap`,
      reason: `${startsNext ? 'The season months start next month.' : 'The season months have started.'} Raise the daily budgets in Google Ads toward ${inr(seasonCap / DAYS_PER_BILLING_MONTH)} in total, starting with the campaign that converts best. After that the agent proposes further raises only for campaigns that beat the target cost per conversion.${benchmark}`,
      priority: 'medium',
      risk: 'medium',
      proposedChange: { kind: 'none' },
      evidence: evidence(windowEnding(ctx.endDate, 7), campaigns, {
        season_cap_inr: seasonCap,
        budgets_allow_inr: Math.round(capacity),
        last_season_spend_inr: last?.spend ?? null,
        last_season_cpa_inr: last?.cpa ?? null,
      }),
      dedupeKey: `season:${ctx.endDate.slice(0, 7)}`,
    },
  ];
}

/** R13: a search that produced sign-ups but is not a keyword yet. Adding it as exact match gets more of that traffic. */
export function ruleAddKeyword(ctx: RuleContext): Finding[] {
  const w = judgeWindow(ctx, 30, { proxy: true });
  if (!w) return [];
  const { target_cpa_inr } = targets(ctx);
  const keywordTexts = new Set([...currentState(ctx, 'keyword').values()].map((k) => `${k.ad_group_id}|${(k.text || '').toLowerCase()}`));
  const out: Finding[] = [];
  for (const a of aggregate(ctx.rows, 'search_term', w)) {
    if (!a.text || !a.ad_group_id || !a.campaign_id || EXCLUDED_TERM_STATUSES.has(a.status ?? '')) continue;
    if (a.conversions < (w.proxy ? 2 : 1) || a.clicks < 3) continue;
    // Competitor searches belong in their own campaign, and last year's searches are over.
    if (competitorIn(ctx, a.text) || staleYears(a.text, ctx.endDate).length) continue;
    const cpa = derive(a).cpa;
    if (cpa === null || cpa > target_cpa_inr) continue;
    const text = a.text.trim().toLowerCase();
    if (text.length > 80 || text.split(/\s+/).length > 10 || keywordTexts.has(`${a.ad_group_id}|${text}`)) continue;
    const label = ctx.intents.get(a.key);
    if (label && label.intent !== 'high_intent' && label.intent !== 'research') continue;
    out.push({
      ruleId: 'R13',
      category: 'add_keyword',
      entityType: 'search_term',
      entityId: a.key,
      campaignId: a.campaign_id,
      title: `Add "${text}" as an exact match keyword`,
      reason: `This search brought ${a.conversions} ${w.proxy ? 'conversion' : 'sign-up'}${a.conversions === 1 ? '' : 's'} at ${inr(cpa)} each over ${w.days} days, within the target of ${inr(target_cpa_inr)}, but only through a broader keyword. As its own keyword it gets its own bid and shows more reliably.${w.proxy ? PROXY_NOTE : ''}`,
      priority: 'medium',
      risk: 'medium',
      estimatedImpact: 'More impressions on a search that already converts. Spend still stays within the monthly cap.',
      proposedChange: { kind: 'add_keyword', campaign_id: a.campaign_id, ad_group_id: a.ad_group_id, text, match_type: 'EXACT' },
      evidence: evidence(w, [a], { target_cpa_inr, ad_group: a.ad_group_name }),
      dedupeKey: `kw:${a.ad_group_id}:${text}`,
      aiIntent: label?.intent ?? null,
      confidence: label?.confidence ?? null,
    });
  }
  return out;
}

/** R14: in a group with several ads, one that is rarely clicked and never converts while another does. */
export function rulePauseAd(ctx: RuleContext): Finding[] {
  const w = judgeWindow(ctx);
  if (!w) return [];
  const ads = aggregate(ctx.rows, 'ad', w).filter((a) => a.status === 'ENABLED' && a.ad_group_id && a.criterion_id);
  const out: Finding[] = [];
  for (const groupId of new Set(ads.map((a) => a.ad_group_id!))) {
    const group = ads.filter((a) => a.ad_group_id === groupId);
    if (group.length < 2 || !group.some((a) => a.conversions > 0)) continue;
    const bestCtr = Math.max(...group.map((a) => derive(a).ctr ?? 0));
    for (const a of group) {
      if (a.impressions < 500 || a.conversions > 0 || (derive(a).ctr ?? 0) >= bestCtr * 0.5) continue;
      const best = group.find((x) => (derive(x).ctr ?? 0) === bestCtr)!;
      out.push({
        ruleId: 'R14',
        category: 'pause_ad',
        entityType: 'ad',
        entityId: a.key,
        campaignId: a.campaign_id,
        title: `Pause the ad "${a.text}" in "${a.ad_group_name}"`,
        reason: `CTR ${derive(a).ctr}% with 0 sign-ups on ${a.impressions} impressions over ${w.days} days, against ${bestCtr}% for the best ad in the group, which does bring sign-ups.`,
        priority: 'medium',
        risk: 'medium',
        proposedChange: { kind: 'pause_ad', campaign_id: a.campaign_id!, ad_group_id: groupId, ad_id: a.criterion_id!, label: a.text ?? '' },
        evidence: evidence(w, [a, best]),
        dedupeKey: `pausead:${a.key}`,
      });
    }
  }
  return out;
}

const PARTS: Array<{ name: string; from: number; to: number }> = [
  { name: 'Night (12am to 6am)', from: 0, to: 5 },
  { name: 'Morning (6am to 12pm)', from: 6, to: 11 },
  { name: 'Afternoon (12pm to 6pm)', from: 12, to: 17 },
  { name: 'Evening (6pm to 12am)', from: 18, to: 23 },
];
const DAY_NAMES: Record<string, string> = { MONDAY: 'Monday', TUESDAY: 'Tuesday', WEDNESDAY: 'Wednesday', THURSDAY: 'Thursday', FRIDAY: 'Friday', SATURDAY: 'Saturday', SUNDAY: 'Sunday' };

/**
 * R15: times of day, and days of the week, that spend without bringing
 * sign-ups. Buckets are wide on purpose: at Neram's budget an hour-by-hour view
 * is noise. Advice only. Under Manual CPC the fix is a lower bid in those
 * slots; under Smart Bidding, which ignores schedule bid adjustments, it is to
 * stop showing ads then (Google Ads > Ad schedule).
 */
export function ruleSchedule(ctx: RuleContext): Finding[] {
  const w = judgeWindow(ctx, 35);
  if (!w) return [];
  const { target_cpa_inr } = targets(ctx);
  const rows = ctx.rows.filter((r) => r.level === 'hour' && r.date >= w.from && r.date <= w.to);
  const out: Finding[] = [];
  for (const campaignId of new Set(rows.map((r) => r.campaign_id!))) {
    const mine = rows.filter((r) => r.campaign_id === campaignId);
    const total = toTotals(mine);
    if (total.conversions < 5) continue;
    const campaignCpa = total.cost / total.conversions;
    const buckets = [
      ...PARTS.map((p) => ({ day: 'Every day', part: p.name, rows: mine.filter((r) => { const h = Number((r.attributes as any)?.hour); return h >= p.from && h <= p.to; }) })),
      ...Object.keys(DAY_NAMES).map((d) => ({ day: DAY_NAMES[d], part: 'All day', rows: mine.filter((r) => (r.attributes as any)?.day_of_week === d) })),
    ];
    const bad = buckets
      .map((b) => ({ ...b, t: toTotals(b.rows) }))
      .filter((b) => b.t.cost >= 2 * target_cpa_inr && (b.t.conversions === 0 || b.t.cost / b.t.conversions >= 2 * campaignCpa));
    if (!bad.length) continue;
    const name = mine[0].campaign_name ?? campaignId;
    const wasted = bad.reduce((s, b) => s + b.t.cost, 0);
    const manual = isManualCpc(ctx, campaignId);
    const slots = bad.map((b) => (b.day === 'Every day' ? b.part.split(' (')[0].toLowerCase() : `on ${b.day}`)).join(', ');
    out.push({
      ruleId: 'R15',
      category: 'ad_schedule',
      entityType: 'campaign',
      entityId: campaignId,
      campaignId,
      title: manual ? `Lower "${name}" bids ${slots}` : `Stop showing "${name}" ads ${slots}`,
      reason: manual
        ? `Over ${w.days} days these times cost ${inr(wasted)} and brought sign-ups at more than twice the campaign's ${inr(campaignCpa)} each, or none. The campaign bids by hand, so add these times in Google Ads (campaign > Ad schedule) with a bid adjustment of -50%, or exclude them.`
        : `Over ${w.days} days these times cost ${inr(wasted)} and brought sign-ups at more than twice the campaign's ${inr(campaignCpa)} each, or none. Set the ad schedule in Google Ads (campaign > Ad schedule) to leave them out.`,
      priority: 'medium',
      risk: 'medium',
      proposedChange: { kind: 'ad_schedule', campaign_id: campaignId, slots: bad.map((b) => ({ day: b.day, part: b.part, cost: Math.round(b.t.cost), conversions: b.t.conversions })) },
      evidence: {
        window: w,
        rows: bad.map((b) => ({ key: `${b.day}|${b.part}`, label: `${b.day}, ${b.part}`, impressions: b.t.impressions, clicks: b.t.clicks, cost: b.t.cost, conversions: b.t.conversions, ...pick(derive(b.t)) })),
        facts: { campaign_cpa_inr: Math.round(campaignCpa) },
      },
      dedupeKey: `schedule:${campaignId}`,
    });
  }
  return out;
}

/** R16: cities that take budget with no sign-ups (often outside the area the campaign means to reach). Advice only. */
export function ruleLocation(ctx: RuleContext): Finding[] {
  const w = judgeWindow(ctx);
  if (!w) return [];
  const { target_cpa_inr } = targets(ctx);
  return aggregate(ctx.rows, 'geo', w)
    .filter((g) => g.campaign_id && g.conversions === 0 && g.cost >= 2 * target_cpa_inr)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 5)
    .map((g) => {
      const city = String((g.attributes as any)?.city ?? g.text ?? g.key);
      return {
        ruleId: 'R16',
        category: 'location' as const,
        entityType: 'geo' as const,
        entityId: g.key,
        campaignId: g.campaign_id,
        title: `Exclude ${city} from "${g.campaign_name}"`,
        reason: `${inr(g.cost)} spent on ${g.clicks} clicks from ${city} over ${w.days} days with no sign-ups. If the campaign is meant for Tamil Nadu, also check Location options in Google Ads: "Presence: people in or regularly in your targeted locations" stops showing ads to people only interested in them.`,
        priority: 'medium' as const,
        risk: 'low' as const,
        proposedChange: { kind: 'location' as const, campaign_id: g.campaign_id!, city, action: 'exclude' as const },
        evidence: evidence(w, [{ ...g, text: city }], { target_cpa_inr }),
        dedupeKey: `geo:${g.key}`,
      };
    });
}

/**
 * R0: an enabled campaign with no impressions for 3 days. On this account that
 * has meant an exhausted prepaid balance (no ads from June to October 2026).
 * While it holds, the rules that judge keywords and budgets skip the campaign.
 */
export function ruleNotServing(ctx: RuleContext): Finding[] {
  const w = windowEnding(ctx.endDate, NOT_SERVING_DAYS);
  return [...notServingCampaigns(ctx).values()].map((c) => {
    const reasons = (c.primary_status ?? '').split('|').filter(Boolean).map((r) => r.toLowerCase().replace(/_/g, ' '));
    const served = ctx.rows.filter((r) => r.level === 'campaign' && r.campaign_id === c.campaign_id && r.impressions > 0).map((r) => r.date).sort();
    const lastServed = served[served.length - 1] ?? null;
    return {
      ruleId: 'R0',
      category: 'alert' as const,
      entityType: 'campaign' as const,
      entityId: c.entity_key,
      campaignId: c.campaign_id,
      title: `"${c.campaign_name ?? c.campaign_id}" is not showing ads`,
      reason: `No impressions in the last ${NOT_SERVING_DAYS} days although the campaign is enabled${lastServed ? ` (last impression on ${lastServed})` : ''}. Google's status: ${reasons.length ? reasons.join(', ') : 'not given'}. On this account the usual cause is an exhausted prepaid balance: Google Ads > Billing > Add funds. Until it shows ads again, the agent makes no changes based on this campaign's numbers.`,
      priority: 'critical' as const,
      risk: 'low' as const,
      proposedChange: { kind: 'none' as const },
      evidence: { window: w, rows: [], facts: { daily_budget_inr: c.budget_micros ? c.budget_micros / 1e6 : null, last_impression_date: lastServed } },
      dedupeKey: `notserving:${c.campaign_id}`,
    };
  });
}

/** A bid in micros, rounded to whole paise as Google requires. */
const roundBid = (micros: number) => Math.round(micros / 10_000) * 10_000;

/**
 * R17: keyword bids, for campaigns that bid by hand (Manual CPC), where the
 * max CPC is the main lever.
 *
 *  - Cut (bid_cut, automatic like a budget cut): a keyword that spent twice
 *    the target with no sign-ups, or converts at more than twice the target,
 *    loses up to the guardrail percentage of its bid. Only on trusted OTP data,
 *    never below ₹5, never a protected keyword, and not where R3 would pause
 *    the keyword outright.
 *  - Raise (bid_raise, approval): a keyword converting at 60% of the target or
 *    better that shows below the first-page bid, or rarely, gains up to the
 *    guardrail percentage, up to the first-page bid and never above the CPC
 *    ceiling. A first-page bid above the ceiling is not chased. May use last
 *    season's history, flagged as such.
 */
export function ruleKeywordBid(ctx: RuleContext): Finding[] {
  const state = currentState(ctx, 'keyword');
  const stopped = notServingCampaigns(ctx);
  const { target_cpa_inr } = targets(ctx);
  const { max_budget_change_pct: pct, max_cpc_ceiling_inr: ceiling, min_clicks_to_judge } = ctx.settings.guardrails;
  const out: Finding[] = [];

  const bidOf = (key: string): number | null => {
    const m = attr(state.get(key), 'effective_cpc_bid_micros') ?? attr(state.get(key), 'cpc_bid_micros');
    return typeof m === 'number' && m > 0 ? m : null;
  };
  const eligible = (a: Aggregate) => state.get(a.key)?.status === 'ENABLED' && !!a.ad_group_id && !!a.criterion_id && isManualCpc(ctx, a.campaign_id);
  const facts = (a: Aggregate, from: number, to: number) => {
    const s = state.get(a.key);
    const fp = attr(s, 'first_page_cpc_micros');
    return { current_bid_inr: from / 1e6, proposed_bid_inr: to / 1e6, first_page_bid_inr: typeof fp === 'number' ? fp / 1e6 : null, quality_score: attr(s, 'quality_score'), target_cpa_inr, ad_group: a.ad_group_name };
  };
  const change = (a: Aggregate, from: number, to: number) => ({
    kind: 'keyword_bid' as const,
    campaign_id: a.campaign_id!,
    ad_group_id: a.ad_group_id!,
    criterion_id: a.criterion_id!,
    text: a.text ?? '',
    from_micros: from,
    to_micros: to,
    pct: Math.round(((to - from) / from) * 100),
  });

  const cut = new Set<string>();
  const jw = judgeWindow(ctx);
  if (jw) {
    for (const a of aggregate(ctx.rows, 'keyword', jw)) {
      if (!eligible(a) || stopped.has(a.campaign_id!) || isProtected(ctx, a.text) || a.clicks < min_clicks_to_judge) continue;
      const from = bidOf(a.key);
      if (!from) continue;
      if (a.conversions === 0 && a.clicks >= Math.max(30, min_clicks_to_judge) && a.cost >= 3 * target_cpa_inr) continue; // R3 pauses it
      const cpa = derive(a).cpa;
      const waste = a.conversions === 0 && a.cost >= 2 * target_cpa_inr;
      const dear = cpa !== null && cpa > 2 * target_cpa_inr;
      if (!waste && !dear) continue;
      const to = Math.max(MIN_KEYWORD_BID_INR * 1e6, roundBid(from * (1 - pct / 100)));
      if (to >= from) continue;
      cut.add(a.key);
      out.push({
        ruleId: 'R17',
        category: 'bid_cut',
        entityType: 'keyword',
        entityId: a.key,
        campaignId: a.campaign_id,
        title: `Lower the bid on "${a.text}" from ${inr(from / 1e6)} to ${inr(to / 1e6)}`,
        reason: waste
          ? `${inr(a.cost)} spent on ${a.clicks} clicks in ${jw.days} days with 0 sign-ups, twice the target of ${inr(target_cpa_inr)}. A lower bid keeps the keyword running for less.`
          : `Each sign-up costs ${inr(cpa)} over ${jw.days} days, more than twice the target of ${inr(target_cpa_inr)}. A lower bid should bring it closer to target.`,
        priority: 'medium',
        risk: 'low',
        estimatedImpact: `Up to ${Math.round(((from - to) / from) * 100)}% less per click on this keyword.`,
        proposedChange: change(a, from, to),
        evidence: evidence(jw, [a], facts(a, from, to)),
        dedupeKey: `bid:${a.key}`,
      });
    }
  }

  const rw = jw ?? judgeWindow(ctx, 30, { proxy: true });
  if (rw) {
    for (const a of aggregate(ctx.rows, 'keyword', rw)) {
      if (!eligible(a) || cut.has(a.key)) continue;
      const from = bidOf(a.key);
      const cpa = derive(a).cpa;
      if (!from || cpa === null || a.conversions < (rw.proxy ? 3 : 2) || cpa > 0.6 * target_cpa_inr) continue;
      const s = state.get(a.key);
      const firstPage = attr(s, 'first_page_cpc_micros');
      const belowFirst = typeof firstPage === 'number' && firstPage > from;
      const rarely = attr(s, 'serving_status') === 'RARELY_SERVED';
      if (!belowFirst && !rarely) continue;
      if (belowFirst && firstPage > ceiling * 1e6) continue; // do not chase an expensive first page
      let to = Math.min(from * (1 + pct / 100), ceiling * 1e6);
      if (belowFirst) to = Math.min(to, firstPage);
      to = roundBid(to);
      if (to - from < 500_000) continue; // under ₹0.50 is not worth a change
      out.push({
        ruleId: 'R17',
        category: 'bid_raise',
        entityType: 'keyword',
        entityId: a.key,
        campaignId: a.campaign_id,
        title: `Raise the bid on "${a.text}" from ${inr(from / 1e6)} to ${inr(to / 1e6)}`,
        reason: `It brings ${rw.proxy ? 'conversions' : 'sign-ups'} at ${inr(cpa)} each over ${rw.days} days (${a.conversions}), well under the target of ${inr(target_cpa_inr)}, but ${belowFirst ? `its bid is below the first-page bid of ${inr(firstPage / 1e6)}` : 'Google shows it rarely'}. A higher bid shows it more often.${rw.proxy ? PROXY_NOTE : ''}`,
        priority: 'medium',
        risk: 'medium',
        estimatedImpact: `More impressions on a keyword that converts. Spend stays within the monthly cap; the bid is never above ${inr(ceiling)}.`,
        proposedChange: change(a, from, to),
        evidence: evidence(rw, [a], facts(a, from, to)),
        dedupeKey: `bid:${a.key}`,
      });
    }
  }
  return out;
}

/**
 * R18: an enabled ad group in a serving campaign with no impressions for 14
 * days (the Brand group sat at ₹8 a click with its ad pending). Names the
 * likely causes from its current state.
 */
export function ruleZeroImpressionGroup(ctx: RuleContext): Finding[] {
  const w = windowEnding(ctx.endDate, 14);
  const stopped = notServingCampaigns(ctx);
  const campaigns = currentState(ctx, 'campaign');
  const keywords = [...currentState(ctx, 'keyword').values()];
  const ads = [...currentState(ctx, 'ad').values()];
  const groupImps = new Map<string, number>();
  const campaignImps = new Map<string, number>();
  for (const r of ctx.rows) {
    if (r.date < w.from || r.date > w.to) continue;
    if (r.level === 'ad_group') groupImps.set(r.ad_group_id!, (groupImps.get(r.ad_group_id!) ?? 0) + r.impressions);
    if (r.level === 'campaign') campaignImps.set(r.campaign_id!, (campaignImps.get(r.campaign_id!) ?? 0) + r.impressions);
  }
  const out: Finding[] = [];
  for (const g of currentState(ctx, 'ad_group').values()) {
    const cid = g.campaign_id ?? '';
    if (g.status !== 'ENABLED' || !g.ad_group_id || g.date < shiftDate(ctx.endDate, -2)) continue;
    if (campaigns.get(cid)?.status !== 'ENABLED' || stopped.has(cid) || !(campaignImps.get(cid) ?? 0)) continue;
    if ((groupImps.get(g.ad_group_id) ?? 0) > 0) continue;

    const kws = keywords.filter((k) => k.ad_group_id === g.ad_group_id && k.status === 'ENABLED');
    const groupAds = ads.filter((a) => a.ad_group_id === g.ad_group_id && a.status === 'ENABLED');
    const causes: string[] = [];
    if (!kws.length) causes.push('it has no enabled keywords');
    if (!groupAds.length) causes.push('it has no enabled ad');
    const unapproved = groupAds.filter((a) => !['APPROVED', 'APPROVED_LIMITED'].includes(attr(a, 'approval')));
    if (groupAds.length && unapproved.length === groupAds.length) causes.push(`its ad is not approved yet (${String(attr(unapproved[0], 'approval') ?? 'unknown').toLowerCase().replace(/_/g, ' ')})`);
    const defaultBid = attr(g, 'cpc_bid_micros');
    const firstPages = kws.map((k) => attr(k, 'first_page_cpc_micros')).filter((v): v is number => typeof v === 'number');
    if (isManualCpc(ctx, cid) && typeof defaultBid === 'number' && (defaultBid < 10e6 || (firstPages.length && defaultBid < Math.min(...firstPages)))) {
      causes.push(`its default bid of ${inr(defaultBid / 1e6)} is below what these searches cost${firstPages.length ? ` (first-page bids from ${inr(Math.min(...firstPages) / 1e6)})` : ''}`);
    }
    if (kws.length && kws.every((k) => attr(k, 'serving_status') === 'RARELY_SERVED')) causes.push('Google shows all its keywords rarely (low search volume or Quality Score)');
    out.push({
      ruleId: 'R18',
      category: 'alert',
      entityType: 'ad_group',
      entityId: g.entity_key,
      campaignId: cid,
      title: `Ad group "${g.ad_group_name}" has shown no ads in 14 days`,
      reason: `The campaign is showing ads, but this group has had 0 impressions since ${w.from}. ${causes.length ? `Likely because ${causes.join('; ')}.` : 'Check its keywords, bids and ad in Google Ads.'}`,
      priority: 'high',
      risk: 'low',
      proposedChange: { kind: 'none' },
      evidence: { window: w, rows: [], facts: { enabled_keywords: kws.length, enabled_ads: groupAds.length, default_bid_inr: typeof defaultBid === 'number' ? defaultBid / 1e6 : null } },
      dedupeKey: `zerogroup:${g.ad_group_id}`,
    });
  }
  return out;
}

/** Rules whose changes always wait for a person, even in a category on auto. */
export const NEVER_AUTO_RULES: readonly string[] = ['R19', 'R20'];

/**
 * R19: the same keyword twice in one ad group in different capitals ("NATA
 * coaching in Madurai" and "nata coaching in madurai"). Google ignores case,
 * so they compete. Keeps the copy with the longer record and pauses the rest.
 * Always needs approval: this is tidying, not waste.
 */
export function ruleDuplicateKeywords(ctx: RuleContext): Finding[] {
  const all = windowEnding(ctx.endDate, PROXY_MAX_DAYS);
  const history = new Map(aggregate(ctx.rows, 'keyword', all).map((a) => [a.key, a]));
  const groups = new Map<string, EntityDay[]>();
  for (const k of currentState(ctx, 'keyword').values()) {
    if (k.status !== 'ENABLED' || !k.ad_group_id || !k.criterion_id || !k.text) continue;
    const key = `${k.ad_group_id}|${norm(k.text)}|${k.match_type}`;
    groups.set(key, [...(groups.get(key) ?? []), k]);
  }
  const out: Finding[] = [];
  for (const copies of groups.values()) {
    if (copies.length < 2) continue;
    const score = (k: EntityDay) => history.get(k.entity_key) ?? null;
    const ranked = [...copies].sort((a, b) => (score(b)?.conversions ?? 0) - (score(a)?.conversions ?? 0) || (score(b)?.clicks ?? 0) - (score(a)?.clicks ?? 0));
    const keep = ranked[0];
    for (const dup of ranked.slice(1)) {
      if (isProtected(ctx, dup.text)) continue;
      const rows = [keep, dup].map((k) => score(k)).filter((a): a is Aggregate => !!a);
      out.push({
        ruleId: 'R19',
        category: 'pause_keyword',
        entityType: 'keyword',
        entityId: dup.entity_key,
        campaignId: dup.campaign_id,
        title: `Pause the duplicate keyword "${dup.text}"`,
        reason: `"${dup.text}" and "${keep.text}" are the same keyword to Google, which ignores capitals, so they compete for the same searches in "${dup.ad_group_name}". Keep "${keep.text}", which has the longer record, and pause this copy.`,
        priority: 'low',
        risk: 'low',
        proposedChange: { kind: 'pause_keyword', ad_group_id: dup.ad_group_id!, criterion_id: dup.criterion_id!, text: dup.text ?? '' },
        evidence: evidence(all, rows, { kept: keep.text, ad_group: dup.ad_group_name }),
        dedupeKey: `pause:${dup.entity_key}`,
      });
    }
  }
  return out;
}

/**
 * R20: enabled keywords and ads that still name a past exam year (2026 when
 * NATA 2027 is next). Proposes the current-year keyword and a copy of the ad
 * with the year changed, both for approval. The old ones are paused by hand
 * once the new ones serve.
 */
export function ruleStaleYear(ctx: RuleContext): Finding[] {
  const cycle = String(examCycleYear(ctx.endDate));
  const swap = (text: string, years: string[]) => text.replace(/\b20\d{2}\b/g, (y) => (years.includes(y) ? cycle : y));
  const keywordStates = [...currentState(ctx, 'keyword').values()];
  const existing = new Set(keywordStates.map((k) => `${k.ad_group_id}|${norm(k.text)}`));
  const recent = new Map(aggregate(ctx.rows, 'keyword', window30(ctx)).map((a) => [a.key, a]));
  const out: Finding[] = [];

  for (const k of keywordStates) {
    const years = staleYears(k.text, ctx.endDate);
    if (k.status !== 'ENABLED' || !years.length || !k.ad_group_id || !k.campaign_id) continue;
    const text = swap(norm(k.text), years);
    if (existing.has(`${k.ad_group_id}|${text}`)) continue;
    existing.add(`${k.ad_group_id}|${text}`);
    const a = recent.get(k.entity_key);
    out.push({
      ruleId: 'R20',
      category: 'add_keyword',
      entityType: 'keyword',
      entityId: k.entity_key,
      campaignId: k.campaign_id,
      title: `Add "${text}" for NATA ${cycle}`,
      reason: `The keyword "${k.text}" still names ${years.join(' and ')}, but students now search for ${cycle}. Add the ${cycle} version with the same match type, then pause the old one once the new one shows ads.`,
      priority: 'medium',
      risk: 'low',
      proposedChange: { kind: 'add_keyword', campaign_id: k.campaign_id, ad_group_id: k.ad_group_id, text, match_type: k.match_type === 'EXACT' ? 'EXACT' : 'PHRASE' },
      evidence: evidence(window30(ctx), a ? [a] : [], { old_keyword: k.text, ad_group: k.ad_group_name }),
      dedupeKey: `kw:${k.ad_group_id}:${text}`,
    });
  }

  const ads = [...currentState(ctx, 'ad').values()].filter((a) => a.status === 'ENABLED' && a.ad_group_id && a.campaign_id);
  for (const ad of ads) {
    const headlines: string[] = attr(ad, 'headline_texts') ?? [];
    const descriptions: string[] = attr(ad, 'description_texts') ?? [];
    const finalUrls: string[] = (attr(ad, 'final_urls') ?? []).filter((u: unknown) => typeof u === 'string');
    const years = [...new Set([...headlines, ...descriptions].flatMap((t) => staleYears(t, ctx.endDate)))];
    if (!years.length || headlines.length < 3 || descriptions.length < 2 || !finalUrls.length) continue;
    if (ads.filter((x) => x.ad_group_id === ad.ad_group_id).length >= 3) continue; // Google's limit; R14 or a person pauses one first
    out.push({
      ruleId: 'R20',
      category: 'new_ad',
      entityType: 'ad_group',
      entityId: ad.ad_group_id!,
      campaignId: ad.campaign_id,
      title: `Replace the ${years.join(' and ')} ad in "${ad.ad_group_name}" with a ${cycle} version`,
      reason: `The ad "${ad.text}" still says ${years.join(' and ')}. This adds a copy with every ${years.join(' and ')} changed to ${cycle}. Read the headlines before approving (for example for spelling), then pause the old ad once Google approves the new one.`,
      priority: 'high',
      risk: 'low',
      estimatedImpact: 'Students searching for this year see an ad that matches it, which usually lifts clicks and Quality Score.',
      proposedChange: { kind: 'new_ad', campaign_id: ad.campaign_id!, ad_group_id: ad.ad_group_id!, headlines: headlines.map((h) => swap(h, years)), descriptions: descriptions.map((d) => swap(d, years)), final_urls: finalUrls },
      evidence: { window: window30(ctx), rows: [], facts: { old_ad: ad.text, ad_group: ad.ad_group_name } },
      dedupeKey: `newad:${ad.ad_group_id}`,
    });
  }
  return out;
}

/**
 * R21: an enabled keyword that names a place outside the campaigns' area
 * ("nata coaching in Bangalore" in a Tamil Nadu campaign). People searching
 * from Tamil Nadu rarely mean it, and people in that place never see the ad.
 * Advice only.
 */
export function ruleOutOfAreaKeyword(ctx: RuleContext): Finding[] {
  const { outside_places: places, target_area: area } = ctx.settings.profile;
  const recent = new Map(aggregate(ctx.rows, 'keyword', window30(ctx)).map((a) => [a.key, a]));
  const out: Finding[] = [];
  for (const k of currentState(ctx, 'keyword').values()) {
    if (k.status !== 'ENABLED' || !k.text) continue;
    const words = ` ${norm(k.text).replace(/[^a-z0-9]+/g, ' ')} `;
    const place = places.find((p) => words.includes(` ${p} `));
    if (!place) continue;
    const name = place.replace(/\b\w/g, (c) => c.toUpperCase());
    const a = recent.get(k.entity_key);
    out.push({
      ruleId: 'R21',
      category: 'insight',
      entityType: 'keyword',
      entityId: k.entity_key,
      campaignId: k.campaign_id,
      title: `Keyword "${k.text}" names ${name}, outside ${area}`,
      reason: `The campaign "${k.campaign_name}" is meant for ${area}, so people in ${name} rarely see this ad, and people in ${area} rarely mean ${name}. If Neram wants ${name} students, give it its own campaign targeting ${name}; otherwise pause this keyword in Google Ads.`,
      priority: 'low',
      risk: 'low',
      proposedChange: { kind: 'none' },
      evidence: evidence(window30(ctx), a ? [a] : [], { place: name, target_area: area }),
      dedupeKey: `area:${k.entity_key}`,
    });
  }
  return out;
}

export const RULES = [
  ruleNotServing,
  ruleKeywordBid,
  ruleZeroImpressionGroup,
  ruleDuplicateKeywords,
  ruleStaleYear,
  ruleOutOfAreaKeyword,
  ruleSearchTerms,
  ruleKeywordWaste,
  ruleBudgetLimitedWinner,
  ruleBudgetOverCap,
  ruleSpendPacing,
  ruleSeasonRamp,
  ruleCpaDrift,
  ruleTrackingBreak,
  ruleDeliveryStop,
  ruleNewAd,
  ruleDeviceSkew,
  ruleAddKeyword,
  rulePauseAd,
  ruleSchedule,
  ruleLocation,
];

const PRIORITY_ORDER: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Run every rule. Two findings with one dedupe key (R1 and R2 on one term) keep the more urgent. */
export function runRules(ctx: RuleContext): Finding[] {
  const byKey = new Map<string, Finding>();
  for (const rule of RULES) {
    for (const f of rule(ctx)) {
      const prev = byKey.get(f.dedupeKey);
      if (!prev || PRIORITY_ORDER[f.priority] < PRIORITY_ORDER[prev.priority]) byKey.set(f.dedupeKey, f);
    }
  }
  return [...byKey.values()].sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}
