import { describe, it, expect } from 'vitest';
import { costOf, formatUsd, MODEL_PRICING, RETIRED_MODELS, TIER_MODELS } from './pricing';

/**
 * These assertions are about money, so they are written as arithmetic a human
 * can check by hand rather than as snapshots.
 */

describe('costOf', () => {
  it('prices a call from the published per-million rates', () => {
    // gemini-2.5-flash is $0.30/1M in, $2.50/1M out.
    // 1,000,000 in + 100,000 out = 0.30 + 0.25 = 0.55
    expect(
      costOf('gemini-2.5-flash', {
        promptTokens: 1_000_000,
        outputTokens: 100_000,
        totalTokens: 1_100_000,
      })
    ).toBe(0.55);
  });

  it('keeps six decimals, because a cheap call rounds to zero at two', () => {
    // 1,000 in + 200 out on flash-lite = 0.0001 + 0.00008 = 0.00018
    const cost = costOf('gemini-2.5-flash-lite', {
      promptTokens: 1_000,
      outputTokens: 200,
      totalTokens: 1_200,
    });
    expect(cost).toBe(0.00018);
  });

  it('returns null for an unknown model rather than 0', () => {
    // A zero here would understate the month and the cap would never trip.
    expect(
      costOf('gemini-9-turbo', { promptTokens: 1000, outputTokens: 1000, totalTokens: 2000 })
    ).toBeNull();
  });

  it('switches 2.5-pro to the long-context band past 200k input tokens', () => {
    const short = costOf('gemini-2.5-pro', {
      promptTokens: 100_000,
      outputTokens: 0,
      totalTokens: 100_000,
    });
    const long = costOf('gemini-2.5-pro', {
      promptTokens: 300_000,
      outputTokens: 0,
      totalTokens: 300_000,
    });

    expect(short).toBeCloseTo(0.125, 6); // 0.1M * $1.25
    expect(long).toBeCloseTo(0.75, 6); // 0.3M * $2.50
  });

  it('counts thinking tokens at the output rate via outputTokens', () => {
    // The client folds thoughtsTokenCount into outputTokens before calling
    // here, so this only proves the rate applied is the output one.
    const cost = costOf('gemini-2.5-flash', {
      promptTokens: 0,
      outputTokens: 1_000_000,
      totalTokens: 1_000_000,
    });
    expect(cost).toBe(2.5);
  });
});

describe('the model tables', () => {
  it('never offers a model Google has shut down', () => {
    // The bug this whole package exists to stop: five call sites were pinned to
    // gemini-2.0-flash and gemini-1.5-flash months after they were switched off.
    for (const [tier, models] of Object.entries(TIER_MODELS)) {
      for (const model of models) {
        expect(RETIRED_MODELS[model], `${tier} offers retired model ${model}`).toBeUndefined();
      }
    }
  });

  it('has a price for every model it offers, or the cost silently goes null', () => {
    for (const [tier, models] of Object.entries(TIER_MODELS)) {
      for (const model of models) {
        expect(MODEL_PRICING[model], `${tier} offers unpriced model ${model}`).toBeDefined();
      }
    }
  });

  it('starts each tier with its cheapest intended model', () => {
    expect(TIER_MODELS.cheap[0]).toBe('gemini-2.5-flash-lite');
    expect(TIER_MODELS.standard[0]).toBe('gemini-2.5-flash');
  });

  it('keeps cheap genuinely cheaper than standard', () => {
    const cheap = MODEL_PRICING[TIER_MODELS.cheap[0]];
    const standard = MODEL_PRICING[TIER_MODELS.standard[0]];
    expect(cheap.outputPerM).toBeLessThan(standard.outputPerM);
  });
});

describe('formatUsd', () => {
  it('says unpriced rather than $0.00 when the cost is unknown', () => {
    expect(formatUsd(null)).toBe('unpriced');
  });

  it('shows four decimals for sub-cent spends, which most calls are', () => {
    expect(formatUsd(0.00018)).toBe('$0.0002');
  });

  it('shows two decimals once there is something to see', () => {
    expect(formatUsd(12.3456)).toBe('$12.35');
  });
});
