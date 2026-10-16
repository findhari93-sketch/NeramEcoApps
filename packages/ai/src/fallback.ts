/**
 * The backup providers: Groq, then OpenRouter, when Gemini cannot answer.
 *
 * Added 2026-10-15 after Gemini's prepaid credit ran out on 10-11 and every
 * Nexus AI feature failed for four days, the class checkpoints included.
 *
 * Deliberately narrow:
 *
 *  - Nexus and Marketing features only (BACKUP_APPS). Each app has its own
 *    Groq and OpenRouter keys on its own Vercel project, so the website chatbot
 *    cannot use up Nexus's free allowance or the other way round. Marketing was
 *    added the same day, after the site chatbot went "offline" on the 402.
 *  - Text only. A call carrying an image (drawing review, orientation, the
 *    photo check) waits for Gemini, which judges drawings far better than any
 *    open model we can reach for free (founder, 2026-10-15).
 *  - No tool calls. The Assistant's loop replays Gemini-specific parts, and it
 *    is off on production anyway. A feature that sets `backupDropsTools` (the
 *    site chatbot) is the exception: the backup answers it in plain text with
 *    no tools, and any tool results already fetched are passed on as text.
 *
 * Both providers speak the OpenAI chat format, so one adapter serves both. Free
 * tiers are small (Groq allows about 8,000 tokens a minute per model), so a
 * short rate-limit wait is taken once per model before moving on.
 *
 * Groq does not train on API data, which is why it goes first. OpenRouter's
 * free models may let their provider log prompts, so it is the last resort.
 */

import type { GeminiContent, GeminiPart, GenerateOptions, GeminiResult } from './gemini';
import { featureById } from './features';
import { readSse } from './sse';

interface Provider {
  id: 'groq' | 'openrouter';
  keyEnv: string;
  modelsEnv: string;
  baseUrl: string;
  defaultModels: string[];
  /** OpenRouter asks callers to name themselves; see ATTRIBUTION. */
  sendsAttribution?: boolean;
}

/** The apps whose features may fall back. Each holds its own keys. */
const BACKUP_APPS = new Set(['nexus', 'marketing']);

/** Who is calling, per app, for providers that ask. */
const ATTRIBUTION: Record<string, Record<string, string>> = {
  nexus: { 'X-Title': 'Neram Nexus', 'HTTP-Referer': 'https://nexus.neramclasses.com' },
  marketing: { 'X-Title': 'Neram Classes', 'HTTP-Referer': 'https://neramclasses.com' },
};

/** Model ids checked against each provider's live list on 2026-10-15. */
export const BACKUP_PROVIDERS: Provider[] = [
  {
    id: 'groq',
    keyEnv: 'GROQ_API_KEY',
    modelsEnv: 'GROQ_MODELS',
    baseUrl: 'https://api.groq.com/openai/v1',
    // Groq no longer serves a Llama chat model. Each model has its own limit,
    // so the second one is a real second chance, not the same wall.
    defaultModels: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'],
  },
  {
    id: 'openrouter',
    keyEnv: 'OPENROUTER_API_KEY',
    modelsEnv: 'OPENROUTER_MODELS',
    baseUrl: 'https://openrouter.ai/api/v1',
    // No free Llama is left on OpenRouter. Nemotron answered clean JSON in
    // under five seconds; Gemma's free pool is often busy; openrouter/free lets
    // OpenRouter pick whichever free model is up.
    defaultModels: [
      'nvidia/nemotron-3-super-120b-a12b:free',
      'google/gemma-4-31b-it:free',
      'openrouter/free',
    ],
    sendsAttribution: true,
  },
];

/** The longest single rate-limit wait worth taking inside one request. */
const MAX_RATE_LIMIT_WAIT_MS = 20_000;

/**
 * How much of one tool result to pass on as text. A college lookup can run to
 * many kilobytes, and free tiers count every token against a small allowance.
 */
const MAX_TOOL_TEXT_CHARS = 6_000;

function allParts(opts: GenerateOptions): GeminiPart[] {
  const contents: GeminiContent[] = opts.contents ?? [{ parts: opts.parts ?? [] }];
  return contents.flatMap((c) => c.parts ?? []);
}

function configuredProviders(): Provider[] {
  return BACKUP_PROVIDERS.filter((p) => !!process.env[p.keyEnv]);
}

/**
 * May this call be answered by a backup provider at all?
 *
 * Reasons it may not are returned rather than a bare false, so the caller can
 * log why a failure was not rescued.
 */
export function backupEligibility(opts: GenerateOptions, app: string): { ok: true } | { ok: false; reason: string } {
  if (!BACKUP_APPS.has(app)) return { ok: false, reason: `not a ${[...BACKUP_APPS].join(' or ')} feature` };
  const dropsTools = dropsToolsFor(opts);
  if (opts.tools?.length && !dropsTools) return { ok: false, reason: 'uses tool calls' };
  const parts = allParts(opts);
  if (parts.some((p) => p.inline_data)) return { ok: false, reason: 'carries an image or file' };
  if (!dropsTools && parts.some((p) => p.functionCall || p.functionResponse)) {
    return { ok: false, reason: 'replays a tool call' };
  }
  if (configuredProviders().length === 0) return { ok: false, reason: 'no backup key set' };
  return { ok: true };
}

function dropsToolsFor(opts: GenerateOptions): boolean {
  return featureById(opts.feature)?.backupDropsTools === true;
}

function clip(text: string): string {
  return text.length > MAX_TOOL_TEXT_CHARS ? `${text.slice(0, MAX_TOOL_TEXT_CHARS)} ...(cut)` : text;
}

/** One Gemini part as plain text: tool calls and results are spelled out. */
function partText(p: GeminiPart): string {
  if (p.functionCall) return `[Looked up ${p.functionCall.name} with ${JSON.stringify(p.functionCall.args ?? {})}]`;
  if (p.functionResponse) {
    return `[Result of ${p.functionResponse.name}: ${clip(JSON.stringify(p.functionResponse.response ?? null))}]`;
  }
  return p.text ?? '';
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Gemini's request, as OpenAI-style chat messages. */
export function toChatMessages(opts: GenerateOptions): ChatMessage[] {
  const wantsJson = (opts.responseMimeType ?? 'application/json') !== 'text/plain';
  const system: string[] = [];
  if (opts.systemInstruction) system.push(opts.systemInstruction.trim());
  if (wantsJson) {
    // json_object mode refuses a request that never says "json", and Gemini's
    // schema has no equivalent here, so it is stated in words instead.
    system.push('Respond with a single valid JSON object only, no commentary and no code fences.');
    if (opts.responseSchema) {
      system.push(`The JSON must follow this schema: ${JSON.stringify(opts.responseSchema)}`);
    }
  }
  if (dropsToolsFor(opts)) {
    // The prompt was written for a model that can look things up. Without
    // that, it must not promise a search it cannot run.
    system.push(
      'Lookup tools are not available right now. Answer from the information above and any results already ' +
        'shown in the conversation. If you do not have a specific figure, say so and suggest the visitor ' +
        'contact the team rather than guess.',
    );
  }

  const messages: ChatMessage[] = [];
  if (system.length) messages.push({ role: 'system', content: system.join('\n\n') });

  const contents: GeminiContent[] = opts.contents ?? [{ role: 'user', parts: opts.parts ?? [] }];
  for (const c of contents) {
    const text = (c.parts ?? [])
      .filter((p) => !p.thought)
      .map(partText)
      .join('\n')
      .trim();
    if (!text) continue;
    messages.push({ role: c.role === 'model' ? 'assistant' : 'user', content: text });
  }
  return messages;
}

function finishReasonOf(reason: string | undefined): string {
  if (reason === 'stop') return 'STOP';
  if (reason === 'length') return 'MAX_TOKENS';
  if (reason === 'content_filter') return 'SAFETY';
  return reason ? reason.toUpperCase() : 'UNKNOWN';
}

/** Seconds from a 429's retry-after header, or null when absent or unreadable. */
function retryAfterMs(res: Response): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const s = Number(raw);
  return Number.isFinite(s) && s >= 0 ? Math.ceil(s * 1000) : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ReadChoice {
  text: string;
  finishReason: string;
  promptTokens: number;
  outputTokens: number;
}

async function readChoice(res: Response): Promise<ReadChoice> {
  const data = await res.json();
  const choice = data?.choices?.[0];
  return {
    text: String(choice?.message?.content ?? ''),
    finishReason: finishReasonOf(choice?.finish_reason),
    promptTokens: data?.usage?.prompt_tokens ?? 0,
    outputTokens: data?.usage?.completion_tokens ?? 0,
  };
}

/**
 * Reads an OpenAI-style `stream: true` body. Reasoning deltas (gpt-oss sends
 * them as `delta.reasoning`) are not part of the answer and are skipped.
 * Usage arrives on the last chunk: as `usage` (OpenRouter, and Groq with
 * stream_options) or as `x_groq.usage` on older Groq responses.
 */
async function readStreamedChoice(res: Response, onText: (delta: string) => void): Promise<ReadChoice> {
  let text = '';
  let finishReason = 'UNKNOWN';
  let promptTokens = 0;
  let outputTokens = 0;

  try {
    await readSse(res, (data) => {
      if (data.trim() === '[DONE]') return;
      let chunk: {
        choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        x_groq?: { usage?: { prompt_tokens?: number; completion_tokens?: number } };
      };
      try {
        chunk = JSON.parse(data);
      } catch {
        return;
      }
      const choice = chunk?.choices?.[0];
      const delta = choice?.delta?.content;
      if (delta) {
        // Hold back leading whitespace so a model that opens with a newline
        // does not count as "already answered" when it then sends nothing.
        if (text || delta.trim()) onText(text ? delta : delta.replace(/^\s+/, ''));
        text += delta;
      }
      if (choice?.finish_reason) finishReason = finishReasonOf(choice.finish_reason);
      const usage = chunk?.usage ?? chunk?.x_groq?.usage;
      if (usage) {
        promptTokens = usage.prompt_tokens ?? promptTokens;
        outputTokens = usage.completion_tokens ?? outputTokens;
      }
    });
  } catch (err) {
    if (!text.trim()) throw err;
    console.error('[ai] backup stream dropped mid-answer:', err);
    finishReason = 'INTERRUPTED';
  }

  return { text, finishReason, promptTokens, outputTokens };
}

export interface BackupAttemptLog {
  provider: string;
  model: string;
  status: number;
}

interface BackupDeps {
  sleep?: (ms: number) => Promise<void>;
  app?: string;
  /** Stream the answer: each text delta is handed over as it arrives. */
  onText?: (delta: string) => void;
}

/**
 * generateWithBackup, streamed. The same providers in the same order; the only
 * difference is that the visitor sees the answer as it is written.
 *
 * Matters more than it sounds: while Gemini is out of credit (402 since
 * 2026-10-11) every site chatbot answer comes from here, so without this the
 * chat would never stream at all.
 */
export function streamWithBackup(
  opts: GenerateOptions,
  deps: BackupDeps & { onText: (delta: string) => void },
): Promise<GeminiResult & { attempts: BackupAttemptLog[] }> {
  return generateWithBackup(opts, deps);
}

/**
 * Try every configured backup model in order. Returns the first answer, or
 * throws an Error naming the last failure. Never logs usage itself: the caller
 * owns metering, so the rows look exactly like Gemini's.
 */
export async function generateWithBackup(
  opts: GenerateOptions,
  deps: BackupDeps = {},
): Promise<GeminiResult & { attempts: BackupAttemptLog[] }> {
  const wait = deps.sleep ?? sleep;
  const wantsJson = (opts.responseMimeType ?? 'application/json') !== 'text/plain';
  const messages = toChatMessages(opts);
  const attempts: BackupAttemptLog[] = [];

  for (const provider of configuredProviders()) {
    const key = process.env[provider.keyEnv] as string;
    const fromEnv = (process.env[provider.modelsEnv] || '')
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
    const models = fromEnv.length ? fromEnv : provider.defaultModels;

    for (const model of models) {
      let waited = false;
      // At most two tries per model: the first, and one after a short 429 wait.
      for (;;) {
        const isReasoner = model.startsWith('openai/gpt-oss');
        const res = await fetch(`${provider.baseUrl}/chat/completions`, {
          cache: 'no-store',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${key}`,
            ...(provider.sendsAttribution ? ATTRIBUTION[deps.app ?? 'nexus'] ?? {} : {}),
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: opts.temperature ?? 0.4,
            // A reasoning model spends part of this on thinking, so give it
            // room rather than truncate the answer mid-JSON.
            max_tokens: Math.max(opts.maxOutputTokens ?? 4096, isReasoner ? 8192 : 0),
            ...(isReasoner ? { reasoning_effort: 'low' } : {}),
            ...(wantsJson ? { response_format: { type: 'json_object' } } : {}),
            ...(deps.onText ? { stream: true, stream_options: { include_usage: true } } : {}),
          }),
        });

        attempts.push({ provider: provider.id, model, status: res.status });

        if (res.ok) {
          const read = deps.onText ? await readStreamedChoice(res, deps.onText) : await readChoice(res);
          const text = read.text.trim();
          if (!text) break; // try the next model (nothing reached the visitor yet)
          const { promptTokens, outputTokens } = read;
          return {
            text,
            model: `${provider.id}/${model}`,
            usage: { promptTokens, outputTokens, totalTokens: promptTokens + outputTokens },
            costUsd: 0,
            keyTier: 'free',
            functionCalls: [],
            modelParts: [{ text }],
            finishReason: read.finishReason,
            attempts,
          };
        }

        if (res.status === 429 && !waited) {
          const ms = retryAfterMs(res);
          if (ms !== null && ms <= MAX_RATE_LIMIT_WAIT_MS) {
            waited = true;
            await wait(ms);
            continue;
          }
        }
        // A rejected key cannot be fixed by another model on the same provider.
        if (res.status === 401 || res.status === 403) {
          console.error(`[ai] backup ${provider.id} key rejected (${res.status}). Check ${provider.keyEnv}.`);
          break;
        }
        break;
      }
      // 413: the request is over this provider's per-request limit (Groq's free
      // tier is about 8,000 tokens; the site chatbot's prompt is bigger). The
      // prompt is the same for the next model, so move on to the next provider.
      const last = attempts[attempts.length - 1];
      if (last && (last.status === 401 || last.status === 403 || last.status === 413)) break;
    }
  }

  const last = attempts[attempts.length - 1];
  throw new Error(
    last
      ? `Backup AI failed (last: ${last.provider}/${last.model} ${last.status})`
      : 'Backup AI failed (no provider answered)',
  );
}
