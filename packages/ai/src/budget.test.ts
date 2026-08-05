import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The guard's six rules, each proved to refuse for its own reason. The reason
 * matters as much as the refusal: the panel shows what was blocked and why, and
 * an API route decides between a 409 with a prompt and a plain error from it.
 */

const getNexusSetting = vi.fn();
const getAiSpend = vi.fn();
const getAiSpendForFeature = vi.fn();
const countAiCallsForClient = vi.fn();

vi.mock('@neram/database', () => ({
  getNexusSetting: (...a: unknown[]) => getNexusSetting(...a),
  getAiSpend: (...a: unknown[]) => getAiSpend(...a),
  getAiSpendForFeature: (...a: unknown[]) => getAiSpendForFeature(...a),
  countAiCallsForClient: (...a: unknown[]) => countAiCallsForClient(...a),
  recordAiUsage: vi.fn(),
  utcDay: () => '2026-08-04',
  utcMonthStart: () => '2026-08-01',
}));

import { checkBudget, clearBudgetCache, noteSpend } from './budget';

const spend = (costUsd: number, calls = 0) => ({
  calls,
  blockedCalls: 0,
  promptTokens: 0,
  outputTokens: 0,
  costUsd,
});

beforeEach(() => {
  clearBudgetCache();
  getNexusSetting.mockReset().mockResolvedValue(null);
  getAiSpend.mockReset().mockResolvedValue(spend(0));
  getAiSpendForFeature.mockReset().mockResolvedValue(spend(0, 0));
  countAiCallsForClient.mockReset().mockResolvedValue(0);
});

describe('checkBudget', () => {
  it('allows a normal call', async () => {
    const verdict = await checkBudget('nexus.chapter-test');
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBe('auto');
  });

  it('rule 1: the master switch stops everything', async () => {
    getNexusSetting.mockResolvedValue({ value: { masterEnabled: false } });
    const verdict = await checkBudget('nexus.chapter-test');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('master_off');
  });

  it('rule 2: a feature set to off is refused', async () => {
    getNexusSetting.mockResolvedValue({ value: { modes: { 'nexus.chapter-test': 'off' } } });
    const verdict = await checkBudget('nexus.chapter-test');
    expect(verdict.reason).toBe('feature_off');
  });

  it('rule 2: a feature set to manual is refused with the manual reason', async () => {
    getNexusSetting.mockResolvedValue({ value: { modes: { 'nexus.chapter-test': 'manual' } } });
    const verdict = await checkBudget('nexus.chapter-test');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('manual');
  });

  it('checks the mode before the spend, so manual mode never costs a query', async () => {
    getNexusSetting.mockResolvedValue({ value: { modes: { 'nexus.chapter-test': 'manual' } } });
    await checkBudget('nexus.chapter-test');
    expect(getAiSpend).not.toHaveBeenCalled();
  });

  it('rule 3: the monthly cap wins over the daily one', async () => {
    getNexusSetting.mockResolvedValue({ value: { monthlyCapUsd: 25, dailyCapUsd: 2 } });
    // Under today's cap but over the month's.
    getAiSpend.mockImplementation(async (from: string) =>
      from === '2026-08-04' ? spend(0.5) : spend(30)
    );

    const verdict = await checkBudget('nexus.chapter-test');
    expect(verdict.reason).toBe('monthly_cap');
  });

  it('rule 4: the daily cap refuses once today is spent', async () => {
    getNexusSetting.mockResolvedValue({ value: { dailyCapUsd: 2, monthlyCapUsd: 100 } });
    getAiSpend.mockResolvedValue(spend(2.01));

    const verdict = await checkBudget('nexus.chapter-test');
    expect(verdict.reason).toBe('daily_cap');
    expect(verdict.message).toMatch(/midnight UTC/);
  });

  it('rule 5: a feature at its own call cap is refused while others carry on', async () => {
    // nexus.chapter-test caps at 40 runs a day.
    getAiSpendForFeature.mockResolvedValue(spend(0, 40));

    expect((await checkBudget('nexus.chapter-test')).reason).toBe('feature_cap');
    // A feature with no cap of its own is unaffected.
    expect((await checkBudget('nexus.class-summary')).allowed).toBe(true);
  });

  it('rule 6: one visitor cannot spend the whole public budget', async () => {
    // marketing.site-chat allows 30 calls an hour per visitor.
    countAiCallsForClient.mockResolvedValue(30);

    const blocked = await checkBudget('marketing.site-chat', 'visitor-a');
    expect(blocked.reason).toBe('client_cap');

    // A different visitor is unaffected, which is the whole point of doing this
    // per client rather than per feature.
    countAiCallsForClient.mockResolvedValue(0);
    expect((await checkBudget('marketing.site-chat', 'visitor-b')).allowed).toBe(true);
  });

  it('skips the per-visitor query when there is no visitor key', async () => {
    // Staff features have no per-client cap and an authenticated actor, so they
    // must not pay for a lookup that can never refuse them.
    await checkBudget('nexus.chapter-test');
    expect(countAiCallsForClient).not.toHaveBeenCalled();
  });

  it('refuses an id that is not in the registry', async () => {
    const verdict = await checkBudget('nexus.invented');
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toBe('unknown_feature');
  });

  it('fails OPEN when the database is unreachable', async () => {
    // Blocking every AI feature in the ecosystem because monitoring is down is
    // worse than a few unmetered calls, which Google's own cap still bounds.
    getAiSpend.mockRejectedValue(new Error('connection refused'));
    const verdict = await checkBudget('nexus.chapter-test');
    expect(verdict.allowed).toBe(true);
  });

  it('falls back to the default controls when the settings read fails', async () => {
    getNexusSetting.mockRejectedValue(new Error('nope'));
    const verdict = await checkBudget('nexus.chapter-test');
    expect(verdict.allowed).toBe(true);
    expect(verdict.controls.monthlyCapUsd).toBe(25);
  });
});

describe('the spend cache', () => {
  it('reuses one spend read across calls in the same window', async () => {
    await checkBudget('nexus.class-summary');
    await checkBudget('nexus.class-summary');
    // Two reads (today and month) on the first call, none on the second.
    expect(getAiSpend).toHaveBeenCalledTimes(2);
  });

  it('counts a finished call against the cache, so a burst cannot outrun it', async () => {
    getNexusSetting.mockResolvedValue({ value: { dailyCapUsd: 1, monthlyCapUsd: 100 } });
    getAiSpend.mockResolvedValue(spend(0.9));

    expect((await checkBudget('nexus.class-summary')).allowed).toBe(true);
    noteSpend(0.2); // now at 1.1, over the cap, without re-reading the database
    expect((await checkBudget('nexus.class-summary')).reason).toBe('daily_cap');
  });
});
