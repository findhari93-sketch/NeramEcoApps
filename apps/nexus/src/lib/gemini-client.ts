/**
 * One place that calls Gemini, so every caller inherits the same fallback order
 * and, more importantly, the same error vocabulary.
 *
 * Lifted verbatim out of lib/class-summary-ai, which had grown the only correct
 * handling of Gemini's status codes in the app while drawing-ai and exam-recall-ai
 * each carried a slightly different copy. The distinctions matter and are easy to
 * get wrong:
 *
 *  - 400 and 403 are the KEY being wrong, not the request. Retrying a second
 *    model with a bad key just makes three failing calls instead of one, so
 *    these throw immediately.
 *  - 404 is that model being retired, which Google does without warning. Fall
 *    through to the next one.
 *  - 429 is the shared free-tier quota, and it is the common case here: one
 *    GEMINI_API_KEY serves class recaps, drawing feedback, summaries and now
 *    YouTube metadata, so a busy afternoon rate-limits all of them together.
 *    Try the next model, and if they are all limited say so explicitly, because
 *    callers key their fallback behaviour off the string '429'.
 *
 * The key is read at CALL time, not at import time. class-summary-ai reads it
 * into a module constant, which is why its test needs a vi.hoisted block to set
 * the env before the import is evaluated. Reading it here per call means a test
 * can just set process.env and callers get no such trap.
 */

/** Same fallback order drawing-ai uses; the first that answers wins. */
export const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite'];

export interface GeminiPart {
  text?: string;
  inline_data?: { mime_type: string; data: string };
}

export interface GeminiRequest {
  /** Text and/or inline images, in the order the model should see them. */
  parts: GeminiPart[];
  systemInstruction?: string;
  temperature?: number;
  maxOutputTokens?: number;
  /** Set 'application/json' to make the model answer with parseable JSON. */
  responseMimeType?: string;
  /** Override the cascade, mostly for tests. */
  models?: string[];
}

/**
 * Call Gemini and return the raw text of the first candidate.
 *
 * Parsing is deliberately the caller's job: the two callers want different
 * shapes out of the same transport, and a shared parser here would have to know
 * about both.
 *
 * Throws on every failure. The message is part of the contract:
 *  - contains '429' when every model is rate limited
 *  - mentions GEMINI_API_KEY when the key itself is the problem
 */
export async function generateGeminiText(req: GeminiRequest): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const models = req.models?.length ? req.models : GEMINI_MODELS;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: req.parts }],
        ...(req.systemInstruction
          ? { systemInstruction: { parts: [{ text: req.systemInstruction }] } }
          : {}),
        generationConfig: {
          responseMimeType: req.responseMimeType ?? 'application/json',
          temperature: req.temperature ?? 0.4,
          maxOutputTokens: req.maxOutputTokens ?? 4096,
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      if (!text) throw new Error('AI returned an empty response');
      return text;
    }

    const errBody = await res.json().catch(() => ({}));

    // The key, not the request. A second model would fail identically.
    if (res.status === 400 || res.status === 403) {
      console.error(`Gemini auth error (${res.status}):`, JSON.stringify(errBody));
      throw new Error(
        `Gemini API key invalid or unauthorized (${res.status}). Check GEMINI_API_KEY.`,
      );
    }

    // 404 (model retired) or 429 (shared quota): try the next model, then give up.
    if (res.status === 404 || res.status === 429) {
      if (i < models.length - 1) continue;
      if (res.status === 429) throw new Error('Gemini API 429: rate limit reached on all models');
    }

    console.error(`Gemini error (${res.status}) on ${model}:`, JSON.stringify(errBody));
    throw new Error(`Gemini API error: ${res.status}`);
  }

  throw new Error('Gemini API: all models exhausted');
}
