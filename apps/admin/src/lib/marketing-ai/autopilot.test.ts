// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMockAdsClient } from './ads/mock';
import { autoDecision, categoryEligibility, istDayStart, measureChange, measureExecuted, runAutopilot } from './autopilot';
import { readAdsEnv } from './config';
import { createFakeDb } from './test-utils/fake-db';
import { day, settings } from './test-utils/rows';

const autoOn = settings({ autonomy: { level: 2, categories: { add_negative: 'auto', pause_keyword: 'auto', budget_cut: 'auto', budget_raise: 'approve' } } });
const manual = settings({ autonomy: { level: 1 } });
const negRec = (over: Record<string, unknown> = {}) => ({ category: 'add_negative', status: 'pending_approval', confidence: 0.92, ai_intent: 'job_seeker', ...over }) as any;

describe('categoryEligibility', () => {
  it('needs 15 decisions by a person at 90% approval', () => {
    const decided = [
      ...Array.from({ length: 14 }, () => ({ category: 'add_negative', status: 'executed', decided_by: 'a1' })),
      { category: 'add_negative', status: 'rejected', decided_by: 'a1' },
      ...Array.from({ length: 30 }, () => ({ category: 'pause_keyword', status: 'executed', decided_by: 'autopilot' })),
    ] as any[];
    const e = Object.fromEntries(categoryEligibility(decided).map((x) => [x.category, x]));
    expect(e.add_negative).toMatchObject({ decided: 15, approved: 14, eligible: true });
    // Autopilot approving itself does not count.
    expect(e.pause_keyword).toMatchObject({ decided: 0, eligible: false });
  });
});

describe('autoDecision', () => {
  it('acts only inside every condition', () => {
    expect(autoDecision(negRec(), autoOn).ok).toBe(true);
    expect(autoDecision(negRec(), manual).reason).toBe('autonomy level 1');
    expect(autoDecision(negRec(), { ...autoOn, autonomy: { ...autoOn.autonomy, kill_switch: true } }).reason).toBe('kill switch is on');
    expect(autoDecision(negRec({ confidence: 0.7 }), autoOn).reason).toMatch(/confidence/);
    expect(autoDecision(negRec({ confidence: null }), autoOn).ok).toBe(false); // rules-only negatives are never automatic
    expect(autoDecision(negRec({ ai_intent: 'competitor' }), autoOn).reason).toMatch(/intent/);
    expect(autoDecision(negRec({ category: 'budget_raise' }), autoOn).reason).toBe('category needs approval');
    expect(autoDecision(negRec({ category: 'device_bid' }), autoOn).reason).toBe('advice only');
  });
});

describe('safe autopilot from day one', () => {
  it('ships with blocking, budget cuts and keyword pauses automatic, and everything else on approval', () => {
    const d = settings();
    expect(d.autonomy.level).toBe(2);
    expect(d.autonomy.categories).toEqual({ add_negative: 'auto', budget_cut: 'auto', pause_keyword: 'auto', bid_cut: 'auto', budget_raise: 'approve', bid_raise: 'approve', add_keyword: 'approve', new_ad: 'approve', pause_ad: 'approve' });
  });

  it('acts on a bid cut only when it really lowers the bid', () => {
    const change = (from: number, to: number) => ({ kind: 'keyword_bid', campaign_id: '1', ad_group_id: '2', criterion_id: '3', text: 'x', from_micros: from, to_micros: to, pct: 0 });
    const cut = { category: 'bid_cut', status: 'pending_approval', confidence: null, ai_intent: null } as any;
    expect(autoDecision({ ...cut, proposed_change: change(30e6, 24e6) }, settings()).ok).toBe(true);
    expect(autoDecision({ ...cut, proposed_change: change(30e6, 36e6) }, settings()).reason).toBe('not a bid cut');
    expect(autoDecision({ ...cut, category: 'bid_raise', proposed_change: change(30e6, 36e6) }, settings()).reason).toBe('category needs approval');
  });

  it("never acts alone on last season's conversions or on tidying rules", () => {
    const cut = { category: 'bid_cut', status: 'pending_approval', confidence: null, ai_intent: null, proposed_change: { kind: 'keyword_bid', campaign_id: '1', ad_group_id: '2', criterion_id: '3', text: 'x', from_micros: 30e6, to_micros: 24e6, pct: -20 } } as any;
    expect(autoDecision({ ...cut, evidence: { window: { from: '', to: '', days: 0 }, rows: [], proxy: true } }, settings()).reason).toMatch(/last season/);
    const dup = { category: 'pause_keyword', status: 'pending_approval', confidence: null, ai_intent: null, rule_id: 'R19' } as any;
    expect(autoDecision(dup, settings()).reason).toBe('this rule always needs a person');
    expect(autoDecision({ ...dup, rule_id: 'R3' }, settings()).ok).toBe(true);
  });

  it('acts on a budget cut only when it really lowers the budget', () => {
    const cut = { category: 'budget_cut', status: 'pending_approval', confidence: null, ai_intent: null } as any;
    expect(autoDecision({ ...cut, proposed_change: { kind: 'budget_change', campaign_id: '1', from_micros: 3600e6, to_micros: 212e6, pct: -94 } }, settings()).ok).toBe(true);
    expect(autoDecision({ ...cut, proposed_change: { kind: 'budget_change', campaign_id: '1', from_micros: 200e6, to_micros: 240e6, pct: 20 } }, settings()).reason).toBe('not a budget cut');
  });

  it('never runs new keywords or new ads automatically by default', () => {
    for (const category of ['add_keyword', 'new_ad', 'pause_ad', 'budget_raise']) {
      expect(autoDecision({ category, status: 'pending_approval', confidence: 1, ai_intent: 'high_intent' } as any, settings()).reason).toBe('category needs approval');
    }
  });
});

describe('runAutopilot', () => {
  const env = readAdsEnv({});
  it('executes eligible recommendations up to the daily cap', async () => {
    const recs = Array.from({ length: 4 }, (_, i) => ({
      id: `r${i}`,
      rule_id: 'R2',
      category: 'add_negative',
      entity_type: 'search_term',
      entity_id: `t${i}`,
      campaign_id: '111',
      title: `Block t${i}`,
      priority: 'medium',
      status: 'pending_approval',
      confidence: 0.95,
      ai_intent: 'other_exam',
      proposed_change: { kind: 'add_negative', campaign_id: '111', text: `term ${i}`, match_type: 'EXACT' },
    }));
    const db = createFakeDb({ marketing_ai_recommendations: recs });
    const capped = { ...autoOn, guardrails: { ...autoOn.guardrails, max_auto_actions_per_day: 2 } };
    const stats = await runAutopilot({ db, ads: createMockAdsClient('1'), env, settings: capped });
    expect(stats).toMatchObject({ executed: 2, cap_reached: true });
    expect(db.tables.marketing_ai_recommendations.filter((r) => r.status === 'executed').map((r) => r.decided_by)).toEqual(['autopilot', 'autopilot']);
    expect(db.tables.marketing_ai_actions.every((a) => a.actor === 'autopilot')).toBe(true);
  });

  it('does nothing below level 2 or with the kill switch on', async () => {
    const db = createFakeDb({ marketing_ai_recommendations: [] });
    expect((await runAutopilot({ db, ads: createMockAdsClient('1'), env, settings: manual })).reason).toBe('autonomy level 1');
    expect((await runAutopilot({ db, ads: createMockAdsClient('1'), env, settings: { ...autoOn, autonomy: { ...autoOn.autonomy, kill_switch: true } } })).reason).toBe('kill switch on');
  });
});

describe('measurement and auto-demote', () => {
  it('compares the week before and after a change', () => {
    const rows = [day('campaign', '2026-10-05', { cost: 1000, conversions: 2, campaign_id: '111' }), day('campaign', '2026-10-15', { cost: 1500, conversions: 2, campaign_id: '111' })];
    expect(measureChange(rows, '111', '2026-10-10')).toMatchObject({ before: { cpa: 500 }, after: { cpa: 750 }, cpa_change_pct: 50 });
  });

  it('switches a category back to approval when an automatic change made CPA worse', async () => {
    const db = createFakeDb({
      marketing_ai_recommendations: [{ id: 'x', status: 'executed', category: 'add_negative', campaign_id: '111', executed_at: '2026-10-10T03:00:00Z', decided_by: 'autopilot', title: 'Block jobs' }],
    });
    const rows = [day('campaign', '2026-10-05', { cost: 1000, conversions: 2, campaign_id: '111' }), day('campaign', '2026-10-15', { cost: 1500, conversions: 2, campaign_id: '111' })];
    const stats = await measureExecuted(db, autoOn, '1', async () => rows, new Date('2026-10-20T00:00:00Z'));
    expect(stats).toEqual({ measured: 1, demoted: ['add_negative'] });
    expect(db.tables.marketing_ai_settings.find((s) => s.key === 'autonomy')!.value.categories.add_negative).toBe('approve');
    expect(db.tables.marketing_ai_recommendations.find((r) => r.id === 'x')!.status).toBe('measured');
    expect(db.tables.marketing_ai_recommendations.some((r) => r.category === 'alert' && /Autopilot paused/.test(r.title))).toBe(true);
  });
});

it('istDayStart is midnight IST', () => {
  expect(istDayStart(new Date('2026-10-06T20:00:00Z'))).toBe('2026-10-06T18:30:00.000Z');
});
