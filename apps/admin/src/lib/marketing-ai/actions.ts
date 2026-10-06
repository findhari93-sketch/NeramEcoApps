/**
 * Executing an approved recommendation against Google Ads (spec §5, §10).
 * Read docs/marketing-intelligence/MUTATIONS.md before adding an operation.
 *
 * The order is fixed, and each step can stop the change:
 *
 *   1. Hard blocks. Only these operations exist: add a campaign negative,
 *      pause a keyword, change a non-shared budget (raises within the
 *      guardrail), change a keyword's max CPC under Manual CPC (within the
 *      guardrail and the CPC ceiling), add an exact or phrase keyword, create
 *      a responsive search ad that points at neramclasses.com, pause an ad.
 *      Nothing here can delete a campaign, change a bid strategy or enable
 *      something paused, whatever the settings say. Protected keywords
 *      (Account profile) are never paused, cut or blocked, and no ad may name a
 *      competitor or a past exam year.
 *   2. Drift check. Read the live entity: the keyword is still enabled, the
 *      budget is still what the recommendation saw, the negative is not
 *      already there. Google is the source of truth, not last night's data.
 *   3. Dry run with validateOnly. Google checks the exact request.
 *   4. The real mutate, only when MARKETING_AI_ALLOW_MUTATIONS is 'true'.
 *      Otherwise the action stops at 'validated' and the recommendation stays
 *      approved, so nothing is reported as done that was not done.
 *   5. Record the response and a revert payload, move the recommendation to
 *      executed or failed, and audit before and after.
 */

import type { AdsEnv } from './config';
import { examCycleYear, HARD_LIMITS, MIN_DAILY_BUDGET_INR, MIN_KEYWORD_BID_INR } from './config';
import { adTextProblem } from './ai/validate';
import { GoogleAdsApiError, resourceName, type AdsClient, type MutateResource } from './ads/client';
import { adGroupAdsQuery, adGroupKeywordsQuery, campaignBudgetQuery, campaignNegativesQuery, keywordStateQuery } from './ads/gaql';
import { writeAudit } from './audit';
import { getRecommendation, transition, TransitionError } from './recommendations';
import { isExecutable, type Actor, type AgentSettings, type ProposedChange, type Recommendation } from './types';

export interface ExecuteDeps {
  db: any;
  ads: AdsClient;
  env: AdsEnv;
  settings: AgentSettings;
  actor: Actor;
}

export interface PlannedMutation {
  resource: MutateResource;
  operation: Record<string, unknown>;
  /** How to undo it. The resource name of a created criterion is filled in after the mutate. */
  revert: { resource: MutateResource; operation: Record<string, unknown> } | null;
  before: unknown;
  after: unknown;
}

export type ExecuteOutcome =
  | { status: 'executed'; actionId: string | null; message: string }
  | { status: 'validated'; actionId: string | null; message: string }
  | { status: 'noop'; actionId: null; message: string }
  | { status: 'failed'; actionId: string | null; message: string };

/** IST date today, for the exam-year check. */
const istToday = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);

/** Pure: refuse anything outside the allowed shapes or above the guardrails. */
export function checkHardBlocks(change: ProposedChange | null, settings: AgentSettings, today = istToday()): string | null {
  if (!change) return 'This recommendation has no change to make.';
  const protectedKw = settings.profile.protected_keywords;
  const isProtected = (t: string) => protectedKw.includes(t.toLowerCase().replace(/\s+/g, ' ').trim());
  switch (change.kind) {
    case 'add_negative': {
      if (!/^\d+$/.test(change.campaign_id)) return 'Invalid campaign id.';
      if (!change.text || change.text.length > 80) return 'Negative keyword text is empty or too long.';
      if (!['EXACT', 'PHRASE'].includes(change.match_type)) return 'Negatives may only be exact or phrase match.';
      const neg = change.text.toLowerCase().trim();
      const hits = (k: string) => (change.match_type === 'EXACT' ? k === neg : k.includes(neg));
      if (protectedKw.some(hits) || hits('neram')) return `"${change.text}" would block a protected keyword or Neram's own name.`;
      return null;
    }
    case 'pause_keyword':
      if (!/^\d+$/.test(change.ad_group_id) || !/^\d+$/.test(change.criterion_id)) return 'Invalid keyword id.';
      if (isProtected(change.text)) return `"${change.text}" is a protected keyword (Agent Settings > Account profile).`;
      return null;
    case 'keyword_bid': {
      if (![change.campaign_id, change.ad_group_id, change.criterion_id].every((id) => /^\d+$/.test(id))) return 'Invalid keyword id.';
      if (!(change.from_micros > 0) || !(change.to_micros > 0)) return 'A bid must be above zero.';
      if (change.to_micros % 10_000 !== 0) return 'A bid must be in whole paise.';
      if (change.to_micros < MIN_KEYWORD_BID_INR * 1_000_000) return `A max CPC below ₹${MIN_KEYWORD_BID_INR} barely shows the keyword. Pause it instead.`;
      const ceiling = Math.min(settings.guardrails.max_cpc_ceiling_inr, HARD_LIMITS.max_cpc_ceiling_inr);
      const pct = ((change.to_micros - change.from_micros) / change.from_micros) * 100;
      if (pct > 0 && change.to_micros > ceiling * 1_000_000) return `A max CPC above the ₹${ceiling} ceiling is not allowed.`;
      const limit = Math.min(settings.guardrails.max_budget_change_pct, HARD_LIMITS.max_budget_change_pct);
      if (Math.abs(pct) > limit + 0.5) return `A ${Math.round(Math.abs(pct))}% bid change is above the ${limit}% limit.`;
      if (pct < 0 && isProtected(change.text)) return `"${change.text}" is a protected keyword (Agent Settings > Account profile).`;
      return null;
    }
    case 'budget_change': {
      if (!/^\d+$/.test(change.campaign_id)) return 'Invalid campaign id.';
      if (!(change.from_micros > 0) || !(change.to_micros > 0)) return 'Budget must be above zero.';
      if (change.to_micros < MIN_DAILY_BUDGET_INR * 1_000_000) return `A daily budget below ₹${MIN_DAILY_BUDGET_INR} barely serves ads. Pause the campaign in Google Ads instead.`;
      // Raising spend is capped per change. Cutting it is not: holding the
      // monthly cap (R10) can need a large cut, and a cut never costs money.
      const pct = ((change.to_micros - change.from_micros) / change.from_micros) * 100;
      const limit = Math.min(settings.guardrails.max_budget_change_pct, HARD_LIMITS.max_budget_change_pct);
      if (pct > limit + 0.5) return `A ${Math.round(pct)}% budget increase is above the ${limit}% limit.`;
      return null;
    }
    case 'add_keyword':
      if (!/^\d+$/.test(change.ad_group_id) || !/^\d+$/.test(change.campaign_id)) return 'Invalid ad group id.';
      if (!change.text || change.text.length > 80 || change.text.split(/\s+/).length > 10) return 'Keyword text is empty or too long (Google allows 80 characters and 10 words).';
      if (!['EXACT', 'PHRASE'].includes(change.match_type)) return 'New keywords may only be exact or phrase match.';
      return null;
    case 'new_ad': {
      if (!/^\d+$/.test(change.ad_group_id)) return 'Invalid ad group id.';
      if (change.headlines.length < 3 || change.headlines.length > 15 || change.headlines.some((h) => !h || h.length > 30)) return 'A responsive search ad needs 3 to 15 headlines of up to 30 characters.';
      if (change.descriptions.length < 2 || change.descriptions.length > 4 || change.descriptions.some((d) => !d || d.length > 90)) return 'A responsive search ad needs 2 to 4 descriptions of up to 90 characters.';
      const urls = change.final_urls ?? [];
      if (!urls.length || !urls.every(isNeramUrl)) return 'The ad must point at a neramclasses.com page.';
      const rules = { competitors: settings.profile.competitors, cycleYear: examCycleYear(today) };
      for (const line of [...change.headlines, ...change.descriptions]) {
        const problem = adTextProblem(line, rules);
        if (problem) return `"${line}" ${problem}.`;
      }
      return null;
    }
    case 'pause_ad':
      if (!/^\d+$/.test(change.ad_group_id) || !/^\d+$/.test(change.ad_id)) return 'Invalid ad id.';
      return null;
    default:
      return 'This kind of recommendation is advice only and has no automatic change.';
  }
}

/** Only Neram's own site, over https. An AI-written ad must never send people anywhere else. */
export function isNeramUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' && (url.hostname === 'neramclasses.com' || url.hostname.endsWith('.neramclasses.com'));
  } catch {
    return false;
  }
}

/** Read Google's live state and build the request. Returns a message instead when the world has moved on. */
export async function planMutation(ads: AdsClient, change: ProposedChange): Promise<PlannedMutation | { noop: string } | { drift: string }> {
  const cid = ads.customerId;
  switch (change.kind) {
    case 'add_negative': {
      const existing = await ads.search(campaignNegativesQuery(change.campaign_id));
      const dup = existing.some(
        (r) => (r?.campaignCriterion?.keyword?.text || '').toLowerCase() === change.text.toLowerCase() && r?.campaignCriterion?.keyword?.matchType === change.match_type,
      );
      if (dup) return { noop: `"${change.text}" is already a ${change.match_type.toLowerCase()} negative on this campaign.` };
      return {
        resource: 'campaignCriteria',
        operation: { create: { campaign: resourceName(cid, 'campaigns', change.campaign_id), negative: true, keyword: { text: change.text, matchType: change.match_type } } },
        revert: null, // filled with { remove: <created resource name> } after the mutate
        before: { negative: null },
        after: { negative: { text: change.text, match_type: change.match_type } },
      };
    }
    case 'pause_keyword': {
      const rows = await ads.search(keywordStateQuery(change.ad_group_id, change.criterion_id));
      const live = rows[0]?.adGroupCriterion;
      if (!live) return { drift: 'The keyword no longer exists in Google Ads.' };
      if (live.status !== 'ENABLED') return { noop: `The keyword is already ${String(live.status).toLowerCase()}.` };
      const enabled = (await ads.search(adGroupKeywordsQuery(change.ad_group_id))).filter((r) => r?.adGroupCriterion?.status === 'ENABLED');
      if (enabled.length <= 1) return { drift: 'This is the last enabled keyword in its ad group. Pausing it would stop the ad group, so it is left on.' };
      const rn = live.resourceName || resourceName(cid, 'adGroupCriteria', `${change.ad_group_id}~${change.criterion_id}`);
      return {
        resource: 'adGroupCriteria',
        operation: { update: { resourceName: rn, status: 'PAUSED' }, updateMask: 'status' },
        revert: { resource: 'adGroupCriteria', operation: { update: { resourceName: rn, status: 'ENABLED' }, updateMask: 'status' } },
        before: { status: 'ENABLED' },
        after: { status: 'PAUSED' },
      };
    }
    case 'budget_change': {
      const rows = await ads.search(campaignBudgetQuery(change.campaign_id));
      const live = rows[0];
      const budget = live?.campaignBudget;
      if (!budget?.resourceName) return { drift: 'The campaign or its budget no longer exists.' };
      if (live?.campaign?.status !== 'ENABLED') return { drift: 'The campaign is not enabled any more.' };
      if (budget.explicitlyShared) return { drift: 'This budget is shared with other campaigns. Change it in Google Ads by hand.' };
      const current = Number(budget.amountMicros);
      if (Math.abs(current - change.from_micros) > change.from_micros * 0.01) {
        return { drift: `The budget changed since the recommendation (now ₹${Math.round(current / 1e6)} a day). It will be re-evaluated tonight.` };
      }
      return {
        resource: 'campaignBudgets',
        operation: { update: { resourceName: budget.resourceName, amountMicros: String(change.to_micros) }, updateMask: 'amount_micros' },
        revert: { resource: 'campaignBudgets', operation: { update: { resourceName: budget.resourceName, amountMicros: String(current) }, updateMask: 'amount_micros' } },
        before: { daily_budget_inr: current / 1e6 },
        after: { daily_budget_inr: change.to_micros / 1e6 },
      };
    }
    case 'keyword_bid': {
      const rows = await ads.search(keywordStateQuery(change.ad_group_id, change.criterion_id));
      const live = rows[0]?.adGroupCriterion;
      if (!live) return { drift: 'The keyword no longer exists in Google Ads.' };
      if (live.status !== 'ENABLED') return { drift: `The keyword is ${String(live.status).toLowerCase()} now.` };
      const strategy = rows[0]?.campaign?.biddingStrategyType;
      if (strategy && strategy !== 'MANUAL_CPC') return { drift: 'The campaign no longer bids by hand (Manual CPC), so keyword bids are set by Google.' };
      const current = Number(live.effectiveCpcBidMicros ?? live.cpcBidMicros);
      if (!(current > 0)) return { drift: 'Could not read the keyword bid.' };
      if (Math.abs(current - change.from_micros) > change.from_micros * 0.01) {
        return { drift: `The bid changed since the recommendation (now ₹${Math.round(current / 1e4) / 100}). It will be re-evaluated tonight.` };
      }
      const rn = live.resourceName || resourceName(cid, 'adGroupCriteria', `${change.ad_group_id}~${change.criterion_id}`);
      return {
        resource: 'adGroupCriteria',
        operation: { update: { resourceName: rn, cpcBidMicros: String(change.to_micros) }, updateMask: 'cpc_bid_micros' },
        revert: { resource: 'adGroupCriteria', operation: { update: { resourceName: rn, cpcBidMicros: String(current) }, updateMask: 'cpc_bid_micros' } },
        before: { max_cpc_inr: current / 1e6 },
        after: { max_cpc_inr: change.to_micros / 1e6 },
      };
    }
    case 'add_keyword': {
      const rows = await ads.search(adGroupKeywordsQuery(change.ad_group_id));
      if (rows.length && rows[0]?.adGroup?.status && rows[0].adGroup.status !== 'ENABLED') return { drift: 'The ad group is not enabled any more.' };
      const exists = rows.some((r) => (r?.adGroupCriterion?.keyword?.text || '').toLowerCase() === change.text.toLowerCase() && r?.adGroupCriterion?.keyword?.matchType === change.match_type);
      if (exists) return { noop: `"${change.text}" is already a keyword in this ad group.` };
      return {
        resource: 'adGroupCriteria',
        operation: { create: { adGroup: resourceName(cid, 'adGroups', change.ad_group_id), status: 'ENABLED', keyword: { text: change.text, matchType: change.match_type } } },
        revert: null, // { remove: <created resource name> }
        before: { keyword: null },
        after: { keyword: { text: change.text, match_type: change.match_type } },
      };
    }
    case 'new_ad': {
      const rows = await ads.search(adGroupAdsQuery(change.ad_group_id));
      if (rows.length && rows[0]?.adGroup?.status && rows[0].adGroup.status !== 'ENABLED') return { drift: 'The ad group is not enabled any more.' };
      const rsas = rows.filter((r) => (r?.adGroupAd?.ad?.type ?? 'RESPONSIVE_SEARCH_AD') === 'RESPONSIVE_SEARCH_AD');
      if (rsas.length >= 3) return { drift: 'This ad group already has 3 enabled responsive search ads, the most Google allows. Pause one first.' };
      return {
        resource: 'adGroupAds',
        operation: {
          create: {
            adGroup: resourceName(cid, 'adGroups', change.ad_group_id),
            status: 'ENABLED',
            ad: {
              finalUrls: change.final_urls,
              responsiveSearchAd: { headlines: change.headlines.map((text) => ({ text })), descriptions: change.descriptions.map((text) => ({ text })) },
            },
          },
        },
        revert: null, // { update: { resourceName: <created>, status: PAUSED } }
        before: { ads_enabled: rows.length },
        after: { ads_enabled: rows.length + 1, headlines: change.headlines, descriptions: change.descriptions, final_urls: change.final_urls },
      };
    }
    case 'pause_ad': {
      const rows = await ads.search(adGroupAdsQuery(change.ad_group_id));
      const target = rows.find((r) => String(r?.adGroupAd?.ad?.id) === change.ad_id);
      if (!target) return { noop: 'The ad is already paused or removed.' };
      if (rows.length <= 1) return { drift: 'This is the only enabled ad in its ad group. Pausing it would stop the ad group, so it is left on.' };
      const rn = resourceName(cid, 'adGroupAds', `${change.ad_group_id}~${change.ad_id}`);
      return {
        resource: 'adGroupAds',
        operation: { update: { resourceName: rn, status: 'PAUSED' }, updateMask: 'status' },
        revert: { resource: 'adGroupAds', operation: { update: { resourceName: rn, status: 'ENABLED' }, updateMask: 'status' } },
        before: { status: 'ENABLED' },
        after: { status: 'PAUSED' },
      };
    }
    default:
      return { drift: 'Nothing to execute.' };
  }
}

const errMessage = (err: unknown) => (err instanceof GoogleAdsApiError ? `${err.message}${err.codes.length ? ` [${err.codes.join('; ')}]` : ''}` : err instanceof Error ? err.message : 'unknown error');

async function insertAction(db: any, row: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await db.from('marketing_ai_actions').insert(row).select('id').single();
  if (error) throw new Error(`Could not record the action: ${error.message}`);
  return data?.id ?? null;
}

async function updateAction(db: any, id: string | null, patch: Record<string, unknown>) {
  if (!id) return;
  const { error } = await db.from('marketing_ai_actions').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', id);
  if (error) console.error('[marketing-ai] action update failed:', error.message);
}

export async function executeRecommendation(deps: ExecuteDeps, recId: string): Promise<ExecuteOutcome> {
  const { db, ads, env, settings, actor } = deps;
  const rec: Recommendation | null = await getRecommendation(db, recId);
  if (!rec) throw new TransitionError('Recommendation not found', 404);
  if (rec.status !== 'approved' && rec.status !== 'failed') throw new TransitionError(`Only approved recommendations can be executed (this one is ${rec.status}).`);
  if (!isExecutable(rec.category)) throw new TransitionError('This recommendation is advice only. Apply it in Google Ads by hand.', 400);

  const blocked = checkHardBlocks(rec.proposed_change, settings);
  if (blocked) throw new TransitionError(blocked, 400);

  let plan: Awaited<ReturnType<typeof planMutation>>;
  try {
    plan = await planMutation(ads, rec.proposed_change!);
  } catch (err) {
    return { status: 'failed', actionId: null, message: `Could not read the live state from Google Ads: ${errMessage(err)}` };
  }

  if ('noop' in plan) {
    await writeAudit(db, { actor, event: 'action.noop', entityType: rec.entity_type, entityId: rec.entity_id, reason: plan.noop, recommendationId: rec.id });
    await transition(db, rec.id, 'executing', actor);
    await transition(db, rec.id, 'executed', actor, { patch: { executed_at: new Date().toISOString(), execution_result: { noop: plan.noop } } });
    return { status: 'noop', actionId: null, message: plan.noop };
  }
  if ('drift' in plan) {
    await writeAudit(db, { actor, event: 'action.drift', entityType: rec.entity_type, entityId: rec.entity_id, reason: plan.drift, recommendationId: rec.id, result: 'refused' });
    return { status: 'failed', actionId: null, message: plan.drift };
  }

  const mutationsAllowed = env.allowMutations || ads.mode === 'mock';
  const actionId = await insertAction(db, {
    recommendation_id: rec.id,
    operation: `${plan.resource}:mutate`,
    request: { operations: [plan.operation] },
    validate_only: !mutationsAllowed,
    status: 'pending',
    actor: actor.type === 'admin' ? actor.id : actor.type,
  });

  // Dry run first, every time.
  try {
    const v = await ads.mutate(plan.resource, [plan.operation], { validateOnly: true });
    await updateAction(db, actionId, { status: 'validated', validate_response: v });
  } catch (err) {
    const message = errMessage(err);
    await updateAction(db, actionId, { status: 'failed', error: message });
    await writeAudit(db, { actor, event: 'action.validation_failed', entityType: rec.entity_type, entityId: rec.entity_id, reason: message, recommendationId: rec.id, actionId, result: 'failed' });
    return { status: 'failed', actionId, message: `Google rejected the change in a dry run: ${message}` };
  }

  if (!mutationsAllowed) {
    await writeAudit(db, { actor, event: 'action.validated_only', entityType: rec.entity_type, entityId: rec.entity_id, before: plan.before, after: plan.after, reason: 'MARKETING_AI_ALLOW_MUTATIONS is off, so nothing was changed.', recommendationId: rec.id, actionId, result: 'validated' });
    return { status: 'validated', actionId, message: 'Google accepted the change in a dry run. Live changes are switched off in this environment, so nothing was changed.' };
  }

  await transition(db, rec.id, 'executing', actor);
  try {
    const res = await ads.mutate(plan.resource, [plan.operation], { validateOnly: false });
    const created = res.results[0]?.resourceName ?? null;
    const revert =
      plan.revert ??
      (created
        ? plan.resource === 'adGroupAds'
          ? { resource: plan.resource, operation: { update: { resourceName: created, status: 'PAUSED' }, updateMask: 'status' } }
          : { resource: plan.resource, operation: { remove: created } }
        : null);
    await updateAction(db, actionId, { status: 'succeeded', response: res, revert_payload: revert });
    await transition(db, rec.id, 'executed', actor, {
      patch: { executed_at: new Date().toISOString(), execution_result: { action_id: actionId, resource_name: created, mode: ads.mode } },
    });
    await writeAudit(db, { actor, event: 'action.executed', entityType: rec.entity_type, entityId: rec.entity_id, before: plan.before, after: plan.after, reason: rec.title, runId: rec.run_id, recommendationId: rec.id, actionId, result: 'success' });
    return { status: 'executed', actionId, message: ads.mode === 'mock' ? 'Done (mock account, nothing real changed).' : 'Done. Google Ads confirmed the change.' };
  } catch (err) {
    const message = errMessage(err);
    await updateAction(db, actionId, { status: 'failed', error: message });
    await transition(db, rec.id, 'failed', actor, { patch: { execution_result: { action_id: actionId, error: message } } });
    await writeAudit(db, { actor, event: 'action.failed', entityType: rec.entity_type, entityId: rec.entity_id, before: plan.before, after: plan.after, reason: message, recommendationId: rec.id, actionId, result: 'failed' });
    return { status: 'failed', actionId, message: `Google Ads refused the change: ${message}` };
  }
}

/** Undo a succeeded action with its stored revert payload. */
export async function revertAction(deps: ExecuteDeps, actionId: string): Promise<ExecuteOutcome> {
  const { db, ads, env, actor } = deps;
  const { data: action, error } = await db.from('marketing_ai_actions').select('*').eq('id', actionId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!action) throw new TransitionError('Action not found', 404);
  if (action.status !== 'succeeded' || action.reverted_by_action_id) throw new TransitionError('Only a completed, not yet undone, action can be undone.');
  if (!action.revert_payload?.resource || !action.revert_payload?.operation) throw new TransitionError('This action has no undo recorded. Reverse it in Google Ads by hand.', 400);

  const mutationsAllowed = env.allowMutations || ads.mode === 'mock';
  const { resource, operation } = action.revert_payload as { resource: MutateResource; operation: Record<string, unknown> };
  const undoId = await insertAction(db, {
    recommendation_id: action.recommendation_id,
    operation: `${resource}:mutate (undo)`,
    request: { operations: [operation] },
    validate_only: !mutationsAllowed,
    status: 'pending',
    actor: actor.type === 'admin' ? actor.id : actor.type,
  });
  try {
    await ads.mutate(resource, [operation], { validateOnly: true });
    if (!mutationsAllowed) {
      await updateAction(db, undoId, { status: 'validated' });
      return { status: 'validated', actionId: undoId, message: 'The undo passed a dry run, but live changes are switched off here.' };
    }
    const res = await ads.mutate(resource, [operation], { validateOnly: false });
    await updateAction(db, undoId, { status: 'succeeded', response: res });
    await db.from('marketing_ai_actions').update({ status: 'reverted', reverted_by_action_id: undoId }).eq('id', actionId);
    await writeAudit(db, { actor, event: 'action.reverted', reason: `Undo of ${action.operation}`, recommendationId: action.recommendation_id, actionId: undoId, before: action.request, after: { operations: [operation] }, result: 'success' });
    return { status: 'executed', actionId: undoId, message: ads.mode === 'mock' ? 'Undone (mock account, nothing real changed).' : 'Undone. Google Ads confirmed the change.' };
  } catch (err) {
    const message = errMessage(err);
    await updateAction(db, undoId, { status: 'failed', error: message });
    await writeAudit(db, { actor, event: 'action.revert_failed', reason: message, recommendationId: action.recommendation_id, actionId: undoId, result: 'failed' });
    return { status: 'failed', actionId: undoId, message: `Google Ads refused the undo: ${message}` };
  }
}
