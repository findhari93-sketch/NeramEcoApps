/**
 * What a test generation will cost, before it is spent.
 *
 * PURE. The wizard shows "₹2.40 est. Gemini cost · ~25 s to first draft" next
 * to the Generate button, and that number is the reason a teacher trusts the
 * inbuilt route over pasting into ChatGPT. A hardcoded string would be a lie
 * the first time pricing moved, so this computes from the same MODEL_PRICING
 * table the meter bills against.
 *
 * Two rules this file exists to keep:
 *
 * 1. The estimate route and the wizard call THIS function, so the number the
 *    teacher saw and the number the server quoted cannot drift.
 * 2. It never decides anything. The spend cap lives in checkBudget, inside
 *    generateGemini. This only draws a figure, which is why it can be wrong by
 *    a third without being dangerous.
 *
 * Calibration: ai_usage_events already stores real promptTokens/outputTokens
 * per call. After ~20 real generations, re-fit OUTPUT_TOKENS_PER_FORMAT and
 * THROUGHPUT_TOKENS_PER_SEC from that table. Until then the label says "est.".
 */
import { TIER_MODELS, costOf, type AiFeatureId, type AiTier, type TokenUsage } from '@neram/ai';
import type { DraftFormat } from './test-wizard-draft';

export type GenerateMode = 'topic' | 'recording' | 'pdf';

export interface CostEstimateInput {
  mode: GenerateMode;
  count: number;
  formats: DraftFormat[];
  /** Length of the teacher's steering text, if any. */
  steerChars?: number;
  /** Recording branch: how much transcript will actually be sent. */
  transcriptChars?: number;
  /** PDF branch: preferred, because Gemini bills a page at a flat rate. */
  pageCount?: number;
  /** PDF branch fallback when the page count is unknown. */
  fileBytes?: number;
  /** From getAiControls(). Never hardcode a second rate. */
  usdToInr: number;
}

export interface CostEstimate {
  model: string;
  tokensIn: number;
  tokensOut: number;
  /** Null when the model is not in the pricing table, mirroring costOf. */
  costUsd: number | null;
  costInr: number | null;
  seconds: number;
}

/**
 * The prompt itself: instructions, reply-format sample, and the tag registry
 * inlined by buildImportPrompt. Measured from a real registry of ~120 tags.
 */
const PROMPT_OVERHEAD_TOKENS = 1_200;

/**
 * ai-generate.ts slices a transcript at 12k chars before sending it, so
 * estimating on the raw length would overstate a 46-minute class by 4x.
 */
export const TRANSCRIPT_SLICE_CHARS = 12_000;

/** Gemini bills a PDF page at a flat ~258 tokens regardless of how dense it is. */
const TOKENS_PER_PDF_PAGE = 258;

/** Rough characters per token for English prose. */
const CHARS_PER_TOKEN = 4;

/** Very rough bytes per character in a text-bearing PDF, used only as a fallback. */
const PDF_BYTES_PER_CHAR = 3.5;

/**
 * Output size per question, by format. An MCQ carries four options; a numeric
 * carries a number and a tolerance; a drawing prompt is a stem and nothing else.
 */
const OUTPUT_TOKENS_PER_FORMAT: Record<DraftFormat, number> = {
  MCQ: 180,
  NUMERICAL: 120,
  IMAGE_BASED: 150,
  DRAWING_PROMPT: 90,
};

/** Every question also carries an explanation and a source quote. */
const OUTPUT_TOKENS_PROSE = 60;

/** Observed on flash-class models. */
const THROUGHPUT_TOKENS_PER_SEC = 55;

/** Fixed cost before the first token: request setup, and for a PDF the upload. */
const LATENCY_SECONDS: Record<GenerateMode, number> = { topic: 2, recording: 4, pdf: 12 };

/**
 * Which metered feature a run is billed to.
 *
 * Two ids rather than one because the spend differs by an order of magnitude,
 * and a control panel that cannot separate them cannot tell you which of the
 * two emptied the month. Lives here rather than in the route because a Next
 * route file may only export handlers and its own config.
 */
export const FEATURE_BY_MODE: Record<GenerateMode, AiFeatureId> = {
  topic: 'nexus.test-wizard-generate',
  recording: 'nexus.test-wizard-generate',
  pdf: 'nexus.test-wizard-generate-doc',
};

/** A document-reading run needs the document tier, which has a different fallback chain. */
export function tierForMode(mode: GenerateMode): AiTier {
  return mode === 'pdf' ? 'document' : 'standard';
}

/** The model that will actually answer: first in the tier's chain. */
export function modelForMode(mode: GenerateMode): string {
  return TIER_MODELS[tierForMode(mode)][0];
}

export function estimateInputTokens(input: CostEstimateInput): number {
  const steer = Math.ceil((input.steerChars ?? 0) / CHARS_PER_TOKEN);
  switch (input.mode) {
    case 'recording': {
      const chars = Math.min(input.transcriptChars ?? 0, TRANSCRIPT_SLICE_CHARS);
      return PROMPT_OVERHEAD_TOKENS + steer + Math.ceil(chars / CHARS_PER_TOKEN);
    }
    case 'pdf': {
      if (input.pageCount && input.pageCount > 0) {
        return PROMPT_OVERHEAD_TOKENS + steer + input.pageCount * TOKENS_PER_PDF_PAGE;
      }
      const chars = (input.fileBytes ?? 0) / PDF_BYTES_PER_CHAR;
      return PROMPT_OVERHEAD_TOKENS + steer + Math.ceil(chars / CHARS_PER_TOKEN);
    }
    default:
      return PROMPT_OVERHEAD_TOKENS + steer;
  }
}

export function estimateOutputTokens(count: number, formats: DraftFormat[]): number {
  const chosen = formats.length > 0 ? formats : (['MCQ'] as DraftFormat[]);
  // The mix is unknown up front, so average the requested formats. Asking for
  // MCQ and drawing together should land between the two, not at the cheaper one.
  const avg = chosen.reduce((sum, f) => sum + (OUTPUT_TOKENS_PER_FORMAT[f] ?? 150), 0) / chosen.length;
  return Math.ceil(Math.max(0, count) * (avg + OUTPUT_TOKENS_PROSE));
}

export function estimateCost(input: CostEstimateInput): CostEstimate {
  const model = modelForMode(input.mode);
  const tokensIn = estimateInputTokens(input);
  const tokensOut = estimateOutputTokens(input.count, input.formats);
  const usage: TokenUsage = {
    promptTokens: tokensIn,
    outputTokens: tokensOut,
    totalTokens: tokensIn + tokensOut,
  };
  const costUsd = costOf(model, usage);
  return {
    model,
    tokensIn,
    tokensOut,
    costUsd,
    // Two decimals, because this is displayed as rupees and paise.
    costInr: costUsd === null ? null : Math.round(costUsd * input.usdToInr * 100) / 100,
    seconds: Math.ceil(tokensOut / THROUGHPUT_TOKENS_PER_SEC) + LATENCY_SECONDS[input.mode],
  };
}

/**
 * "₹2.40" / "under ₹0.01" / "unpriced".
 *
 * Never rounds a real cost down to "₹0.00": a teacher who reads free will
 * generate forty of them and then meet the daily cap with no warning.
 */
export function formatInr(inr: number | null): string {
  if (inr === null) return 'unpriced';
  if (inr === 0) return '₹0';
  if (inr < 0.01) return 'under ₹0.01';
  return `₹${inr.toFixed(2)}`;
}

/** "~25 s" / "~2 min". */
export function formatSeconds(seconds: number): string {
  if (seconds < 90) return `~${seconds} s`;
  return `~${Math.round(seconds / 60)} min`;
}
