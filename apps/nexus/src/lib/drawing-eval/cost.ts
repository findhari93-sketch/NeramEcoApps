/**
 * What one drawing evaluation will cost, before it is spent.
 *
 * PURE, and modelled on ai-question-cost.ts, for the same reason: the figure
 * the teacher sees next to the button and the figure the server quotes must
 * come from one function, or they drift and the number stops being trusted.
 *
 * It decides nothing. The spend cap lives in checkBudget inside generateGemini,
 * which is why this being wrong by a third is untidy rather than dangerous.
 *
 * Calibration: ai_usage_events stores real prompt and output token counts per
 * call. After roughly 20 real evaluations, re-fit TOKENS_PER_IMAGE and
 * OUTPUT_TOKENS_PER_CRITERION from that table. Until then the label says est.
 */

import { costOf, TIER_MODELS, type AiTier } from '@neram/ai';

/** The tier the nexus.drawing-eval feature is registered against. */
const TIER: AiTier = 'best';

/**
 * Gemini bills an image as a flat block of tokens once it is under the tiling
 * threshold, and a drawing sheet photographed on a phone sits comfortably
 * inside one tile after compression.
 */
const TOKENS_PER_IMAGE = 258;

/** Instructions, criteria and band wording. Measured against the v1 prompt. */
const PROMPT_OVERHEAD_TOKENS = 1_100;

/** Reasoning, plus two or three annotation boxes, per criterion. */
const OUTPUT_TOKENS_PER_CRITERION = 220;

/** Overall comment and flags. */
const OUTPUT_OVERHEAD_TOKENS = 160;

/** Rough throughput of the best tier, for the "~N s" hint. */
const THROUGHPUT_TOKENS_PER_SEC = 55;

export interface DrawingCostInput {
  /** Anchors plus the student sheet. Five anchors is the configured shape. */
  anchorCount: number;
  criterionCount: number;
  /** From checkBudget(...).controls. Never hardcode a second rate. */
  usdToInr: number;
}

export interface DrawingCostEstimate {
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Null when the model is not in the pricing table, mirroring costOf. */
  costUsd: number | null;
  costInr: number | null;
  seconds: number;
}

export function estimateEvaluationCost(input: DrawingCostInput): DrawingCostEstimate {
  const model = TIER_MODELS[TIER][0];

  // Anchors plus the one student sheet.
  const images = Math.max(0, input.anchorCount) + 1;
  const tokensIn = PROMPT_OVERHEAD_TOKENS + images * TOKENS_PER_IMAGE;
  const tokensOut =
    OUTPUT_OVERHEAD_TOKENS + Math.max(1, input.criterionCount) * OUTPUT_TOKENS_PER_CRITERION;

  const costUsd = costOf(model, {
    promptTokens: tokensIn,
    outputTokens: tokensOut,
    totalTokens: tokensIn + tokensOut,
  });

  return {
    model,
    tokensIn,
    tokensOut,
    costUsd,
    costInr: costUsd === null ? null : costUsd * input.usdToInr,
    seconds: Math.max(4, Math.round(tokensOut / THROUGHPUT_TOKENS_PER_SEC)),
  };
}

/**
 * The monthly figure, for the admin panel and for sanity-checking the design
 * against the brief's US$15 ceiling.
 */
export function estimateMonthlyCost(perCallUsd: number | null, evaluationsPerMonth: number): number | null {
  if (perCallUsd === null) return null;
  return perCallUsd * Math.max(0, evaluationsPerMonth);
}
