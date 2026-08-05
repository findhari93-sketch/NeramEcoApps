/**
 * The one place that calls Gemini.
 *
 * Lifted from apps/nexus/src/lib/gemini-client.ts, which had the only correct
 * handling of Gemini's status codes anywhere in the repo but was reachable from
 * nexus alone. Marketing and admin each grew their own copy, six in total, and
 * five of those copies named a model by hand. That is how gemini-1.5-flash and
 * gemini-2.0-flash stayed in the code months after Google shut them down: there
 * was no single list to update. Callers now pass a feature id, the registry
 * decides the model, and pricing.ts decides what that costs.
 *
 * The status code handling is unchanged and the distinctions still matter:
 *
 *  - 400 and 403 are the KEY being wrong, not the request. Retrying a second
 *    model with a bad key makes three failing calls instead of one, so these
 *    give up immediately. The exception is the optional free key, where a
 *    rejection falls through to the paid key rather than failing the request.
 *  - 404 is that model being retired, which Google does without warning. Fall
 *    through to the next one.
 *  - 429 is quota. Try the next model, and if they are all limited say so
 *    explicitly, because callers branch on the string '429'.
 *
 * The key is read at CALL time, not at import time, so a test can set
 * process.env after importing and callers get no such trap.
 *
 * Everything here is fire-and-forget on the logging side. A usage row that
 * fails to write must never turn a working answer into an error.
 */

import { recordAiUsage } from '@neram/database';

import { checkBudget, noteSpend, type BudgetReason } from './budget';
import { AI_FEATURES, featureById, type AiFeatureId } from './features';
import { costOf, RETIRED_MODELS, TIER_MODELS, type TokenUsage } from './pricing';

export interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  functionCall?: { name: string; args: unknown };
  functionResponse?: { name: string; response: unknown };
}

export interface GeminiContent {
  role?: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GenerateOptions {
  /** Which feature is spending. Required, and typed, so it cannot be a typo. */
  feature: AiFeatureId;
  /** Single-turn shorthand. Ignored when `contents` is given. */
  parts?: GeminiPart[];
  /** Multi-turn conversation, for the chatbots. */
  contents?: GeminiContent[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Defaults to 'application/json', which is what most callers parse. */
  responseMimeType?: string;
  /** JSON schema for structured output. */
  responseSchema?: unknown;
  /** Function declarations, for the site chatbot's tool loop. */
  tools?: unknown[];
  safetySettings?: unknown[];
  /** Override the tier's cascade. Mostly for tests. */
  models?: string[];
  /** users.id, when there is an authenticated actor to attribute this to. */
  actorId?: string | null;
  /**
   * Identifies one anonymous visitor, for the public chatbots' per-visitor rate
   * limit. Pass hashClientKey(...) rather than a raw IP or session id: this is
   * stored, and the only question it has to answer is "same visitor as before".
   */
  clientKey?: string | null;
}

export interface GeminiResult {
  text: string;
  /** The model that actually answered, which may be a fallback. */
  model: string;
  usage: TokenUsage;
  /** null when the model had no known price. Never 0 for "unknown". */
  costUsd: number | null;
  keyTier: 'paid' | 'free';
  /** Function calls the model asked for, empty when it answered with text. */
  functionCalls: Array<{ name: string; args: unknown }>;
  /**
   * Gemini's own reason for stopping: 'STOP', 'MAX_TOKENS', 'SAFETY' and so on.
   *
   * Worth surfacing because MAX_TOKENS is a truncated answer that still cost
   * full price, and the site chatbot appends a "contact us" line when it sees
   * one rather than leaving a visitor with a sentence that stops mid-word.
   */
  finishReason: string;
}

/**
 * Thrown when the call was refused before it reached Google.
 *
 * A separate class because callers treat it differently from a Gemini failure:
 * this one is expected, costs nothing, and for most features carries a prompt
 * the user can run by hand. API routes should answer 409 with `manualPrompt`
 * rather than 500.
 */
export class AiBlockedError extends Error {
  readonly reason: BudgetReason;
  readonly feature: string;
  readonly supportsManual: boolean;
  readonly manualPrompt: string | null;

  constructor(args: {
    message: string;
    reason: BudgetReason;
    feature: string;
    supportsManual: boolean;
    manualPrompt: string | null;
  }) {
    super(args.message);
    this.name = 'AiBlockedError';
    this.reason = args.reason;
    this.feature = args.feature;
    this.supportsManual = args.supportsManual;
    this.manualPrompt = args.manualPrompt;
  }
}

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface Attempt {
  model: string;
  apiKey: string;
  keyTier: 'paid' | 'free';
}

/**
 * Writes a usage row without ever making it the caller's problem.
 *
 * `void somePromise` does NOT handle a rejection, it only silences the linter,
 * so an unhandled rejection could take down the process even though the answer
 * itself was fine. recordAiUsage already swallows its own errors; this is the
 * belt to that pair of braces, and it keeps the six call sites below to one
 * line each.
 */
function logUsage(input: Parameters<typeof recordAiUsage>[0]): void {
  void recordAiUsage(input).catch((err) => {
    console.error('[ai] usage logging failed (the call itself was unaffected):', err);
  });
}

/**
 * Call Gemini, meter it, and return the first candidate.
 *
 * Throws AiBlockedError when the budget guard or a mode switch refused it, and
 * a plain Error on a Gemini failure (message contains '429' when every model
 * was rate limited, and GEMINI_API_KEY when the key is the problem).
 */
export async function generateGemini(opts: GenerateOptions): Promise<GeminiResult> {
  const def = featureById(opts.feature);
  const app = def?.app ?? 'nexus';

  const verdict = await checkBudget(opts.feature, opts.clientKey);
  if (!verdict.allowed) {
    const supportsManual = def?.supportsManual ?? false;
    // A refusal is worth a row: on the panel these are the calls the controls
    // actually prevented, which is the only evidence the controls are working.
    logUsage({
      featureId: opts.feature,
      app,
      status: verdict.reason === 'manual' ? 'manual' : 'blocked_budget',
      error: verdict.reason,
      actorId: opts.actorId ?? null,
      clientKey: opts.clientKey ?? null,
    });

    throw new AiBlockedError({
      message: verdict.message,
      reason: verdict.reason,
      feature: opts.feature,
      supportsManual,
      manualPrompt: supportsManual ? buildManualPrompt(opts) : null,
    });
  }

  const attempts = planAttempts(opts, def?.tier ?? 'standard', def?.allowFreeKey ?? false);
  const body = buildRequestBody(opts);
  const startedAt = Date.now();

  let lastStatus = 0;
  let freeKeyRejected = false;

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i];

    // Never spend a round trip on a model Google has already switched off.
    const retired = RETIRED_MODELS[attempt.model];
    if (retired) {
      console.error(`[ai] skipping ${attempt.model}: ${retired}. Update packages/ai/src/pricing.ts.`);
      continue;
    }

    const url = `${GEMINI_BASE_URL}/${attempt.model}:generateContent?key=${attempt.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const candidate = data?.candidates?.[0];
      const parts: GeminiPart[] = candidate?.content?.parts ?? [];
      const text = parts.map((p) => p.text ?? '').join('');
      const functionCalls = parts
        .filter((p) => p.functionCall)
        .map((p) => p.functionCall as { name: string; args: unknown });

      // A tool call is a valid answer with no text, so only treat empty as a
      // failure when the model returned nothing at all.
      if (!text && functionCalls.length === 0) {
        throw new Error('AI returned an empty response');
      }

      const usage = readUsage(data?.usageMetadata);
      const costUsd = costOf(attempt.model, usage);

      noteSpend(costUsd);
      logUsage({
        featureId: opts.feature,
        app,
        model: attempt.model,
        keyTier: attempt.keyTier,
        promptTokens: usage.promptTokens,
        outputTokens: usage.outputTokens,
        estimatedCostUsd: costUsd,
        latencyMs: Date.now() - startedAt,
        status: 'ok',
        actorId: opts.actorId ?? null,
      clientKey: opts.clientKey ?? null,
      });

      return {
        text,
        model: attempt.model,
        usage,
        costUsd,
        keyTier: attempt.keyTier,
        functionCalls,
        finishReason: candidate?.finishReason || 'UNKNOWN',
      };
    }

    lastStatus = res.status;
    const errBody = await res.json().catch(() => ({}));

    if (res.status === 400 || res.status === 403) {
      // A bad free key should cost the request nothing: drop the rest of the
      // free attempts and carry on with the paid ones.
      if (attempt.keyTier === 'free') {
        if (!freeKeyRejected) {
          console.error('[ai] GEMINI_API_KEY_FREE was rejected, falling back to the paid key.');
          freeKeyRejected = true;
        }
        continue;
      }

      console.error(`[ai] auth error (${res.status}):`, JSON.stringify(errBody));
      const message = `Gemini API key invalid or unauthorized (${res.status}). Check GEMINI_API_KEY.`;
      logUsage({
        featureId: opts.feature,
        app,
        model: attempt.model,
        keyTier: attempt.keyTier,
        latencyMs: Date.now() - startedAt,
        status: 'error',
        error: message,
        actorId: opts.actorId ?? null,
      clientKey: opts.clientKey ?? null,
      });
      throw new Error(message);
    }

    if (res.status === 404 || res.status === 429) {
      if (i < attempts.length - 1) continue;
      if (res.status === 429) {
        const message = 'Gemini API 429: rate limit reached on all models';
        logUsage({
          featureId: opts.feature,
          app,
          model: attempt.model,
          keyTier: attempt.keyTier,
          latencyMs: Date.now() - startedAt,
          status: 'rate_limited',
          error: message,
          actorId: opts.actorId ?? null,
      clientKey: opts.clientKey ?? null,
        });
        throw new Error(message);
      }
    }

    console.error(`[ai] error (${res.status}) on ${attempt.model}:`, JSON.stringify(errBody));
    const message = `Gemini API error: ${res.status}`;
    logUsage({
      featureId: opts.feature,
      app,
      model: attempt.model,
      keyTier: attempt.keyTier,
      latencyMs: Date.now() - startedAt,
      status: 'error',
      error: message,
      actorId: opts.actorId ?? null,
      clientKey: opts.clientKey ?? null,
    });
    throw new Error(message);
  }

  const message = lastStatus
    ? `Gemini API: all models exhausted (last status ${lastStatus})`
    : 'Gemini API: all models exhausted';
  logUsage({
    featureId: opts.feature,
    app,
    latencyMs: Date.now() - startedAt,
    status: 'error',
    error: message,
    actorId: opts.actorId ?? null,
  });
  throw new Error(message);
}

/**
 * Text-only convenience wrapper, matching the old generateGeminiText signature
 * so migrating a call site is an import change plus a feature id.
 */
export async function generateGeminiText(opts: GenerateOptions): Promise<string> {
  const result = await generateGemini(opts);
  return result.text;
}

/**
 * Flattens a request into something a human can paste into a chat app.
 *
 * Manual mode is what makes a cap tolerable. The alternative, telling a teacher
 * their chapter test is unavailable until tomorrow, turns a cost control into a
 * work stoppage. The pattern is borrowed from
 * apps/nexus/src/app/api/timetable/[classId]/video-meta/prompt/route.ts, which
 * already did exactly this for one feature.
 */
export function buildManualPrompt(opts: GenerateOptions): string {
  const blocks: string[] = [];
  if (opts.systemInstruction) blocks.push(opts.systemInstruction.trim());

  const contents = opts.contents ?? (opts.parts ? [{ parts: opts.parts }] : []);
  for (const content of contents) {
    for (const part of content.parts) {
      if (part.text) blocks.push(part.text.trim());
      else if (part.inline_data) {
        // The bytes cannot go in a paste, so name what has to be attached.
        blocks.push(`[attach the ${part.inline_data.mime_type} file here]`);
      }
    }
  }

  if (opts.responseMimeType !== 'text/plain') {
    blocks.push('Answer with JSON only, no commentary and no code fences.');
  }
  return blocks.filter(Boolean).join('\n\n');
}

/**
 * Which (key, model) pairs to try, in order.
 *
 * The free key goes first when the feature allows it. Free tier inputs are used
 * by Google to improve their products, so allowFreeKey is false for anything
 * carrying student work; see the note in features.ts.
 */
function planAttempts(
  opts: GenerateOptions,
  tier: keyof typeof TIER_MODELS,
  allowFreeKey: boolean
): Attempt[] {
  const models = opts.models?.length ? opts.models : TIER_MODELS[tier];
  const paidKey = process.env.GEMINI_API_KEY;
  const freeKey = allowFreeKey ? process.env.GEMINI_API_KEY_FREE : undefined;

  if (!paidKey && !freeKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const attempts: Attempt[] = [];
  if (freeKey) {
    for (const model of models) attempts.push({ model, apiKey: freeKey, keyTier: 'free' });
  }
  if (paidKey) {
    for (const model of models) attempts.push({ model, apiKey: paidKey, keyTier: 'paid' });
  }
  return attempts;
}

function buildRequestBody(opts: GenerateOptions): Record<string, unknown> {
  const contents = opts.contents ?? [{ parts: opts.parts ?? [] }];

  return {
    contents,
    // Gemini rejects a systemInstruction with an empty parts array, so omit it
    // entirely rather than sending a blank one.
    ...(opts.systemInstruction
      ? { systemInstruction: { parts: [{ text: opts.systemInstruction }] } }
      : {}),
    ...(opts.tools ? { tools: opts.tools } : {}),
    ...(opts.safetySettings ? { safetySettings: opts.safetySettings } : {}),
    generationConfig: {
      responseMimeType: opts.responseMimeType ?? 'application/json',
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 4096,
      ...(opts.responseSchema ? { responseSchema: opts.responseSchema } : {}),
    },
  };
}

/**
 * Reads Gemini's own token counts off the response.
 *
 * thoughtsTokenCount is the trap. The 2.5 models think before they answer, and
 * those thinking tokens are billed at the OUTPUT rate but reported separately
 * from candidatesTokenCount. Counting only candidates understates the cost of
 * every reasoning call, which on gemini-2.5-flash at $2.50 per 1M output is the
 * difference between a cap that holds and one that quietly does not.
 */
function readUsage(meta: unknown): TokenUsage {
  const m = (meta ?? {}) as Record<string, number | undefined>;
  const promptTokens = m.promptTokenCount ?? 0;
  const outputTokens = (m.candidatesTokenCount ?? 0) + (m.thoughtsTokenCount ?? 0);
  return {
    promptTokens,
    outputTokens,
    totalTokens: m.totalTokenCount ?? promptTokens + outputTokens,
  };
}

/** Every feature id, for the control panel. */
export const ALL_AI_FEATURE_IDS: string[] = AI_FEATURES.map((f) => f.id);
