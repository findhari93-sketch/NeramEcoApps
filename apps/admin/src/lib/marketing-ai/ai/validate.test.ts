// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createAnalyst } from './analyst';
import { adTextProblem, allowedNumbers, noDashes, numbersAreGrounded, validateAdCopy, validateAssessments, validateIntents, validateWeekly } from './validate';

const evidence = { window: { from: '2026-10-01', to: '2026-10-30', days: 30 }, rows: [{ key: 'k', label: 'free nata coaching', impressions: 160, clicks: 17, cost: 1240.4, conversions: 0, ctr: 10.63, cpc: 72.96, cpa: null }], facts: { target_cpa_inr: 650 } };

describe('validateIntents', () => {
  const sent = new Map([['k1', 'architecture jobs in chennai']]);
  it('keeps known ids with a valid intent and a suggestion inside the term', () => {
    const out = validateIntents({ terms: [{ id: 'k1', intent: 'job_seeker', confidence: 1.4, reason: 'wants a job', suggested_negative: 'JOBS' }] }, sent);
    expect(out.get('k1')).toEqual({ intent: 'job_seeker', confidence: 1, reason: 'wants a job', suggested_negative: 'jobs' });
  });
  it('drops unknown ids and invented intents, and suggestions that are not in the term', () => {
    const out = validateIntents(
      { terms: [{ id: 'nope', intent: 'job_seeker', confidence: 1 }, { id: 'k1', intent: 'spam', confidence: 1 }] },
      sent,
    );
    expect(out.size).toBe(0);
    expect(validateIntents({ terms: [{ id: 'k1', intent: 'job_seeker', confidence: 0.9, reason: '', suggested_negative: 'salary' }] }, sent).get('k1')?.suggested_negative).toBeNull();
  });
  it('never suggests a negative for a relevant intent', () => {
    expect(validateIntents({ terms: [{ id: 'k1', intent: 'high_intent', confidence: 0.9, reason: '', suggested_negative: 'jobs' }] }, sent).get('k1')?.suggested_negative).toBeNull();
  });
});

describe('the number guard', () => {
  const allowed = allowedNumbers(evidence);
  it('accepts numbers from the evidence in the forms people write them', () => {
    expect(numbersAreGrounded('₹1,240 on 17 clicks over 30 days, against a ₹650 target', allowed)).toBe(true);
  });
  it('rejects a number the model made up', () => {
    expect(numbersAreGrounded('This term cost ₹4,800 last month', allowed)).toBe(false);
  });
  it('drops an assessment that quotes an invented figure, keeps a grounded one', () => {
    const out = validateAssessments(
      { findings: [{ id: 'a', assessment: 'Spent 1,240 with 17 clicks and no conversions.' }, { id: 'b', assessment: 'Likely 45% of traffic is students.' }, { id: 'zz', assessment: 'x' }] },
      new Map([['a', evidence], ['b', evidence]]),
    );
    expect([...out.keys()]).toEqual(['a']);
  });
});

describe('adTextProblem', () => {
  const rules = { competitors: ['i arch', 'iarch', 'dq labs', 'brds'], cycleYear: 2027 };
  it('catches competitor names in any spelling, and past exam years', () => {
    expect(adTextProblem('Better than iArch', rules)).toMatch(/competitor/);
    expect(adTextProblem('Why students leave DQ-Labs', rules)).toMatch(/dq labs/);
    expect(adTextProblem('NATA 2026 Batches', rules)).toMatch(/2026/);
  });
  it('leaves ordinary copy alone', () => {
    expect(adTextProblem('Architecture Entrance Prep', rules)).toBeNull();
    expect(adTextProblem('NATA 2027 Batches Open', rules)).toBeNull();
    // Claims about past results keep their year.
    expect(adTextProblem('Coaching since 2009', rules)).toBeNull();
    expect(adTextProblem('AIR 1 in JEE B.Arch 2024', rules)).toBeNull();
  });
  it('drops offending lines from AI copy', () => {
    const out = validateAdCopy({ headlines: ['NATA 2027 Classes', 'Better than iArch', 'NATA 2026 Prep', 'Free Demo Class', 'Live Online Classes'], descriptions: ['Learn from architects.', 'Online and offline classes.'] }, rules);
    expect(out?.headlines).toEqual(['NATA 2027 Classes', 'Free Demo Class', 'Live Online Classes']);
  });
});

describe('validateAdCopy', () => {
  it("trims to Google's limits and removes duplicates and em dashes", () => {
    const out = validateAdCopy({
      headlines: ['NATA Coaching Online', 'nata coaching online', 'This headline is far too long for Google Ads', 'Live Classes — Daily', 'Mock Tests'],
      descriptions: ['Live NATA classes.', 'Daily drawing practice.'],
    });
    expect(out).toEqual({ headlines: ['NATA Coaching Online', 'Live Classes, Daily', 'Mock Tests'], descriptions: ['Live NATA classes.', 'Daily drawing practice.'] });
  });
  it('returns null when there is not enough for a responsive search ad', () => {
    expect(validateAdCopy({ headlines: ['A', 'B'], descriptions: ['x', 'y'] })).toBeNull();
  });
  it('noDashes', () => {
    expect(noDashes('a — b – c -- d')).toBe('a, b, c, d');
  });
});

describe('validateWeekly', () => {
  const facts = { spend_inr: 1640, otp_signups_from_google_ads: 9, cost_per_google_signup_inr: 182 };
  it('keeps a report whose numbers are all facts, at most 3 steps, without em dashes', () => {
    const out = validateWeekly({ summary: 'Spend was ₹1,640 for 9 sign-ups — ₹182 each.', next_steps: ['a', 'b', 'c', 'd'] }, facts);
    expect(out).toEqual({ summary: 'Spend was ₹1,640 for 9 sign-ups, ₹182 each.', next_steps: ['a', 'b', 'c'] });
  });
  it('drops a report that invents a figure', () => {
    expect(validateWeekly({ summary: 'Sign-ups rose 64% to 47.', next_steps: [] }, facts)).toBeNull();
  });
});

describe('createAnalyst', () => {
  it('turns a budget block into an empty result instead of an error', async () => {
    const { AiBlockedError } = await import('@neram/ai');
    const analyst = createAnalyst(async () => {
      throw new AiBlockedError({ message: 'over budget', reason: 'daily_cap' as any, feature: 'admin.ads-analyst', supportsManual: false, manualPrompt: null });
    });
    expect((await analyst.classifySearchTerms([{ key: 'k', text: 't' } as any])).size).toBe(0);
    expect(analyst.usage().blocked).toBe('daily_cap');
  });

  it('records usage and survives a bad model reply', async () => {
    const analyst = createAnalyst(async () => ({ text: 'not json', model: 'm', tokensIn: 10, tokensOut: 5, costUsd: 0.001 }));
    expect((await analyst.explainFindings([{ dedupeKey: 'a', category: 'alert', priority: 'high', evidence } as any])).size).toBe(0);
    expect(analyst.usage()).toMatchObject({ calls: 1, tokensIn: 10, tokensOut: 5, model: 'm' });
  });
});
