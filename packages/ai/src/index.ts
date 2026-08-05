/**
 * @neram/ai
 *
 * Every Gemini call in the ecosystem goes through this package. Nothing else
 * should import @google/generative-ai or reach generativelanguage.googleapis.com
 * directly; there is an ESLint rule that fails the build if it does, because
 * six hand-rolled copies is how the app ended up calling models Google had
 * already shut down.
 *
 * Typical use:
 *
 *   import { generateGeminiText, AiBlockedError } from '@neram/ai';
 *
 *   try {
 *     const raw = await generateGeminiText({
 *       feature: 'nexus.chapter-test',
 *       parts: [{ text: prompt }],
 *       actorId: user.id,
 *     });
 *   } catch (err) {
 *     if (err instanceof AiBlockedError) {
 *       return NextResponse.json(
 *         { error: err.message, manualPrompt: err.manualPrompt },
 *         { status: 409 },
 *       );
 *     }
 *     throw err;
 *   }
 */

export {
  generateGemini,
  generateGeminiText,
  buildManualPrompt,
  AiBlockedError,
  ALL_AI_FEATURE_IDS,
} from './gemini';
export type { GeminiPart, GeminiContent, GenerateOptions, GeminiResult } from './gemini';

export {
  AI_FEATURES,
  AI_CONTROLS_KEY,
  DEFAULT_AI_CONTROLS,
  featureById,
  modeFor,
  resolveControls,
} from './features';
export type {
  AiApp,
  AiControls,
  AiFeatureDef,
  AiFeatureId,
  AiMode,
  AiTrigger,
} from './features';

export { MODEL_PRICING, RETIRED_MODELS, TIER_MODELS, costOf, formatUsd } from './pricing';
export type { AiTier, ModelPrice, TokenUsage } from './pricing';

export { checkBudget, getAiControls, clearBudgetCache, noteSpend } from './budget';
export type { BudgetReason, BudgetVerdict } from './budget';

export { hashClientKey, ipFromHeaders } from './client-key';
