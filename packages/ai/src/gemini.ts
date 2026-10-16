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
 *  - 402 is the prepaid credits running out. They belong to the billing
 *    account, so no other model helps: throw AiBillingError at once (a free
 *    key's 402 still falls through to the paid key, like its 400 and 403).
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
import { backupEligibility, generateWithBackup, streamWithBackup } from './fallback';
import { readSse } from './sse';

export interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  functionCall?: { name: string; args: unknown };
  functionResponse?: { name: string; response: unknown };
  /** Set by Gemini 3 models on a function call; must be sent back unchanged with that call. */
  thoughtSignature?: string;
  /** A thinking summary part (only when thoughts are requested). */
  thought?: boolean;
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
   * The candidate's parts exactly as returned. A tool loop appends these as the
   * model turn: Gemini 3 models reject a replayed function call that has lost
   * its thoughtSignature, with a 400 this file would otherwise read as a bad key.
   */
  modelParts: GeminiPart[];
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

/**
 * Thrown when Google answers 402: the prepaid credits on the key's billing
 * account have run out.
 *
 * Its own class because nothing in code can fix it (credits are per billing
 * account, so another model or a retry fails the same way) and the people who
 * can fix it need telling. Chatbots answer with the human-help options instead
 * of a dead error, and the usage row is tagged CREDITS_DEPLETED so the admin
 * pages can say since when.
 */
export class AiBillingError extends Error {
  readonly code = 'CREDITS_DEPLETED' as const;
  readonly feature: string;
  readonly keyEnv: string;

  constructor(args: { feature: string; keyEnv: string }) {
    super(`Gemini credits depleted (402). Top up the billing account behind ${args.keyEnv}.`);
    this.name = 'AiBillingError';
    this.feature = args.feature;
    this.keyEnv = args.keyEnv;
  }
}

/** The usage-row error text for a 402, which the admin health check looks for. */
export const CREDITS_DEPLETED_ERROR = 'CREDITS_DEPLETED (402)';

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

interface Attempt {
  model: string;
  apiKey: string;
  keyTier: 'paid' | 'free';
  /** The env var the key came from, named when Google rejects it. */
  keyEnv: string;
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
 * Throws AiBlockedError when the budget guard or a mode switch refused it,
 * AiBillingError when the key's credits have run out (402), and
 * a plain Error on any other Gemini failure (message contains '429' when every model
 * was rate limited, and GEMINI_API_KEY when the key is the problem).
 */
export async function generateGemini(opts: GenerateOptions): Promise<GeminiResult> {
  const def = featureById(opts.feature);
  const app = def?.app ?? 'nexus';

  await guardBudget(opts, def, app);

  try {
    return await callGemini(opts, def, app);
  } catch (geminiErr) {
    // Nexus and Marketing text features get a second provider before failing.
    // Anything the backup cannot serve (images, tools, other apps, no key) fails as before,
    // and so does a backup that also fails: callers branch on Gemini's own
    // error (402, 429), so that is the one they see.
    const eligible = backupEligibility(opts, app);
    if (!eligible.ok) throw geminiErr;
    return runBackup(opts, app, geminiErr, () => generateWithBackup(opts, { app }));
  }
}

/**
 * Like generateGemini, but hands the answer over as it is written.
 *
 * `onText` gets each text delta the moment it arrives, which is what lets the
 * site chatbot show an answer word by word instead of after a ten second wait.
 * The resolved result is the same shape generateGemini returns, so a tool loop
 * can read functionCalls and modelParts off it exactly as before.
 *
 * Failover only happens before the first word. Once text has reached the
 * visitor there is nothing sensible to switch to, so a dropped connection ends
 * the answer with finishReason 'INTERRUPTED' and whatever arrived.
 */
export async function streamGemini(
  opts: GenerateOptions & { onText: (delta: string) => void },
): Promise<GeminiResult> {
  const def = featureById(opts.feature);
  const app = def?.app ?? 'nexus';

  await guardBudget(opts, def, app);

  try {
    return await callGemini(opts, def, app, opts.onText);
  } catch (geminiErr) {
    const eligible = backupEligibility(opts, app);
    if (!eligible.ok) throw geminiErr;
    return runBackup(opts, app, geminiErr, () => streamWithBackup(opts, { app, onText: opts.onText }));
  }
}

/** The budget guard and mode switch. Throws AiBlockedError when the call may not run. */
async function guardBudget(
  opts: GenerateOptions,
  def: ReturnType<typeof featureById>,
  app: string,
): Promise<void> {
  const verdict = await checkBudget(opts.feature, opts.clientKey);
  if (verdict.allowed) return;

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

/** Runs a backup provider after Gemini failed, metered like a Gemini call. */
async function runBackup(
  opts: GenerateOptions,
  app: string,
  geminiErr: unknown,
  backup: () => Promise<GeminiResult & { attempts: unknown[] }>,
): Promise<GeminiResult> {
  const startedAt = Date.now();
  const why = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
  try {
    const { attempts: _tried, ...result } = await backup();
    console.warn(`[ai] ${opts.feature} answered by ${result.model} because Gemini failed: ${why}`);
    logUsage({
      featureId: opts.feature,
      app,
      model: result.model,
      keyTier: 'free',
      promptTokens: result.usage.promptTokens,
      outputTokens: result.usage.outputTokens,
      estimatedCostUsd: 0,
      latencyMs: Date.now() - startedAt,
      status: 'ok',
      actorId: opts.actorId ?? null,
      clientKey: opts.clientKey ?? null,
    });
    return result;
  } catch (backupErr) {
    const message = backupErr instanceof Error ? backupErr.message : String(backupErr);
    console.error(`[ai] ${opts.feature}: backup failed too: ${message}`);
    logUsage({
      featureId: opts.feature,
      app,
      model: 'backup',
      keyTier: 'free',
      latencyMs: Date.now() - startedAt,
      status: /429/.test(message) ? 'rate_limited' : 'error',
      error: message,
      actorId: opts.actorId ?? null,
      clientKey: opts.clientKey ?? null,
    });
    throw geminiErr;
  }
}

/**
 * The Gemini cascade itself: every (key, model) attempt in order, metered.
 * Throws on failure; the caller decides whether a backup gets a turn.
 *
 * With `onText` the call streams (streamGenerateContent over SSE) and each text
 * delta is handed over as it arrives. The cascade and the status handling are
 * the same either way: a failed attempt is a non-2xx status, which always comes
 * before the first byte of an answer.
 */
async function callGemini(
  opts: GenerateOptions,
  def: ReturnType<typeof featureById>,
  app: string,
  onText?: (delta: string) => void,
): Promise<GeminiResult> {
  const attempts = planAttempts(opts, def?.tier ?? 'standard', def?.allowFreeKey ?? false, def?.keyEnv, def?.keyEnvModels);
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

    const url = onText
      ? `${GEMINI_BASE_URL}/${attempt.model}:streamGenerateContent?alt=sse&key=${attempt.apiKey}`
      : `${GEMINI_BASE_URL}/${attempt.model}:generateContent?key=${attempt.apiKey}`;
    const res = await fetch(url, {
      cache: 'no-store',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const { parts, finishReason, usageMetadata } = onText
        ? await readStreamedCandidate(res, onText)
        : await readCandidate(res);
      const text = parts.map((p) => p.text ?? '').join('');
      const functionCalls = parts
        .filter((p) => p.functionCall)
        .map((p) => p.functionCall as { name: string; args: unknown });

      // A tool call is a valid answer with no text, so only treat empty as a
      // failure when the model returned nothing at all.
      if (!text && functionCalls.length === 0) {
        throw new Error('AI returned an empty response');
      }

      const usage = readUsage(usageMetadata);
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
        modelParts: parts,
        finishReason,
      };
    }

    lastStatus = res.status;
    const errBody = await res.json().catch(() => ({}));

    if (res.status === 400 || res.status === 402 || res.status === 403) {
      // A bad or unfunded free key should cost the request nothing: drop the
      // rest of the free attempts and carry on with the paid ones.
      if (attempt.keyTier === 'free') {
        if (!freeKeyRejected) {
          console.error(`[ai] GEMINI_API_KEY_FREE was rejected (${res.status}), falling back to the paid key.`);
          freeKeyRejected = true;
        }
        continue;
      }
    }

    if (res.status === 402) {
      // Credits are per billing account, so every other model on this key
      // would 402 too. Stop here and say what is wrong.
      console.error(`[ai] credits depleted (402) on ${attempt.keyEnv}:`, JSON.stringify(errBody));
      logUsage({
        featureId: opts.feature,
        app,
        model: attempt.model,
        keyTier: attempt.keyTier,
        latencyMs: Date.now() - startedAt,
        status: 'error',
        error: CREDITS_DEPLETED_ERROR,
        actorId: opts.actorId ?? null,
        clientKey: opts.clientKey ?? null,
      });
      throw new AiBillingError({ feature: opts.feature, keyEnv: attempt.keyEnv });
    }

    if (res.status === 400 || res.status === 403) {

      console.error(`[ai] auth error (${res.status}):`, JSON.stringify(errBody));
      const message = `Gemini API key invalid or unauthorized (${res.status}). Check ${attempt.keyEnv}.`;
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
    clientKey: opts.clientKey ?? null,
  });
  throw new Error(message);
}

interface ReadCandidate {
  parts: GeminiPart[];
  finishReason: string;
  usageMetadata: unknown;
}

async function readCandidate(res: Response): Promise<ReadCandidate> {
  const data = await res.json();
  const candidate = data?.candidates?.[0];
  return {
    parts: candidate?.content?.parts ?? [],
    finishReason: candidate?.finishReason || 'UNKNOWN',
    usageMetadata: data?.usageMetadata,
  };
}

/**
 * Reads a streamGenerateContent SSE body. Each event is a partial response:
 * text is handed to onText as it lands, then consecutive plain text parts are
 * merged so modelParts looks like the one-shot call's. A function call part
 * (thoughtSignature and all) arrives whole in a single event and is kept as is.
 *
 * A connection that drops after some text has gone out ends the answer as
 * 'INTERRUPTED' rather than throwing: the visitor already has half an answer,
 * and a failover would start a second, different one underneath it.
 */
async function readStreamedCandidate(res: Response, onText: (delta: string) => void): Promise<ReadCandidate> {
  const parts: GeminiPart[] = [];
  let finishReason = 'UNKNOWN';
  let usageMetadata: unknown;
  let sentText = false;

  try {
    await readSse(res, (data) => {
      let chunk: { candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>; usageMetadata?: unknown };
      try {
        chunk = JSON.parse(data);
      } catch {
        return;
      }
      const candidate = chunk?.candidates?.[0];
      if (candidate?.finishReason) finishReason = candidate.finishReason;
      if (chunk?.usageMetadata) usageMetadata = chunk.usageMetadata;

      for (const part of candidate?.content?.parts ?? []) {
        if (part.text && !part.thought) {
          onText(part.text);
          sentText = true;
        }
        const last = parts[parts.length - 1];
        const mergeable = (p: GeminiPart | undefined) =>
          !!p && typeof p.text === 'string' && !p.thought && !p.thoughtSignature && !p.functionCall;
        if (mergeable(part) && mergeable(last)) {
          last.text += part.text as string;
        } else {
          parts.push({ ...part });
        }
      }
    });
  } catch (err) {
    if (!sentText) throw err;
    console.error('[ai] stream dropped mid-answer:', err);
    finishReason = 'INTERRUPTED';
  }

  return { parts, finishReason, usageMetadata };
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
 *
 * A feature with its own key (keyEnv, when that var is set) uses it alone,
 * with keyEnvModels in place of the tier's list when it names any.
 */
function planAttempts(
  opts: GenerateOptions,
  tier: keyof typeof TIER_MODELS,
  allowFreeKey: boolean,
  keyEnv?: string,
  keyEnvModels?: string[]
): Attempt[] {
  const models = opts.models?.length ? opts.models : TIER_MODELS[tier];
  const ownKey = keyEnv ? process.env[keyEnv] : undefined;
  if (keyEnv && ownKey) {
    const own = opts.models?.length ? opts.models : keyEnvModels?.length ? keyEnvModels : models;
    return own.map((model) => ({ model, apiKey: ownKey, keyTier: 'paid', keyEnv }));
  }
  const paidKey = process.env.GEMINI_API_KEY;
  const freeKey = allowFreeKey ? process.env.GEMINI_API_KEY_FREE : undefined;

  if (!paidKey && !freeKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const attempts: Attempt[] = [];
  if (freeKey) {
    for (const model of models) attempts.push({ model, apiKey: freeKey, keyTier: 'free', keyEnv: 'GEMINI_API_KEY_FREE' });
  }
  if (paidKey) {
    for (const model of models) attempts.push({ model, apiKey: paidKey, keyTier: 'paid', keyEnv: 'GEMINI_API_KEY' });
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
