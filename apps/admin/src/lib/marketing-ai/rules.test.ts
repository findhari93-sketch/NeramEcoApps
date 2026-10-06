// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMockAdsClient } from './ads/mock';
import { INGEST_LEVELS, SNAPSHOT_LEVELS, buildQuery, snapshotQuery, type SnapshotLevel } from './ads/gaql';
import { mergeDuplicates, normalizeRow } from './ads/normalize';
import { analystForEnv } from './ai/analyst';
import { shiftDate } from './metrics';
import {
  ruleBudgetLimitedWinner,
  ruleBudgetOverCap,
  ruleSeasonRamp,
  ruleSpendPacing,
  ruleCpaDrift,
  ruleDeliveryStop,
  ruleDeviceSkew,
  ruleKeywordWaste,
  ruleSearchTerms,
  ruleTrackingBreak,
  ruleNewAd,
  ruleAddKeyword,
  rulePauseAd,
  ruleSchedule,
  ruleLocation,
  judgeWindow,
  competitorIn,
  ruleDuplicateKeywords,
  ruleKeywordBid,
  ruleNotServing,
  ruleOutOfAreaKeyword,
  ruleStaleYear,
  ruleZeroImpressionGroup,
  runRules,
  safeNegative,
  searchTermCandidates,
  type IntentLabel,
  type RuleContext,
} from './rules';
import { day, settings, spread30 } from './test-utils/rows';
import type { EntityDay } from './types';

const END = '2026-10-30';
const ctx = (rows: EntityDay[], intents: Record<string, IntentLabel> = {}, s = settings()): RuleContext => ({ rows, endDate: END, settings: s, intents: new Map(Object.entries(intents)) });
const term = (text: string, totals: { clicks: number; cost: number; conversions?: number }, o: Partial<EntityDay> = {}) =>
  spread30('search_term', END, totals, { entity_key: `ag1~${text}`, ad_group_id: 'ag1', campaign_id: 'c1', text, status: 'NONE', ...o });

describe('safeNegative', () => {
  it('prefers the suggested phrase when it blocks nothing that converts or that we bid on', () => {
    expect(safeNegative('architecture jobs chennai', 'jobs', [], ['nata coaching'])).toEqual({ text: 'jobs', match_type: 'PHRASE' });
  });
  it('falls back to exact match when the phrase would block a converting search', () => {
    expect(safeNegative('free nata coaching', 'free', ['nata free mock test'], [])).toEqual({ text: 'free nata coaching', match_type: 'EXACT' });
  });
  it('refuses a phrase contained in a keyword we bid on', () => {
    expect(safeNegative('coaching jobs', 'coaching', [], ['nata coaching class'])).toEqual({ text: 'coaching jobs', match_type: 'EXACT' });
  });
  it('returns null when even the exact term converts or is our keyword', () => {
    expect(safeNegative('nata coaching class', null, [], ['nata coaching class'])).toBeNull();
  });
});

describe('R1 wasted search term', () => {
  it('fires at twice the target CPA with no conversions', () => {
    const [f] = ruleSearchTerms(ctx(term('nata classes near me', { clicks: 30, cost: 1400 })));
    expect(f).toMatchObject({ ruleId: 'R1', category: 'add_negative', priority: 'high', proposedChange: { kind: 'add_negative', match_type: 'EXACT', text: 'nata classes near me' } });
    expect(f.evidence.rows[0]).toMatchObject({ clicks: 30, conversions: 0 });
    expect(f.confidence).toBeNull(); // no AI label, so autopilot will never act on it
  });
  it('does not fire under the threshold, on thin data, or when the term converts', () => {
    expect(ruleSearchTerms(ctx(term('a', { clicks: 30, cost: 1200 })))).toHaveLength(0);
    expect(ruleSearchTerms(ctx(term('b', { clicks: 5, cost: 1500 })))).toHaveLength(0);
    expect(ruleSearchTerms(ctx(term('c', { clicks: 30, cost: 3000, conversions: 1 })))).toHaveLength(0);
  });
  it('skips terms that are already a keyword or already excluded', () => {
    expect(ruleSearchTerms(ctx(term('d', { clicks: 30, cost: 3000 }, { status: 'EXCLUDED' })))).toHaveLength(0);
    expect(ruleSearchTerms(ctx(term('e', { clicks: 30, cost: 3000 }, { status: 'ADDED' })))).toHaveLength(0);
  });
  it('turns relevant traffic into an insight, never a negative', () => {
    const [f] = ruleSearchTerms(ctx(term('nata coaching in chennai fees', { clicks: 28, cost: 1980 }), { 'ag1~nata coaching in chennai fees': { intent: 'high_intent', confidence: 0.9, reason: '' } }));
    expect(f).toMatchObject({ category: 'insight', proposedChange: { kind: 'none' } });
  });
});

describe('R2 off-scope intent', () => {
  it('blocks cheap off-scope terms when the AI is confident', () => {
    const [f] = ruleSearchTerms(ctx(term('neet coaching centre near me', { clicks: 6, cost: 310 }), { 'ag1~neet coaching centre near me': { intent: 'other_exam', confidence: 0.9, reason: '', suggested_negative: 'neet' } }));
    expect(f).toMatchObject({ ruleId: 'R2', category: 'add_negative', priority: 'medium', aiIntent: 'other_exam', confidence: 0.9, proposedChange: { text: 'neet', match_type: 'PHRASE' } });
  });
  it('ignores low-confidence labels', () => {
    expect(ruleSearchTerms(ctx(term('x', { clicks: 6, cost: 310 }), { 'ag1~x': { intent: 'other_exam', confidence: 0.4, reason: '' } }))).toHaveLength(0);
  });
});

describe('R3 keyword waste', () => {
  // A second enabled keyword in the group, so the one under test is never the last.
  const sibling = spread30('keyword', END, { clicks: 5, cost: 50 }, { entity_key: 'ag1~8', ad_group_id: 'ag1', criterion_id: '8', text: 'nata coaching' });
  const kw = (clicks: number, cost: number, conversions = 0) => [
    ...spread30('keyword', END, { clicks, cost, conversions }, { entity_key: 'ag1~9', ad_group_id: 'ag1', criterion_id: '9', text: 'dq labs' }),
    ...sibling,
  ];
  it('pauses an enabled keyword at three target CPAs with no conversions', () => {
    expect(ruleKeywordWaste(ctx(kw(45, 2180)))).toEqual([expect.objectContaining({ category: 'pause_keyword', proposedChange: { kind: 'pause_keyword', ad_group_id: 'ag1', criterion_id: '9', text: 'dq labs' } })]);
  });
  it('waits for 30 clicks and ignores keywords that converted', () => {
    expect(ruleKeywordWaste(ctx(kw(20, 3000)))).toHaveLength(0);
    expect(ruleKeywordWaste(ctx(kw(45, 3000, 1)))).toHaveLength(0);
  });
});

describe('R4 budget-limited winner', () => {
  const camp = (cost: number, conversions: number, primary = 'LIMITED|BUDGET_CONSTRAINED') =>
    spread30('campaign', END, { clicks: 800, cost, conversions }, { primary_status: primary, budget_micros: 1200 * 1e6 });
  // October is off-season (cap ₹7,000), so these tests give the room explicitly.
  const roomy = settings({ targets: { monthly_spend_cap_inr: 150000 } });
  it('raises the budget by the guardrail when CPA is within target', () => {
    const [f] = ruleBudgetLimitedWinner(ctx(camp(30000, 60), {}, roomy));
    expect(f.proposedChange).toMatchObject({ kind: 'budget_change', from_micros: 1200e6, to_micros: 1440e6, pct: 20 });
  });
  it('stays inside the monthly spend cap', () => {
    const [f] = ruleBudgetLimitedWinner(ctx(camp(30000, 60), {}, settings({ targets: { monthly_spend_cap_inr: 1300 * 30.4 } })));
    expect(f.proposedChange).toMatchObject({ to_micros: 1300e6 });
    expect(ruleBudgetLimitedWinner(ctx(camp(30000, 60), {}, settings({ targets: { monthly_spend_cap_inr: 1200 * 30.4 } })))).toHaveLength(0);
  });
  it('does nothing when CPA is above target or the campaign is not budget limited', () => {
    expect(ruleBudgetLimitedWinner(ctx(camp(60000, 60), {}, roomy))).toHaveLength(0);
    expect(ruleBudgetLimitedWinner(ctx(camp(30000, 60, 'ELIGIBLE'), {}, roomy))).toHaveLength(0);
  });
  it('never raises a budget off-season when the budgets already exceed the small cap', () => {
    expect(ruleBudgetLimitedWinner(ctx(camp(30000, 60)))).toHaveLength(0);
  });
});

describe('budget caps and seasons', () => {
  const budgets = (end: string, daily: Record<string, number>) =>
    Object.entries(daily).map(([id, inrPerDay]) => day('campaign', end, { entity_key: id, campaign_id: id, campaign_name: id, budget_micros: inrPerDay * 1e6, cost: 10, impressions: 10 }));

  it('R10 trims budgets in proportion so the month cannot pass the off-season cap', () => {
    const found = ruleBudgetOverCap(ctx(budgets(END, { tn: 3600, gulf: 300 })));
    const to = Object.fromEntries(found.map((f) => [f.campaignId, (f.proposedChange as any).to_micros / 1e6]));
    // ₹7,000 / 30.4 = ₹230 a day in total, split in proportion, with a ₹50 floor.
    expect(to).toEqual({ tn: 212, gulf: 50 });
    expect(found[0]).toMatchObject({ category: 'budget_cut', priority: 'high', risk: 'low' });
  });

  it('R10 stays quiet when the budgets already fit', () => {
    expect(ruleBudgetOverCap(ctx(budgets(END, { tn: 200 })))).toHaveLength(0);
  });

  it('uses the season cap from March to June', () => {
    expect(ruleBudgetOverCap(ctx(budgets(END, { tn: 1200 })))).toHaveLength(1); // October: over the ₹7,000 cap
    const april: RuleContext = { ...ctx(budgets('2026-04-15', { tn: 1200 })), endDate: '2026-04-15' };
    expect(ruleBudgetOverCap(april)).toHaveLength(0); // ₹1,200 a day fits the ₹40,000 season cap
  });

  it('R11 warns when the month is pacing over the cap, and escalates when it is used up', () => {
    const rows = Array.from({ length: 10 }, (_, i) => day('campaign', `2026-10-${String(i + 1).padStart(2, '0')}`, { cost: 350 }));
    const [f] = ruleSpendPacing({ ...ctx(rows), endDate: '2026-10-10' });
    expect(f).toMatchObject({ ruleId: 'R11', priority: 'high', dedupeKey: 'pacing:2026-10:ahead' });
    const [g] = ruleSpendPacing({ ...ctx([...rows, ...rows.map((r) => ({ ...r, entity_key: 'c2' }))]), endDate: '2026-10-10' });
    expect(g).toMatchObject({ priority: 'critical', dedupeKey: 'pacing:2026-10:over' });
    expect(ruleSpendPacing({ ...ctx(rows.slice(0, 3).map((r) => ({ ...r, cost_micros: 100e6 }))), endDate: '2026-10-10' })).toHaveLength(0);
  });

  it('R12 reminds to raise budgets when the season starts', () => {
    const april: RuleContext = { ...ctx(budgets('2026-03-02', { tn: 230 })), endDate: '2026-03-02' };
    expect(ruleSeasonRamp(april)[0]).toMatchObject({ ruleId: 'R12', category: 'insight' });
    expect(ruleSeasonRamp(ctx(budgets(END, { tn: 230 })))).toHaveLength(0); // off-season
  });
});

describe('R5 to R7 alerts', () => {
  it('R5 flags a 40% week-on-week CPA rise', () => {
    const rows = [day('campaign', END, { cost: 3000, conversions: 3 }), day('campaign', shiftDate(END, -8), { cost: 1500, conversions: 3 })];
    expect(ruleCpaDrift(ctx(rows))[0]).toMatchObject({ ruleId: 'R5', priority: 'high' });
  });

  it('R6 raises a critical alert when conversions stop but clicks continue', () => {
    const rows: EntityDay[] = [];
    for (let i = 0; i < 17; i++) rows.push(day('campaign', shiftDate(END, -i), { clicks: 30, cost: 1200, conversions: i < 3 ? 0 : 1 }));
    expect(ruleTrackingBreak(ctx(rows))[0]).toMatchObject({ ruleId: 'R6', priority: 'critical', category: 'alert' });
    rows[0].conversions = 1;
    expect(ruleTrackingBreak(ctx(rows))).toHaveLength(0);
  });

  it('R7 flags a campaign that spent last week and showed nothing yesterday', () => {
    const rows = [day('campaign', shiftDate(END, -2), { impressions: 500, cost: 1000 }), day('campaign', END, { impressions: 0, cost: 0 })];
    expect(ruleDeliveryStop(ctx(rows))[0]).toMatchObject({ ruleId: 'R7', priority: 'critical' });
    rows[1].impressions = 10;
    expect(ruleDeliveryStop(ctx(rows))).toHaveLength(0);
  });
});

describe('R8 and R9', () => {
  const ag = (id: string, impressions: number, clicks: number) => spread30('ad_group', END, { clicks, cost: 100, impressions }, { entity_key: id, ad_group_id: id, ad_group_name: id });
  const ad = (group: string, id: string, attrs: Record<string, unknown>) =>
    spread30('ad', END, { clicks: 10, cost: 50, impressions: 100 }, { entity_key: `${group}~${id}`, ad_group_id: group, criterion_id: id, status: 'ENABLED', attributes: { type: 'RESPONSIVE_SEARCH_AD', final_urls: ['https://neramclasses.com/en/nata-coaching'], ...attrs } });

  it('R8 proposes a new ad where CTR is under half the median, reusing the best ad URL', () => {
    const found = ruleNewAd(ctx([...ag('a', 3000, 270), ...ag('b', 3000, 240), ...ag('c', 3000, 60), ...ad('c', '1', {})]));
    expect(found.map((f) => f.entityId)).toEqual(['c']);
    expect(found[0]).toMatchObject({ category: 'new_ad', proposedChange: { kind: 'new_ad', ad_group_id: 'c', final_urls: ['https://neramclasses.com/en/nata-coaching'] } });
  });

  it('R8 also fires on a POOR ad strength, and never past 3 ads or without a URL to reuse', () => {
    expect(ruleNewAd(ctx([...ag('a', 3000, 270), ...ag('b', 3000, 260), ...ad('a', '1', { ad_strength: 'POOR' })]))).toHaveLength(1);
    const three = ['1', '2', '3'].flatMap((id) => ad('c', id, {}));
    expect(ruleNewAd(ctx([...ag('a', 3000, 270), ...ag('b', 3000, 240), ...ag('c', 3000, 60), ...three]))).toHaveLength(0);
    expect(ruleNewAd(ctx([...ag('a', 3000, 270), ...ag('b', 3000, 240), ...ag('c', 3000, 60), ...ad('c', '1', { final_urls: [] })]))).toHaveLength(0);
  });

  it('R9 flags a device costing twice the campaign CPA', () => {
    const rows = [
      ...spread30('campaign', END, { clicks: 800, cost: 30000, conversions: 50 }),
      ...spread30('device', END, { clicks: 40, cost: 1900, conversions: 0.5 }, { entity_key: 'c1~TABLET', text: 'TABLET' }),
      ...spread30('device', END, { clicks: 700, cost: 26000, conversions: 47 }, { entity_key: 'c1~MOBILE', text: 'MOBILE' }),
    ];
    expect(ruleDeviceSkew(ctx(rows)).map((f) => f.entityId)).toEqual(['c1~TABLET']);
  });
});

describe('the learning period', () => {
  it('stays silent until there are 21 days of trusted conversions', () => {
    const rows = spread30('keyword', END, { clicks: 45, cost: 2180 }, { entity_key: 'ag1~9', ad_group_id: 'ag1', criterion_id: '9', text: 'dq labs' });
    const other = spread30('keyword', END, { clicks: 10, cost: 100, conversions: 2 }, { entity_key: 'ag1~8', ad_group_id: 'ag1', criterion_id: '8', text: 'nata' });
    expect(judgeWindow(ctx(rows, {}, settings({ targets: { conversions_since: null } })))).toBeNull();
    expect(judgeWindow(ctx(rows, {}, settings({ targets: { conversions_since: '2026-10-20' } })))).toBeNull(); // 11 days
    expect(judgeWindow(ctx(rows, {}, settings({ targets: { conversions_since: '2026-10-05' } })))).toEqual({ from: '2026-10-05', to: END, days: 26, proxy: false });
    expect(ruleKeywordWaste(ctx([...rows, ...other], {}, settings({ targets: { conversions_since: null } })))).toHaveLength(0);
    expect(ruleKeywordWaste(ctx([...rows, ...other]))).toHaveLength(1);
  });

  it('never pauses the last enabled keyword of an ad group', () => {
    const only = spread30('keyword', END, { clicks: 45, cost: 2180 }, { entity_key: 'ag1~9', ad_group_id: 'ag1', criterion_id: '9', text: 'dq labs' });
    expect(ruleKeywordWaste(ctx(only))).toHaveLength(0);
  });
});

describe('R13 to R16', () => {
  it('R13 adds a converting search as an exact keyword, once', () => {
    const t = term('nata entrance exam 2027', { clicks: 60, cost: 1450, conversions: 10 }, { ad_group_id: 'ag1', entity_key: 'ag1~nata entrance exam 2027' });
    const [f] = ruleAddKeyword(ctx(t));
    expect(f).toMatchObject({ category: 'add_keyword', proposedChange: { kind: 'add_keyword', ad_group_id: 'ag1', text: 'nata entrance exam 2027', match_type: 'EXACT' } });
    const kw = spread30('keyword', END, { clicks: 1, cost: 1 }, { entity_key: 'ag1~5', ad_group_id: 'ag1', criterion_id: '5', text: 'nata entrance exam 2027' });
    expect(ruleAddKeyword(ctx([...t, ...kw]))).toHaveLength(0);
  });

  it('R13 skips expensive or off-scope converters', () => {
    expect(ruleAddKeyword(ctx(term('nata classes', { clicks: 30, cost: 2000, conversions: 1 })))).toHaveLength(0); // ₹2,000 per sign-up
    const t = term('neet classes', { clicks: 10, cost: 300, conversions: 1 });
    expect(ruleAddKeyword(ctx(t, { 'ag1~neet classes': { intent: 'other_exam', confidence: 0.9, reason: '' } }))).toHaveLength(0);
  });

  it('R14 pauses a weak ad only when another ad in the group converts', () => {
    const mk = (id: string, impressions: number, clicks: number, conversions: number) =>
      spread30('ad', END, { impressions, clicks, cost: clicks * 40, conversions }, { entity_key: `g~${id}`, ad_group_id: 'g', criterion_id: id, status: 'ENABLED', text: `Ad ${id}` });
    expect(rulePauseAd(ctx([...mk('1', 2000, 200, 10), ...mk('2', 1600, 40, 0)])).map((f) => f.entityId)).toEqual(['g~2']);
    expect(rulePauseAd(ctx([...mk('1', 2000, 200, 0), ...mk('2', 1600, 40, 0)]))).toHaveLength(0);
    expect(rulePauseAd(ctx([...mk('2', 1600, 40, 0)]))).toHaveLength(0);
  });

  it('R15 flags times of day that spend without sign-ups', () => {
    const rows: EntityDay[] = [];
    for (let i = 0; i < 30; i++) {
      const date = shiftDate(END, -i);
      rows.push(day('hour', date, { entity_key: `c1~MONDAY~2~${i}`, attributes: { day_of_week: 'MONDAY', hour: 2 }, cost: 60, clicks: 2 }));
      rows.push(day('hour', date, { entity_key: `c1~MONDAY~14~${i}`, attributes: { day_of_week: 'MONDAY', hour: 14 }, cost: 300, clicks: 8, conversions: 1 }));
    }
    const [f] = ruleSchedule(ctx(rows));
    expect(f).toMatchObject({ category: 'ad_schedule', proposedChange: { kind: 'ad_schedule', slots: [expect.objectContaining({ part: 'Night (12am to 6am)', conversions: 0 })] } });
  });

  it('R16 suggests excluding a city that spends with no sign-ups', () => {
    const geo = (name: string, cost: number, conversions: number) =>
      spread30('geo', END, { clicks: Math.round(cost / 40), cost, conversions }, { entity_key: `c1~${name}`, text: name, attributes: { city: name } });
    const found = ruleLocation(ctx([...geo('Chennai', 15000, 25), ...geo('Bengaluru', 2800, 0), ...geo('Salem', 900, 0)]));
    expect(found.map((f) => (f.proposedChange as any).city)).toEqual(['Bengaluru']);
  });
});

describe('the mock account end to end', () => {
  async function loadMock(scenario?: string) {
    const ads = createMockAdsClient('1', scenario);
    const rows: EntityDay[] = [];
    for (const level of INGEST_LEVELS) {
      const raw = await ads.search(buildQuery(level, shiftDate(END, -34), END));
      if ((SNAPSHOT_LEVELS as readonly string[]).includes(level)) raw.push(...(await ads.search(snapshotQuery(level as SnapshotLevel))).map((r: any) => ({ ...r, segments: { date: END } })));
      rows.push(...mergeDuplicates(raw.map((r) => normalizeRow(level, '1', r)).filter((r): r is EntityDay => r !== null)));
    }
    const c = ctx(rows);
    c.intents = await analystForEnv('mock').classifySearchTerms(searchTermCandidates(c));
    return runRules(c);
  }

  it('finds the problems the real account snapshot has', async () => {
    const findings = await loadMock();
    const by = (rule: string) => findings.filter((f) => f.ruleId === rule);
    expect(by('R18').map((f) => f.title)).toEqual(['Ad group "Brand - Neram Classes" has shown no ads in 14 days']);
    expect(by('R18')[0].reason).toMatch(/not approved yet .*under review.*default bid of ₹8/);
    expect(findings.find((f) => f.category === 'new_ad')?.proposedChange).toMatchObject({ headlines: expect.arrayContaining(['NATA 2027 Coaching - Enroll Nw']) });
    expect(findings.filter((f) => f.ruleId === 'R20' && f.category === 'add_keyword').map((f) => (f.proposedChange as any).text)).toEqual(['nata crash course 2027', 'nata exam date 2027']);
    expect(findings.find((f) => f.category === 'bid_cut')).toMatchObject({ title: expect.stringContaining('NATA coaching in chennai'), proposedChange: { from_micros: 30e6, to_micros: 24e6 } });
    expect(findings.find((f) => f.category === 'bid_raise')).toMatchObject({ title: expect.stringContaining('nata entrance exam'), proposedChange: { from_micros: 25e6, to_micros: 30e6 } });
    expect(by('R19').map((f) => f.title)).toEqual(['Pause the duplicate keyword "NATA coaching in Madurai"']);
    expect(by('R21').map((f) => f.title)).toEqual([expect.stringContaining('Bangalore')]);
    const negatives = findings.filter((f) => f.category === 'add_negative').map((f) => (f.proposedChange as any).text);
    expect(negatives).toEqual(expect.arrayContaining(['neet', 'jobs']));
    // Free NATA material is how app sign-ups happen: never blocked.
    expect(negatives.some((n) => /free|mock|nata/.test(n))).toBe(false);
    // ₹180 a day fits the ₹7,000 off-season cap, so nothing is cut, and the campaign is serving.
    expect(findings.some((f) => f.category === 'budget_cut' || f.ruleId === 'R0')).toBe(false);
  });

  it('raises "not showing ads" when the balance runs out, and stops judging the campaign', async () => {
    const findings = await loadMock('not_serving');
    expect(findings[0]).toMatchObject({ ruleId: 'R0', priority: 'critical', title: '"TN Local - NATA 2026" is not showing ads' });
    expect(findings[0].reason).toMatch(/not eligible.*Billing > Add funds/);
    expect(findings.some((f) => f.category === 'bid_cut' || f.ruleId === 'R18' || f.ruleId === 'R7')).toBe(false);
  });
});

// A Manual CPC campaign that served every day, with a state row on the last day.
const manualCampaign = (o: Partial<EntityDay> = {}) =>
  spread30('campaign', END, { clicks: 300, cost: 6000, conversions: 12, impressions: 4000 }, { status: 'ENABLED', budget_micros: 180e6, attributes: { bidding_strategy_type: 'MANUAL_CPC' }, ...o });
const keyword = (text: string, totals: { clicks: number; cost: number; conversions?: number }, attrs: Record<string, unknown>, o: Partial<EntityDay> = {}) =>
  spread30('keyword', END, totals, { entity_key: `ag1~${text}`, ad_group_id: 'ag1', criterion_id: '5', text, match_type: 'PHRASE', attributes: attrs, ...o });
const bid = (inr: number, firstPage: number | null = null, extra: Record<string, unknown> = {}) => ({ cpc_bid_micros: inr * 1e6, effective_cpc_bid_micros: inr * 1e6, first_page_cpc_micros: firstPage === null ? undefined : firstPage * 1e6, ...extra });

describe('R0 not showing ads', () => {
  // Served until 4 days before the end, then nothing; the snapshot says it is still enabled.
  const stopped = () => [
    ...manualCampaign().filter((r) => r.date <= shiftDate(END, -4)),
    day('campaign', END, { status: 'ENABLED', budget_micros: 180e6, primary_status: 'NOT_ELIGIBLE', attributes: { bidding_strategy_type: 'MANUAL_CPC' } }),
  ];
  it('fires once per enabled campaign with three empty days', () => {
    const [f] = ruleNotServing(ctx(stopped()));
    expect(f).toMatchObject({ ruleId: 'R0', priority: 'critical', dedupeKey: 'notserving:c1' });
    expect(f.reason).toMatch(/last impression on 2026-10-26/);
    expect(ruleNotServing(ctx(manualCampaign()))).toHaveLength(0);
  });
  it('needs a fresh state row, so old data never raises it', () => {
    expect(ruleNotServing(ctx(manualCampaign().filter((r) => r.date <= shiftDate(END, -10))))).toHaveLength(0);
  });
  it('keeps the other rules off a campaign that is not serving', () => {
    const waste = [...keyword('dq labs', { clicks: 45, cost: 2180 }, bid(30)), ...keyword('nata coaching', { clicks: 5, cost: 50 }, bid(30), { entity_key: 'ag1~8', criterion_id: '8' })];
    expect(ruleKeywordWaste(ctx([...manualCampaign(), ...waste]))).toHaveLength(1);
    expect(ruleKeywordWaste(ctx([...stopped(), ...waste]))).toHaveLength(0);
    expect(ruleDeliveryStop(ctx(stopped()))).toHaveLength(0); // R0 says it instead
  });
});

describe('R17 keyword bids', () => {
  const run = (rows: EntityDay[], s = settings()) => ruleKeywordBid(ctx([...manualCampaign(), ...rows], {}, s));
  it('raises a converting keyword up to the first-page bid', () => {
    const [f] = run(keyword('nata past papers', { clicks: 20, cost: 400, conversions: 4 }, bid(30, 33.2)));
    expect(f).toMatchObject({ category: 'bid_raise', proposedChange: { kind: 'keyword_bid', from_micros: 30e6, to_micros: 33.2e6 } });
    expect(f.evidence.facts).toMatchObject({ first_page_bid_inr: 33.2 });
  });
  it('raises at most the guardrail, never above the ceiling, and never chases an expensive first page', () => {
    expect(run(keyword('nata coaching near me', { clicks: 20, cost: 300, conversions: 4 }, bid(30, null, { serving_status: 'RARELY_SERVED' })))[0].proposedChange).toMatchObject({ to_micros: 36e6 });
    expect(run(keyword('nata coaching class', { clicks: 20, cost: 300, conversions: 4 }, bid(55, 70)), settings())).toHaveLength(0); // ₹70 first page is above the ₹60 ceiling
    expect(run(keyword('nata coaching class', { clicks: 20, cost: 300, conversions: 4 }, bid(55, 59)))[0].proposedChange).toMatchObject({ to_micros: 59e6 });
  });
  it('cuts a keyword that wastes money, never below ₹5, and never a protected one', () => {
    expect(run(keyword('nata coaching in chennai', { clicks: 20, cost: 1400 }, bid(30)))[0]).toMatchObject({ category: 'bid_cut', proposedChange: { from_micros: 30e6, to_micros: 24e6, pct: -20 } });
    expect(run(keyword('nata online', { clicks: 20, cost: 1400 }, bid(6)))[0].proposedChange).toMatchObject({ to_micros: 5e6 });
    expect(run(keyword('NATA coaching', { clicks: 20, cost: 1400 }, bid(30)))).toHaveLength(0);
  });
  it('does nothing when Google sets the bids (Smart Bidding)', () => {
    const rows = [...manualCampaign({ attributes: { bidding_strategy_type: 'MAXIMIZE_CONVERSIONS' } }), ...keyword('nata past papers', { clicks: 20, cost: 400, conversions: 4 }, bid(30, 33.2))];
    expect(ruleKeywordBid(ctx(rows))).toHaveLength(0);
  });
});

describe("last season's history (proxy)", () => {
  // Converting searches in April and May, before the OTP conversion existed.
  const lastSeasonTerm = spread30('search_term', '2026-05-30', { clicks: 30, cost: 600, conversions: 6 }, { entity_key: 'ag1~nata exam sample paper', ad_group_id: 'ag1', campaign_id: 'c1', text: 'nata exam sample paper', status: 'NONE' });
  it('lets suggestions that need approval use it, flagged', () => {
    const [f] = ruleAddKeyword(ctx(lastSeasonTerm, {}, settings({ targets: { conversions_since: null } })));
    expect(f).toMatchObject({ category: 'add_keyword', evidence: { proxy: true } });
    expect(f.reason).toMatch(/last season's Sign-up conversions/);
  });
  it('is off when no start date is set, and never feeds the rules that act alone', () => {
    expect(ruleAddKeyword(ctx(lastSeasonTerm, {}, settings({ targets: { conversions_since: null, proxy_history_since: null } })))).toHaveLength(0);
    const kw = keyword('dq labs', { clicks: 45, cost: 2180 }, bid(30), { date: '2026-05-01' } as any);
    expect(judgeWindow(ctx(kw, {}, settings({ targets: { conversions_since: null } })))).toBeNull();
  });
});

describe('R18 to R21 and the account profile', () => {
  it('R18 names why an ad group in a serving campaign shows nothing', () => {
    const rows = [
      ...manualCampaign(),
      day('ad_group', END, { entity_key: 'ag2', ad_group_id: 'ag2', ad_group_name: 'Brand', status: 'ENABLED', attributes: { cpc_bid_micros: 8e6 } }),
      day('keyword', END, { entity_key: 'ag2~1', ad_group_id: 'ag2', criterion_id: '1', text: 'neram classes', status: 'ENABLED', attributes: { first_page_cpc_micros: 12e6 } }),
      day('ad', END, { entity_key: 'ag2~7', ad_group_id: 'ag2', criterion_id: '7', status: 'ENABLED', attributes: { approval: 'UNDER_REVIEW' } }),
    ];
    const [f] = ruleZeroImpressionGroup(ctx(rows));
    expect(f).toMatchObject({ ruleId: 'R18', category: 'alert' });
    expect(f.reason).toMatch(/not approved yet \(under review\); its default bid of ₹8 is below what these searches cost \(first-page bids from ₹12\)/);
  });

  it('R19 pauses the copy of a case duplicate with the shorter record, and only that', () => {
    const rows = [
      ...keyword('nata coaching in madurai', { clicks: 20, cost: 900, conversions: 6 }, {}, { entity_key: 'ag1~1', criterion_id: '1', status: 'ENABLED' }),
      ...keyword('NATA coaching in Madurai', { clicks: 30, cost: 2800 }, {}, { entity_key: 'ag1~2', criterion_id: '2', status: 'ENABLED' }),
      ...keyword('nata coaching in madurai', { clicks: 3, cost: 90 }, {}, { entity_key: 'ag1~3', criterion_id: '3', status: 'ENABLED', match_type: 'EXACT' }),
    ];
    expect(ruleDuplicateKeywords(ctx(rows)).map((f) => f.proposedChange)).toEqual([{ kind: 'pause_keyword', ad_group_id: 'ag1', criterion_id: '2', text: 'NATA coaching in Madurai' }]);
  });

  it('R20 proposes the next cycle for 2026 keywords and ads', () => {
    const rows = [
      day('keyword', END, { entity_key: 'ag1~1', ad_group_id: 'ag1', criterion_id: '1', text: 'nata crash course 2026', match_type: 'PHRASE', status: 'ENABLED' }),
      day('keyword', END, { entity_key: 'ag1~2', ad_group_id: 'ag1', criterion_id: '2', text: 'nata exam date 2026', match_type: 'PHRASE', status: 'ENABLED' }),
      day('keyword', END, { entity_key: 'ag1~3', ad_group_id: 'ag1', criterion_id: '3', text: 'nata exam date 2027', match_type: 'PHRASE', status: 'ENABLED' }),
      day('ad', END, {
        entity_key: 'ag1~7', ad_group_id: 'ag1', ad_group_name: 'Main', criterion_id: '7', status: 'ENABLED', text: 'NATA 2026 Coaching',
        attributes: { headline_texts: ['NATA 2026 Coaching', 'Live Classes', 'Free Demo'], description_texts: ['Prepare for NATA 2026 with us.', 'Online and offline.'], final_urls: ['https://neramclasses.com/x'] },
      }),
    ];
    const found = ruleStaleYear(ctx(rows));
    expect(found.filter((f) => f.category === 'add_keyword').map((f) => (f.proposedChange as any).text)).toEqual(['nata crash course 2027']);
    expect(found.find((f) => f.category === 'new_ad')?.proposedChange).toMatchObject({ headlines: ['NATA 2027 Coaching', 'Live Classes', 'Free Demo'], descriptions: ['Prepare for NATA 2027 with us.', 'Online and offline.'] });
  });

  it('R21 flags a keyword naming a place outside the target area', () => {
    const rows = [
      day('keyword', END, { entity_key: 'ag1~1', ad_group_id: 'ag1', text: 'nata coaching in Bangalore', status: 'ENABLED' }),
      day('keyword', END, { entity_key: 'ag1~2', ad_group_id: 'ag1', text: 'nata coaching in chennai', status: 'ENABLED' }),
    ];
    expect(ruleOutOfAreaKeyword(ctx(rows)).map((f) => f.title)).toEqual(['Keyword "nata coaching in Bangalore" names Bangalore, outside Tamil Nadu']);
  });

  it('never blocks a search for free NATA material, or a protected keyword', () => {
    const t = term('free nata mock test', { clicks: 20, cost: 400 });
    expect(ruleSearchTerms(ctx(t, { 'ag1~free nata mock test': { intent: 'free_seeker', confidence: 0.95, reason: '', suggested_negative: 'free' } }))).toHaveLength(0);
    // A phrase negative "coaching" would block the protected "nata coaching", so only the exact search is blocked.
    const coaching = term('coaching', { clicks: 30, cost: 1400 });
    const label = { 'ag1~coaching': { intent: 'other_course' as const, confidence: 0.9, reason: '', suggested_negative: 'coaching' } };
    expect(ruleSearchTerms(ctx(coaching, label)).map((f) => f.proposedChange)).toEqual([{ kind: 'add_negative', campaign_id: 'c1', text: 'coaching', match_type: 'EXACT' }]);
    expect(competitorIn(ctx([]), 'I-Arch Coimbatore')).toMatch(/^i ?arch$/);
    expect(competitorIn(ctx([]), 'architecture coaching')).toBeNull();
  });
});
