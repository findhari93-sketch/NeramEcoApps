/**
 * What each model costs, and which models still exist.
 *
 * This file is the reason the whole package exists. Until now no code anywhere
 * knew what a Gemini call cost, so nobody could answer "which feature spent the
 * most this month". Every call now resolves its price here and writes the
 * result to ai_usage_events.
 *
 * Two things went wrong before, and both are guarded against here:
 *
 * 1. Google retires models without warning, and the app kept calling dead ones.
 *    gemini-2.0-flash and gemini-2.0-flash-lite were shut down on 1 June 2026;
 *    gemini-1.5-flash went earlier. Five call sites were still naming them, so
 *    those features had been quietly failing. Callers now pick a TIER, never a
 *    model, so the next shutdown is a one-line fix in this file.
 *
 * 2. Newer does not mean cheaper. It is the opposite here: gemini-3.5-flash
 *    costs 15x more per output token than gemini-2.5-flash-lite. An innocent
 *    "let us use the latest model" edit could multiply the bill without anyone
 *    noticing. The tier names below are about spend, not recency, and the
 *    per-1M numbers sit next to them so the tradeoff is visible at the point of
 *    the decision.
 *
 * Prices are USD per 1,000,000 tokens, paid tier, standard (non-batch).
 * Source: https://ai.google.dev/gemini-api/docs/pricing, read 4 August 2026.
 * Model ids: https://ai.google.dev/gemini-api/docs/models, read 4 August 2026.
 *
 * When Google changes a price, edit this file. Do NOT let an unknown model fall
 * back to a guessed number: costOf() returns null instead, and the usage panel
 * renders "unpriced" rather than a confident zero that would understate spend.
 */

export interface ModelPrice {
  /** USD per 1M input tokens (text, image and video are billed the same). */
  inputPerM: number;
  /** USD per 1M output tokens. */
  outputPerM: number;
  /**
   * Above this many input tokens the model switches to a higher price band.
   * Only gemini-2.5-pro has one today.
   */
  longContext?: { overTokens: number; inputPerM: number; outputPerM: number };
}

export const MODEL_PRICING: Record<string, ModelPrice> = {
  // Cheapest thing Google sells. The default for anything high volume.
  'gemini-2.5-flash-lite': { inputPerM: 0.1, outputPerM: 0.4 },
  'gemini-3.1-flash-lite': { inputPerM: 0.25, outputPerM: 1.5 },
  'gemini-2.5-flash': { inputPerM: 0.3, outputPerM: 2.5 },
  'gemini-3.5-flash-lite': { inputPerM: 0.3, outputPerM: 2.5 },
  'gemini-3.6-flash': { inputPerM: 1.5, outputPerM: 7.5 },
  'gemini-3.5-flash': { inputPerM: 1.5, outputPerM: 9.0 },
  'gemini-2.5-pro': {
    inputPerM: 1.25,
    outputPerM: 10.0,
    longContext: { overTokens: 200_000, inputPerM: 2.5, outputPerM: 15.0 },
  },
};

/**
 * Shut down by Google. Kept here only so the client can throw a message that
 * says WHY rather than a bare 404, and so a test can assert we never ship one.
 */
export const RETIRED_MODELS: Record<string, string> = {
  'gemini-2.0-flash': 'shut down 1 June 2026',
  'gemini-2.0-flash-lite': 'shut down 1 June 2026',
  'gemini-1.5-flash': 'retired',
  'gemini-1.5-pro': 'retired',
  'gemini-1.5-flash-8b': 'retired',
};

/**
 * How callers choose a model.
 *
 * Ordered cheapest first. A caller states how good the answer has to be, and
 * this file decides what that costs. The fallbacks exist because of failure
 * mode 1 above: if the primary is retired (404) or rate limited (429) the call
 * should still land. Note that a fallback can be pricier than the primary, so
 * the model that actually answered is recorded on every usage row.
 */
export type AiTier = 'cheap' | 'standard' | 'document' | 'best';

export const TIER_MODELS: Record<AiTier, string[]> = {
  /** Chat turns, short rewrites, classification. $0.10 / $0.40. */
  cheap: ['gemini-2.5-flash-lite', 'gemini-3.1-flash-lite'],
  /** Structured extraction, question generation, summaries. $0.30 / $2.50. */
  standard: ['gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  /**
   * Work that reads an attached PDF or image.
   *
   * Same price as standard, different fallback, and the difference is the whole
   * point: the lite models handle a document input poorly, and a chapter test
   * built from a half-read PDF is worse than a clear failure the teacher can
   * retry. The chapter-test route used to encode this by pinning a single model
   * inline with no fallback, which is how call sites end up naming models and
   * how the retired ones survived. Expressed here, it survives a shutdown.
   */
  document: ['gemini-2.5-flash', 'gemini-3.5-flash-lite'],
  /**
   * Reserved for work where a wrong answer wastes a teacher's time. Nothing
   * uses it by default: it is 5x standard on input and 3.6x on output, so
   * switching a feature to it is a deliberate, visible choice.
   */
  best: ['gemini-3.5-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
};

export interface TokenUsage {
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
}

/**
 * Cost of one call in USD, or null when the model is not in the table.
 *
 * Null rather than 0 is deliberate. A zero here would silently understate the
 * month's spend and the budget guard would never trip, which is exactly the
 * failure this package is meant to prevent.
 */
export function costOf(model: string, usage: TokenUsage): number | null {
  const price = MODEL_PRICING[model];
  if (!price) return null;

  const band =
    price.longContext && usage.promptTokens > price.longContext.overTokens
      ? price.longContext
      : price;

  const input = (usage.promptTokens / 1_000_000) * band.inputPerM;
  const output = (usage.outputTokens / 1_000_000) * band.outputPerM;

  // Six decimals matches numeric(12,6) in ai_usage_events. A single cheap call
  // can land near 1e-6 USD, so rounding to cents here would store nothing.
  return Math.round((input + output) * 1e6) / 1e6;
}

/** Formats a USD amount for display. Small spends need more than 2 decimals. */
export function formatUsd(usd: number | null): string {
  if (usd === null) return 'unpriced';
  if (usd === 0) return '$0';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
