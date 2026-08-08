import { describe, it, expect } from 'vitest';
import { MODEL_PRICING, RETIRED_MODELS } from '@neram/ai';
import {
  TRANSCRIPT_SLICE_CHARS,
  estimateCost,
  estimateInputTokens,
  estimateOutputTokens,
  formatInr,
  formatSeconds,
  modelForMode,
  tierForMode,
  type CostEstimateInput,
} from './ai-question-cost';

const INR = 88;

function input(patch: Partial<CostEstimateInput> = {}): CostEstimateInput {
  return { mode: 'topic', count: 15, formats: ['MCQ'], usdToInr: INR, ...patch };
}

/**
 * The whole point of computing rather than hardcoding: pricing moves, models
 * get shut down, and a stale number quoted next to a Generate button is worse
 * than no number at all.
 */
describe('the model quoted is a model we can actually bill', () => {
  it.each(['topic', 'recording', 'pdf'] as const)('%s picks a priced model', (mode) => {
    const model = modelForMode(mode);
    expect(MODEL_PRICING[model]).toBeDefined();
    expect(RETIRED_MODELS[model]).toBeUndefined();
  });

  it('a PDF run uses the document tier, whose fallback handles attachments', () => {
    expect(tierForMode('pdf')).toBe('document');
    expect(tierForMode('topic')).toBe('standard');
    expect(tierForMode('recording')).toBe('standard');
  });
});

describe('input tokens', () => {
  it('a topic prompt is just overhead plus steering', () => {
    const bare = estimateInputTokens(input());
    const steered = estimateInputTokens(input({ steerChars: 400 }));
    expect(steered).toBe(bare + 100);
  });

  it('a transcript is counted at the slice length, not the raw length', () => {
    const long = estimateInputTokens(input({ mode: 'recording', transcriptChars: 500_000 }));
    const atSlice = estimateInputTokens(input({ mode: 'recording', transcriptChars: TRANSCRIPT_SLICE_CHARS }));
    expect(long).toBe(atSlice);
  });

  it('a short transcript is counted at its real length', () => {
    const short = estimateInputTokens(input({ mode: 'recording', transcriptChars: 4_000 }));
    const atSlice = estimateInputTokens(input({ mode: 'recording', transcriptChars: TRANSCRIPT_SLICE_CHARS }));
    expect(short).toBeLessThan(atSlice);
  });

  it('a PDF prefers a page count over a byte guess', () => {
    const byPages = estimateInputTokens(input({ mode: 'pdf', pageCount: 42, fileBytes: 9_000_000 }));
    const byBytes = estimateInputTokens(input({ mode: 'pdf', fileBytes: 9_000_000 }));
    expect(byPages).not.toBe(byBytes);
    expect(byPages).toBe(1_200 + 42 * 258);
  });
});

describe('output tokens', () => {
  it('scales with the question count', () => {
    expect(estimateOutputTokens(30, ['MCQ'])).toBe(2 * estimateOutputTokens(15, ['MCQ']));
  });

  it('an MCQ costs more to write than a numeric', () => {
    expect(estimateOutputTokens(10, ['MCQ'])).toBeGreaterThan(estimateOutputTokens(10, ['NUMERICAL']));
  });

  it('a mixed request lands between its formats, not at the cheaper one', () => {
    const mcq = estimateOutputTokens(10, ['MCQ']);
    const drawing = estimateOutputTokens(10, ['DRAWING_PROMPT']);
    const both = estimateOutputTokens(10, ['MCQ', 'DRAWING_PROMPT']);
    expect(both).toBeGreaterThan(drawing);
    expect(both).toBeLessThan(mcq);
  });

  it('an empty format list still estimates something rather than zero', () => {
    expect(estimateOutputTokens(10, [])).toBeGreaterThan(0);
  });

  it('zero questions cost nothing', () => {
    expect(estimateOutputTokens(0, ['MCQ'])).toBe(0);
  });
});

describe('estimateCost', () => {
  it('a 15-MCQ topic generation is comfortably under the wireframe rupee figure', () => {
    // The wireframe drew "₹2.40", which is nearer a 40-question PDF run. The
    // formula is what is pinned here; the screen renders whatever it returns.
    const est = estimateCost(input());
    expect(est.costInr).not.toBeNull();
    expect(est.costInr!).toBeGreaterThan(0);
    expect(est.costInr!).toBeLessThan(2);
  });

  it('reads the rupee rate from controls rather than a second constant', () => {
    const at88 = estimateCost(input({ usdToInr: 88 }));
    const at100 = estimateCost(input({ usdToInr: 100 }));
    expect(at100.costInr!).toBeGreaterThan(at88.costInr!);
    expect(at88.costUsd).toBe(at100.costUsd);
  });

  it('changing the formats moves the number', () => {
    const mcq = estimateCost(input({ formats: ['MCQ'] }));
    const numeric = estimateCost(input({ formats: ['NUMERICAL'] }));
    expect(numeric.costUsd!).toBeLessThan(mcq.costUsd!);
  });

  it('a 40-question PDF run costs more than a 15-question topic run', () => {
    const topic = estimateCost(input());
    const pdf = estimateCost(input({ mode: 'pdf', count: 40, pageCount: 42 }));
    expect(pdf.costInr!).toBeGreaterThan(topic.costInr!);
  });

  it('a PDF is slower to first draft than a topic prompt', () => {
    expect(estimateCost(input({ mode: 'pdf', pageCount: 10 })).seconds).toBeGreaterThan(
      estimateCost(input()).seconds,
    );
  });

  it('reports the token split it priced, so a usage row can be compared against it', () => {
    const est = estimateCost(input());
    expect(est.tokensIn).toBeGreaterThan(0);
    expect(est.tokensOut).toBeGreaterThan(0);
  });
});

describe('formatting never reads as free when it is not', () => {
  it('renders a real cost', () => {
    expect(formatInr(2.4)).toBe('₹2.40');
  });

  it('refuses to round a real cost down to zero', () => {
    expect(formatInr(0.004)).toBe('under ₹0.01');
  });

  it('says unpriced rather than zero for an unknown model', () => {
    expect(formatInr(null)).toBe('unpriced');
  });

  it('formats time in seconds then minutes', () => {
    expect(formatSeconds(25)).toBe('~25 s');
    expect(formatSeconds(180)).toBe('~3 min');
  });
});
