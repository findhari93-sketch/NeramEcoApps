import { describe, it, expect } from 'vitest';

import { estimateEvaluationCost, estimateMonthlyCost } from './cost';

/** The shape the feature is actually configured for: five anchors, five criteria. */
const CONFIGURED = { anchorCount: 5, criterionCount: 5, usdToInr: 88 };

describe('estimateEvaluationCost', () => {
  it('counts the student sheet alongside the anchors', () => {
    const five = estimateEvaluationCost(CONFIGURED);
    const four = estimateEvaluationCost({ ...CONFIGURED, anchorCount: 4 });
    // Six images against five: exactly one image of difference.
    expect(five.tokensIn - four.tokensIn).toBe(258);
  });

  it('scales output with the number of criteria', () => {
    const five = estimateEvaluationCost(CONFIGURED);
    const three = estimateEvaluationCost({ ...CONFIGURED, criterionCount: 3 });
    expect(five.tokensOut).toBeGreaterThan(three.tokensOut);
  });

  it('converts to rupees using the stored rate rather than a second hardcoded one', () => {
    const estimate = estimateEvaluationCost(CONFIGURED);
    expect(estimate.costInr).toBeCloseTo((estimate.costUsd ?? 0) * 88, 8);

    const doubled = estimateEvaluationCost({ ...CONFIGURED, usdToInr: 176 });
    expect(doubled.costInr).toBeCloseTo((estimate.costInr ?? 0) * 2, 8);
  });

  it('names a model from the tier cascade rather than a literal', () => {
    expect(estimateEvaluationCost(CONFIGURED).model).toBeTruthy();
  });

  it('survives a brief type with nothing configured yet', () => {
    const empty = estimateEvaluationCost({ anchorCount: 0, criterionCount: 0, usdToInr: 88 });
    expect(empty.tokensIn).toBeGreaterThan(0);
    expect(empty.tokensOut).toBeGreaterThan(0);
    expect(empty.seconds).toBeGreaterThanOrEqual(4);
  });
});

/**
 * The brief sets a hard design constraint: if the running cost at the expected
 * volume comes out above US$15 a month, the design is wrong and should be
 * flagged rather than built. This asserts that, so a future change to the
 * prompt shape, the tier or the anchor count cannot quietly cross it.
 */
describe('the brief cost ceiling', () => {
  const EXPECTED_EVALUATIONS_PER_MONTH = 250;
  const BRIEF_CEILING_USD = 15;

  it('stays well inside the ceiling at the expected volume', () => {
    const perCall = estimateEvaluationCost(CONFIGURED).costUsd;
    expect(perCall).not.toBeNull();

    const monthly = estimateMonthlyCost(perCall, EXPECTED_EVALUATIONS_PER_MONTH);
    expect(monthly).not.toBeNull();
    expect(monthly!).toBeLessThan(BRIEF_CEILING_USD);
  });

  it('also stays inside the shared monthly cap the budget guard enforces', () => {
    const perCall = estimateEvaluationCost(CONFIGURED).costUsd;
    const monthly = estimateMonthlyCost(perCall, EXPECTED_EVALUATIONS_PER_MONTH)!;
    // DEFAULT_AI_CONTROLS.monthlyCapUsd, shared with every other AI feature,
    // so drawing evaluation must leave room for the rest of them.
    expect(monthly).toBeLessThan(25 / 2);
  });

  it('returns null rather than a wrong number when the model has no price', () => {
    expect(estimateMonthlyCost(null, 250)).toBeNull();
  });
});
