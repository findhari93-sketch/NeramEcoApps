// @vitest-environment node
/**
 * Mutation safety (spec §28). Nothing reaches Google Ads unless the
 * recommendation is approved, the change is inside the hard blocks, the live
 * entity still matches, and a dry run passes. Every path leaves an audit row.
 */
import { describe, expect, it, vi } from 'vitest';
import { checkHardBlocks, executeRecommendation, planMutation, revertAction } from './actions';
import { GoogleAdsApiError, type AdsClient } from './ads/client';
import { readAdsEnv } from './config';
import { createFakeDb } from './test-utils/fake-db';
import { settings } from './test-utils/rows';
import type { ProposedChange } from './types';

const PAUSE: ProposedChange = { kind: 'pause_keyword', ad_group_id: '1003', criterion_id: '9006', text: 'dq labs' };

function rec(over: Record<string, unknown> = {}) {
  return {
    id: 'rec-1',
    rule_id: 'R3',
    category: 'pause_keyword',
    entity_type: 'keyword',
    entity_id: '1003~9006',
    campaign_id: '111',
    title: 'Pause keyword "dq labs"',
    status: 'approved',
    proposed_change: PAUSE,
    run_id: null,
    ...over,
  };
}

function fakeAds(opts: { liveStatus?: string | null; failMutate?: boolean; failValidate?: boolean; keywordsInGroup?: number; adsInGroup?: number } = {}) {
  const mutate = vi.fn(async (_res: string, ops: unknown[], { validateOnly }: { validateOnly: boolean }) => {
    if (validateOnly && opts.failValidate) throw new GoogleAdsApiError('Resource not found', 400, ['mutateError.RESOURCE_NOT_FOUND']);
    if (!validateOnly && opts.failMutate) throw new GoogleAdsApiError('Internal error', 500, []);
    return { results: ops.map(() => ({ resourceName: 'customers/1/adGroupCriteria/1003~9006' })) };
  });
  const search = vi.fn(async (query: string) => {
    // The ad group's keywords (duplicate check, and never pausing the last one).
    if (/type = 'KEYWORD'/.test(query)) {
      return Array.from({ length: opts.keywordsInGroup ?? 2 }, (_, i) => ({ adGroup: { status: 'ENABLED' }, adGroupCriterion: { status: 'ENABLED', keyword: { text: i ? `kw ${i}` : 'dq labs', matchType: 'PHRASE' } } }));
    }
    // The ad group's enabled ads (3-ad limit, and never pausing the last one).
    if (/FROM ad_group_ad/.test(query)) {
      return Array.from({ length: opts.adsInGroup ?? 2 }, (_, i) => ({ adGroup: { status: 'ENABLED' }, adGroupAd: { status: 'ENABLED', ad: { id: String(7000 + i), type: 'RESPONSIVE_SEARCH_AD' } } }));
    }
    return opts.liveStatus === null ? [] : [{ adGroupCriterion: { resourceName: 'customers/1/adGroupCriteria/1003~9006', status: opts.liveStatus ?? 'ENABLED' } }];
  });
  const ads: AdsClient = { mode: 'live', customerId: '1', search, mutate: mutate as any, uploadClickConversions: vi.fn() as any };
  return { ads, mutate, search };
}

const env = (allow: boolean) => ({ ...readAdsEnv({ GOOGLE_ADS_MODE: 'live', GOOGLE_ADS_CUSTOMER_ID: '1' }), allowMutations: allow });
const ADMIN = { type: 'admin' as const, id: 'admin-1' };

function setup(recOver: Record<string, unknown> = {}, adsOpts: Parameters<typeof fakeAds>[0] = {}, allow = true) {
  const db = createFakeDb({ marketing_ai_recommendations: [rec(recOver)] });
  const { ads, mutate, search } = fakeAds(adsOpts);
  const deps = { db, ads, env: env(allow), settings: settings(), actor: ADMIN };
  return { db, ads, mutate, search, deps, events: () => db.tables.marketing_ai_audit_log?.map((a) => a.event) ?? [], status: () => db.tables.marketing_ai_recommendations[0].status };
}

describe('keyword bids and the account profile', () => {
  const bidChange = (from: number, to: number, text = 'nata past papers'): ProposedChange => ({ kind: 'keyword_bid', campaign_id: '111', ad_group_id: '1001', criterion_id: '9007', text, from_micros: from * 1e6, to_micros: to * 1e6, pct: Math.round(((to - from) / from) * 100) });
  it('allows a bid change inside the guardrail, the ceiling and the floor', () => {
    expect(checkHardBlocks(bidChange(30, 36), settings())).toBeNull();
    expect(checkHardBlocks(bidChange(30, 24), settings())).toBeNull();
    expect(checkHardBlocks(bidChange(30, 40), settings())).toMatch(/above the 20% limit/);
    expect(checkHardBlocks(bidChange(55, 62), settings())).toMatch(/above the ₹60 ceiling/);
    expect(checkHardBlocks(bidChange(6, 4.8), settings())).toMatch(/below ₹5/);
    expect(checkHardBlocks({ ...(bidChange(30, 24) as any), to_micros: 24_000_001 }, settings())).toMatch(/whole paise/);
  });
  it('never pauses, cuts or blocks a protected keyword', () => {
    expect(checkHardBlocks(bidChange(30, 24, 'NATA coaching'), settings())).toMatch(/protected/);
    expect(checkHardBlocks(bidChange(30, 36, 'NATA coaching'), settings())).toBeNull(); // a raise is fine
    expect(checkHardBlocks({ ...PAUSE, text: 'nata  coaching' }, settings())).toMatch(/protected/);
    expect(checkHardBlocks({ kind: 'add_negative', campaign_id: '111', text: 'coaching', match_type: 'PHRASE' }, settings())).toMatch(/protected keyword or Neram/);
    expect(checkHardBlocks({ kind: 'add_negative', campaign_id: '111', text: 'neram', match_type: 'PHRASE' }, settings())).toMatch(/Neram/);
  });
  it('refuses an ad that names a competitor or a past exam year', () => {
    const ad = (headline: string): ProposedChange => ({ kind: 'new_ad', campaign_id: '111', ad_group_id: '1001', headlines: [headline, 'Live NATA Classes', 'Free Demo Class'], descriptions: ['Learn from architects.', 'Online and offline.'], final_urls: ['https://neramclasses.com/nata-coaching/tamil-nadu'] });
    expect(checkHardBlocks(ad('NATA 2027 Batches Open'), settings(), '2026-10-06')).toBeNull();
    expect(checkHardBlocks(ad('Better Than I-Arch'), settings(), '2026-10-06')).toMatch(/names the competitor/);
    expect(checkHardBlocks(ad('NATA 2026 Coaching'), settings(), '2026-10-06')).toMatch(/current exam cycle is 2027/);
    expect(checkHardBlocks(ad('NATA 2026 Coaching'), settings(), '2026-03-01')).toBeNull(); // in March the 2026 exam is still ahead
  });
  it('plans a bid change against the live bid, with an undo to the old one', async () => {
    const ads = (bidMicros: string, strategy = 'MANUAL_CPC') =>
      ({ customerId: '1', search: async () => [{ adGroupCriterion: { resourceName: 'customers/1/adGroupCriteria/1001~9007', status: 'ENABLED', cpcBidMicros: bidMicros, effectiveCpcBidMicros: bidMicros }, campaign: { biddingStrategyType: strategy } }] }) as any;
    const plan: any = await planMutation(ads('30000000'), bidChange(30, 36));
    expect(plan.operation).toEqual({ update: { resourceName: 'customers/1/adGroupCriteria/1001~9007', cpcBidMicros: '36000000' }, updateMask: 'cpc_bid_micros' });
    expect(plan.revert.operation.update.cpcBidMicros).toBe('30000000');
    expect(await planMutation(ads('32000000'), bidChange(30, 36))).toEqual({ drift: expect.stringMatching(/bid changed/) });
    expect(await planMutation(ads('30000000', 'TARGET_SPEND'), bidChange(30, 36))).toEqual({ drift: expect.stringMatching(/no longer bids by hand/) });
  });
});

describe('checkHardBlocks', () => {
  it('allows the three supported changes inside the guardrails', () => {
    expect(checkHardBlocks(PAUSE, settings())).toBeNull();
    expect(checkHardBlocks({ kind: 'add_negative', campaign_id: '111', text: 'jobs', match_type: 'PHRASE' }, settings())).toBeNull();
    expect(checkHardBlocks({ kind: 'budget_change', campaign_id: '111', from_micros: 1000e6, to_micros: 1200e6, pct: 20 }, settings())).toBeNull();
  });
  it('refuses budget changes over the limit, even if settings allow more than the hard ceiling', () => {
    expect(checkHardBlocks({ kind: 'budget_change', campaign_id: '111', from_micros: 1000e6, to_micros: 1250e6, pct: 25 }, settings())).toMatch(/above the 20% limit/);
    expect(checkHardBlocks({ kind: 'budget_change', campaign_id: '111', from_micros: 1000e6, to_micros: 1500e6, pct: 50 }, settings({ guardrails: { max_budget_change_pct: 90 } }))).toMatch(/above the 30% limit/);
  });
  it('allows a large cut to hold the monthly cap, but not below the floor', () => {
    expect(checkHardBlocks({ kind: 'budget_change', campaign_id: '111', from_micros: 3600e6, to_micros: 212e6, pct: -94 }, settings())).toBeNull();
    expect(checkHardBlocks({ kind: 'budget_change', campaign_id: '111', from_micros: 300e6, to_micros: 20e6, pct: -93 }, settings())).toMatch(/below ₹50/);
  });
  it('refuses broad negatives, advice and malformed ids', () => {
    expect(checkHardBlocks({ kind: 'add_negative', campaign_id: '111', text: 'x', match_type: 'BROAD' as any }, settings())).toMatch(/exact or phrase/);
    expect(checkHardBlocks({ kind: 'device_bid', campaign_id: '1', device: 'TABLET', suggested_modifier_pct: -30 }, settings())).toMatch(/advice only/);
    expect(checkHardBlocks({ ...PAUSE, criterion_id: '9; DROP' }, settings())).toMatch(/Invalid/);
  });
});

describe('executeRecommendation', () => {
  it('refuses a recommendation that has not been approved, without calling Google', async () => {
    const s = setup({ status: 'pending_approval' });
    await expect(executeRecommendation(s.deps, 'rec-1')).rejects.toThrow(/Only approved/);
    expect(s.mutate).not.toHaveBeenCalled();
    expect(s.search).not.toHaveBeenCalled();
  });

  it('refuses advice-only categories', async () => {
    const s = setup({ category: 'device_bid', proposed_change: { kind: 'device_bid', campaign_id: '1', device: 'TABLET', suggested_modifier_pct: -30 } });
    await expect(executeRecommendation(s.deps, 'rec-1')).rejects.toThrow(/advice only/);
    expect(s.mutate).not.toHaveBeenCalled();
  });

  it('dry-runs, then mutates, then records the response, the undo and the audit trail', async () => {
    const s = setup();
    const out = await executeRecommendation(s.deps, 'rec-1');
    expect(out.status).toBe('executed');
    expect(s.mutate.mock.calls.map((c) => c[2].validateOnly)).toEqual([true, false]);
    expect(s.mutate.mock.calls[1][1]).toEqual([{ update: { resourceName: 'customers/1/adGroupCriteria/1003~9006', status: 'PAUSED' }, updateMask: 'status' }]);
    expect(s.status()).toBe('executed');
    const action = s.db.tables.marketing_ai_actions[0];
    expect(action).toMatchObject({ status: 'succeeded', actor: 'admin-1', revert_payload: { resource: 'adGroupCriteria', operation: { update: { status: 'ENABLED' } } } });
    expect(s.events()).toEqual(expect.arrayContaining(['recommendation.executing', 'recommendation.executed', 'action.executed']));
  });

  it('stops at a dry run when live changes are switched off, and reports it honestly', async () => {
    const s = setup({}, {}, false);
    const out = await executeRecommendation(s.deps, 'rec-1');
    expect(out.status).toBe('validated');
    expect(s.mutate).toHaveBeenCalledTimes(1);
    expect(s.mutate.mock.calls[0][2]).toEqual({ validateOnly: true });
    expect(s.status()).toBe('approved');
    expect(s.events()).toContain('action.validated_only');
  });

  it('refuses when the live keyword no longer exists (drift)', async () => {
    const s = setup({}, { liveStatus: null });
    const out = await executeRecommendation(s.deps, 'rec-1');
    expect(out).toMatchObject({ status: 'failed', message: expect.stringMatching(/no longer exists/) });
    expect(s.mutate).not.toHaveBeenCalled();
    expect(s.events()).toContain('action.drift');
  });

  it('records a no-op when someone already paused it by hand', async () => {
    const s = setup({}, { liveStatus: 'PAUSED' });
    const out = await executeRecommendation(s.deps, 'rec-1');
    expect(out.status).toBe('noop');
    expect(s.mutate).not.toHaveBeenCalled();
    expect(s.status()).toBe('executed');
  });

  it('never reports success when Google rejects the dry run', async () => {
    const s = setup({}, { failValidate: true });
    const out = await executeRecommendation(s.deps, 'rec-1');
    expect(out.status).toBe('failed');
    expect(s.mutate).toHaveBeenCalledTimes(1);
    expect(s.status()).toBe('approved');
    expect(s.db.tables.marketing_ai_actions[0].status).toBe('failed');
  });

  it('marks the recommendation failed when the real mutate fails', async () => {
    const s = setup({}, { failMutate: true });
    const out = await executeRecommendation(s.deps, 'rec-1');
    expect(out.status).toBe('failed');
    expect(s.status()).toBe('failed');
    expect(s.events()).toContain('action.failed');
    expect(s.events()).not.toContain('action.executed');
  });
});

describe('new operations', () => {
  const NEW_AD: ProposedChange = {
    kind: 'new_ad',
    campaign_id: '111',
    ad_group_id: '1003',
    headlines: ['NATA Coaching Online', 'Live NATA Classes', 'Book a Demo Class'],
    descriptions: ['Live NATA and JEE Paper 2 classes.', 'Daily drawing practice.'],
    final_urls: ['https://neramclasses.com/en/nata-coaching'],
  };

  it('refuses the last enabled keyword of a group', async () => {
    const s = setup({}, { keywordsInGroup: 1 });
    const out = await executeRecommendation(s.deps, 'rec-1');
    expect(out).toMatchObject({ status: 'failed', message: expect.stringMatching(/last enabled keyword/) });
    expect(s.mutate).not.toHaveBeenCalled();
  });

  it('adds a keyword, with an undo that removes it', async () => {
    const s = setup({ category: 'add_keyword', proposed_change: { kind: 'add_keyword', campaign_id: '111', ad_group_id: '1001', text: 'nata entrance exam 2027', match_type: 'EXACT' } });
    expect((await executeRecommendation(s.deps, 'rec-1')).status).toBe('executed');
    expect(s.mutate.mock.calls[1][1]).toEqual([{ create: { adGroup: 'customers/1/adGroups/1001', status: 'ENABLED', keyword: { text: 'nata entrance exam 2027', matchType: 'EXACT' } } }]);
    expect(s.db.tables.marketing_ai_actions[0].revert_payload).toEqual({ resource: 'adGroupCriteria', operation: { remove: 'customers/1/adGroupCriteria/1003~9006' } });
  });

  it('creates a new ad, and undo pauses it rather than deleting it', async () => {
    const s = setup({ category: 'new_ad', proposed_change: NEW_AD });
    expect((await executeRecommendation(s.deps, 'rec-1')).status).toBe('executed');
    const op: any = s.mutate.mock.calls[1][1][0];
    expect(op.create.ad.responsiveSearchAd.headlines).toEqual(NEW_AD.headlines.map((text) => ({ text })));
    expect(s.db.tables.marketing_ai_actions[0].revert_payload.operation).toMatchObject({ update: { status: 'PAUSED' }, updateMask: 'status' });
  });

  it('refuses a fourth responsive search ad, and any ad pointing off neramclasses.com', async () => {
    const full = setup({ category: 'new_ad', proposed_change: NEW_AD }, { adsInGroup: 3 });
    expect((await executeRecommendation(full.deps, 'rec-1')).message).toMatch(/3 enabled responsive search ads/);
    expect(checkHardBlocks({ ...NEW_AD, final_urls: ['https://example.com'] } as ProposedChange, settings())).toMatch(/neramclasses\.com/);
    expect(checkHardBlocks({ ...NEW_AD, final_urls: ['http://neramclasses.com'] } as ProposedChange, settings())).toMatch(/neramclasses\.com/);
    expect(checkHardBlocks({ ...NEW_AD, headlines: ['x'.repeat(31), 'a', 'b'] } as ProposedChange, settings())).toMatch(/30 characters/);
  });

  it('never pauses the only enabled ad, and pauses one of two', async () => {
    const pause: ProposedChange = { kind: 'pause_ad', campaign_id: '111', ad_group_id: '1002', ad_id: '7000', label: 'Weak ad' };
    const lone = setup({ category: 'pause_ad', proposed_change: pause }, { adsInGroup: 1 });
    expect((await executeRecommendation(lone.deps, 'rec-1')).message).toMatch(/only enabled ad/);
    const two = setup({ category: 'pause_ad', proposed_change: pause });
    expect((await executeRecommendation(two.deps, 'rec-1')).status).toBe('executed');
    expect(two.mutate.mock.calls[1][1]).toEqual([{ update: { resourceName: 'customers/1/adGroupAds/1002~7000', status: 'PAUSED' }, updateMask: 'status' }]);
  });
});

describe('revertAction', () => {
  it('applies the stored undo and links the two actions', async () => {
    const s = setup();
    await executeRecommendation(s.deps, 'rec-1');
    const first = s.db.tables.marketing_ai_actions[0];
    const out = await revertAction(s.deps, first.id);
    expect(out.status).toBe('executed');
    expect(s.mutate.mock.calls.at(-1)![1]).toEqual([{ update: { resourceName: 'customers/1/adGroupCriteria/1003~9006', status: 'ENABLED' }, updateMask: 'status' }]);
    expect(first.status).toBe('reverted');
    expect(first.reverted_by_action_id).toBeTruthy();
    await expect(revertAction(s.deps, first.id)).rejects.toThrow(/not yet undone/);
  });
});
