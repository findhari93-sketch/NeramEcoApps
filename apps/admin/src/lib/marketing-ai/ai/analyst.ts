/**
 * The AI half of the agent, behind an interface so the provider can change
 * without touching rules, recommendations or the UI (spec §8).
 *
 * Today there is one adapter, over @neram/ai's generateGemini, because that is
 * the ecosystem's single gated door to a model: it applies the monthly and
 * daily budget, logs usage to ai_usage_events and picks the model by tier. A
 * Claude adapter would implement AnalystModel and be chosen in createAnalyst.
 *
 * Callers must treat every method as optional: an AiBlockedError (budget) or a
 * model failure resolves to an empty result, never a thrown error, because a
 * night without AI text is still a useful night of rules.
 */

import { AiBlockedError, generateGemini } from '@neram/ai';
import type { Aggregate } from '../metrics';
import type { IntentLabel } from '../rules';
import type { Evidence, Finding } from '../types';
import { examCycleYear } from '../config';
import { adCopySystem, classifySystem, defaultPromptContext, explainSystem, weeklySystem, type PromptContext } from './prompts';
import { validateAdCopy, validateAssessments, validateIntents, validateWeekly } from './validate';

export interface AiUsage {
  provider: string;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  calls: number;
  blocked: string | null;
  errors: string[];
}

export interface AdCopyInput {
  adGroupName: string;
  keywords: string[];
  searchTerms: string[];
}

export interface WeeklyInput {
  weekStart: string;
  endDate: string;
  facts: Record<string, number | null>;
  changes: string[];
}

export interface AnalystModel {
  readonly provider: string;
  weeklyReport(input: WeeklyInput): Promise<{ summary: string; next_steps: string[] } | null>;
  classifySearchTerms(terms: Aggregate[]): Promise<Map<string, IntentLabel>>;
  explainFindings(findings: Finding[]): Promise<Map<string, string>>;
  draftAdCopy(input: AdCopyInput): Promise<{ headlines: string[]; descriptions: string[] } | null>;
  usage(): AiUsage;
}

/** The low-level call an adapter needs. Injected so tests never reach a model. */
export type GenerateFn = (opts: {
  system: string;
  user: string;
  schema: unknown;
  maxOutputTokens: number;
}) => Promise<{ text: string; model: string; tokensIn: number; tokensOut: number; costUsd: number | null }>;

const geminiGenerate: GenerateFn = async ({ system, user, schema, maxOutputTokens }) => {
  const r = await generateGemini({
    feature: 'admin.ads-analyst',
    systemInstruction: system,
    parts: [{ text: user }],
    temperature: 0.2,
    maxOutputTokens,
    responseSchema: schema,
  });
  return { text: r.text, model: r.model, tokensIn: r.usage.promptTokens, tokensOut: r.usage.outputTokens, costUsd: r.costUsd };
};

const CLASSIFY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    terms: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          intent: { type: 'STRING', enum: ['high_intent', 'research', 'free_seeker', 'job_seeker', 'other_exam', 'other_course', 'competitor', 'unclear'] },
          confidence: { type: 'NUMBER' },
          reason: { type: 'STRING' },
          suggested_negative: { type: 'STRING' },
        },
        required: ['id', 'intent', 'confidence', 'reason'],
      },
    },
  },
  required: ['terms'],
};

const EXPLAIN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    findings: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { id: { type: 'STRING' }, assessment: { type: 'STRING' } }, required: ['id', 'assessment'] },
    },
  },
  required: ['findings'],
};

const WEEKLY_SCHEMA = {
  type: 'OBJECT',
  properties: { summary: { type: 'STRING' }, next_steps: { type: 'ARRAY', items: { type: 'STRING' } } },
  required: ['summary', 'next_steps'],
};

const AD_COPY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    headlines: { type: 'ARRAY', items: { type: 'STRING' } },
    descriptions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['headlines', 'descriptions'],
};

/**
 * A keyword-matching stand-in for mock mode, so local dev and E2E see the full
 * flow (intents, assessments, ad copy) without a model or a Gemini key.
 * Set MARKETING_AI_ANALYST=gemini to run the real model over mock ads data.
 */
const mockGenerate: GenerateFn = async ({ user, schema }) => {
  const json = () => JSON.parse(user.slice(user.indexOf('\n') + 1).trim() || '[]') as any[];
  let out: unknown;
  if (schema === CLASSIFY_SCHEMA) {
    const rules: Array<[RegExp, string, string | null]> = [
      [/\bfree\b/, 'free_seeker', 'free'],
      [/\b(jobs?|vacanc|salary|internship)/, 'job_seeker', 'jobs'],
      [/\bneet\b/, 'other_exam', 'neet'],
      [/jee main(?!.*paper ?2)/, 'other_exam', 'jee main'],
      [/(dq labs|i arch|iarch)/, 'competitor', null],
      [/(coaching|class|mock test|centre)/, 'high_intent', null],
    ];
    out = {
      terms: json().map((t) => {
        const term = String(t.term).toLowerCase();
        const hit = rules.find(([re]) => re.test(term));
        return {
          id: t.id,
          intent: hit ? hit[1] : 'research',
          confidence: hit ? 0.9 : 0.6,
          reason: hit ? `Mock analyst: matched "${hit[0].source}".` : 'Mock analyst: about the exam, not ready to buy.',
          suggested_negative: hit?.[2] ?? '',
        };
      }),
    };
  } else if (schema === WEEKLY_SCHEMA) {
    out = {
      summary: 'Mock report: spend and sign-ups are shown in the numbers below. The agent kept spend within the monthly cap and blocked searches outside what Neram teaches.',
      next_steps: ['Approve the new ad waiting in Recommendations.', 'Check the city advice for the Tamil Nadu campaign.', 'Call every new sign-up within a day.'],
    };
  } else if (schema === EXPLAIN_SCHEMA) {
    out = { findings: json().map((f) => ({ id: f.id, assessment: `Mock assessment: ${f.rule_reason}` })) };
  } else {
    out = {
      headlines: ['NATA Coaching Online', 'Live NATA Classes', 'JEE Paper 2 Coaching', 'NATA Mock Test Series', 'Drawing Practice Daily', 'Classes in Tamil Nadu', 'Join a Free Demo Class', 'Expert Architect Faculty'],
      descriptions: ['Live NATA and JEE Paper 2 classes with daily drawing practice and mock tests.', 'Learn from practising architects. Online and centre classes across Tamil Nadu.', 'Book a free demo class and see how Neram prepares you for NATA 2027.'],
    };
  }
  return { text: JSON.stringify(out), model: 'mock', tokensIn: 0, tokensOut: 0, costUsd: 0 };
};

/** gemini unless the ads data is mocked; MARKETING_AI_ANALYST overrides either way. */
export function analystForEnv(adsMode: 'mock' | 'live', env: Record<string, string | undefined> = process.env, context?: PromptContext): AnalystModel {
  const choice = env.MARKETING_AI_ANALYST || (adsMode === 'mock' ? 'mock' : 'gemini');
  return choice === 'mock' ? createAnalyst(mockGenerate, 'mock', context) : createAnalyst(geminiGenerate, 'gemini', context);
}

/** `context` carries the account profile and the data's end date into every prompt. */
export function createAnalyst(generate: GenerateFn = geminiGenerate, provider = 'gemini', context: PromptContext = defaultPromptContext()): AnalystModel {
  const adRules = { competitors: context.profile.competitors, cycleYear: examCycleYear(context.date) };
  const usage: AiUsage = { provider, model: null, tokensIn: 0, tokensOut: 0, costUsd: 0, calls: 0, blocked: null, errors: [] };

  async function ask(system: string, user: string, schema: unknown, maxOutputTokens: number): Promise<unknown | null> {
    if (usage.blocked) return null;
    try {
      const r = await generate({ system, user, schema, maxOutputTokens });
      usage.calls += 1;
      usage.model = r.model;
      usage.tokensIn += r.tokensIn;
      usage.tokensOut += r.tokensOut;
      usage.costUsd += r.costUsd ?? 0;
      return JSON.parse(r.text);
    } catch (err) {
      if (err instanceof AiBlockedError) {
        usage.blocked = err.reason;
        return null;
      }
      usage.errors.push(err instanceof Error ? err.message.slice(0, 200) : 'unknown');
      return null;
    }
  }

  return {
    provider,
    usage: () => ({ ...usage, errors: [...usage.errors] }),

    async classifySearchTerms(terms) {
      if (!terms.length) return new Map();
      const sent = new Map(terms.map((t) => [t.key, t.text ?? '']));
      const lines = terms.map((t) => ({ id: t.key, term: t.text, clicks: t.clicks, cost_inr: t.cost, campaign: t.campaign_name, ad_group: t.ad_group_name }));
      const raw = await ask(classifySystem(context), `Search terms (JSON):\n${JSON.stringify(lines)}`, CLASSIFY_SCHEMA, 4000);
      return raw ? validateIntents(raw, sent) : new Map();
    },

    async explainFindings(findings) {
      const worth = findings.filter((f) => f.category !== 'insight' || f.priority !== 'low').slice(0, 25);
      if (!worth.length) return new Map();
      const sent = new Map<string, Evidence>(worth.map((f) => [f.dedupeKey, f.evidence]));
      const payload = worth.map((f) => ({ id: f.dedupeKey, title: f.title, rule_reason: f.reason, intent: f.aiIntent ?? undefined, data: f.evidence }));
      const raw = await ask(explainSystem(context), `Findings (JSON):\n${JSON.stringify(payload)}`, EXPLAIN_SCHEMA, 3000);
      return raw ? validateAssessments(raw, sent) : new Map();
    },

    async weeklyReport(input) {
      const raw = await ask(
        weeklySystem(context),
        `Week ${input.weekStart} to ${input.endDate}.\nFacts (JSON):\n${JSON.stringify(input.facts)}\nChanges the agent made:\n${input.changes.map((c) => `- ${c}`).join('\n') || '- none'}`,
        WEEKLY_SCHEMA,
        1200,
      );
      return raw ? validateWeekly(raw, input.facts) : null;
    },

    async draftAdCopy(input) {
      const raw = await ask(adCopySystem(context), `Ad group: ${input.adGroupName}\nKeywords: ${input.keywords.join(', ')}\nSearches that reached it: ${input.searchTerms.join(', ')}`, AD_COPY_SCHEMA, 1200);
      return raw ? validateAdCopy(raw, adRules) : null;
    },
  };
}
