/**
 * Writes a college's FAQs. The template answers from intents.ts are the drafts;
 * Gemini rewords them so pages do not read word-for-word alike (feature
 * admin.college-faq-write). validate.ts holds every reworded answer to the
 * facts, and any intent the AI dropped or got wrong keeps its template answer.
 *
 * So the output is never worse than the templates, and never contains a
 * number that is not in our data.
 */
import { AiBlockedError, generateGeminiText } from '@neram/ai';
import type { Facts } from './facts';
import { applicableIntents, ctxFor, intentKeys, templateFaqs, type Faq } from './intents';
import { checkFaq } from './validate';
import { parseJsonObject } from '../college-photos/judge';

export const MAX_FAQS = 20;

const SYSTEM = `You polish the FAQ section of a college page on an Indian architecture-admissions website. Students read it on their phones, and AI search engines quote it.

You get, for each intent, a draft question and a draft answer that are already correct. Rewrite each one so it reads naturally and is not word-for-word the same as other college pages.

Rules:
- Keep every fact in the draft. Add nothing: no number, fee, date, rank, cutoff, name or claim that is not in the draft or the facts.
- The question: how an Indian student would type it into Google, using the college's short name.
- The answer: the first sentence answers the question directly. 25 to 80 words in total.
- No filler. Never write sentences like "This number indicates...", "This provides students with...", "The provided information does not include...". If you have nothing to add, keep the draft.
- No marketing words ("best", "top", "renowned") and no opinions.
- Never use em dashes, en dashes or double hyphens. Use commas, colons or full stops.
- Copy amounts exactly as written (for example "₹1.25 lakh", "₹45,000").`;

/** The answer Neram writes itself, not to be reworded. */
const TEMPLATE_ONLY = new Set(['preparation', 'eligibility']);

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    faqs: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { intent: { type: 'STRING' }, question: { type: 'STRING' }, answer: { type: 'STRING' } },
        required: ['intent', 'question', 'answer'],
      },
    },
  },
  required: ['faqs'],
};

export interface WriteResult {
  faqs: Faq[];
  ai: number;
  template: number;
  /** The AI was wanted but blocked or failing; the caller should retry later. */
  aiUnavailable: boolean;
  rejected: { intent: string; reason: string }[];
}

export async function writeFaqs(f: Facts, opts: { useAi?: boolean; now?: Date } = {}): Promise<WriteResult> {
  const now = opts.now ?? new Date();
  const ctx = ctxFor(f, now);
  const intents = applicableIntents(f);
  const templates = new Map(templateFaqs(f, now).map((t) => [t.intent, t]));
  const rejected: WriteResult['rejected'] = [];
  const aiByIntent = new Map<string, Faq>();
  let aiUnavailable = false;

  if (opts.useAi !== false && intents.length > 0) {
    try {
      const raw = await generateGeminiText({
        feature: 'admin.college-faq-write',
        systemInstruction: SYSTEM,
        parts: [
          {
            text: JSON.stringify({
              college: ctx.n,
              drafts: [...templates.values()]
                .filter((t) => !TEMPLATE_ONLY.has(t.intent))
                .map((t) => ({ intent: t.intent, question: t.question, answer: t.answer })),
              facts: f,
            }),
          },
        ],
        temperature: 0.4,
        maxOutputTokens: 8192,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      });
      const parsed = parseJsonObject(raw) as { faqs?: { intent?: string; question?: string; answer?: string }[] };
      for (const item of parsed.faqs ?? []) {
        const intent = intents.find((i) => i.id === item.intent);
        if (!intent || TEMPLATE_ONLY.has(intent.id) || aiByIntent.has(intent.id)) continue;
        aiByIntent.set(intent.id, {
          intent: intent.id,
          question: String(item.question ?? '').trim(),
          answer: String(item.answer ?? '').replace(/\s+/g, ' ').trim(),
          fact_keys: intentKeys(intent, f),
        });
      }
    } catch (err) {
      aiUnavailable = true;
      if (!(err instanceof AiBlockedError)) console.warn('[college-content] FAQ writer failed:', (err as Error).message);
    }
  }

  const seen = new Set<string>();
  const faqs: Faq[] = [];
  let ai = 0;
  let template = 0;
  for (const intent of intents) {
    const candidate = aiByIntent.get(intent.id);
    if (candidate) {
      const why = checkFaq(candidate, f, ctx.year, seen);
      if (!why) {
        faqs.push({ ...candidate, source: 'ai' });
        ai++;
        continue;
      }
      rejected.push({ intent: intent.id, reason: why });
    }
    const t = templates.get(intent.id);
    if (t && !checkFaq(t, f, ctx.year, seen)) {
      faqs.push({ ...t, source: 'template' });
      template++;
    } else if (t) {
      rejected.push({ intent: intent.id, reason: 'template failed validation' });
    }
  }
  return { faqs: faqs.slice(0, MAX_FAQS), ai, template, rejected, aiUnavailable };
}
