/**
 * Every AI feature in the ecosystem, in one list.
 *
 * Deliberately shaped like apps/nexus/src/lib/feature-flags.ts, because the
 * admin already understands that page: a registry of definitions in code, a
 * partial map of overrides in a nexus_settings JSONB row, and defaults that
 * apply when an override is missing. Read that file before changing this one.
 *
 * The difference is that a feature flag is on or off, while an AI feature has
 * three states, because "off" was too blunt. A teacher who cannot generate a
 * chapter test is stuck; a teacher who is handed the prompt to paste into a
 * chat app is merely inconvenienced. So:
 *
 *   auto    call Gemini, spend money
 *   manual  build the prompt, return it, spend nothing (see buildManualPrompt)
 *   off     refuse, for features that have no sensible manual path
 *
 * Two rules that are easy to get wrong:
 *
 * 1. `id` is required on every Gemini call and is a typed union, so a typo is a
 *    compile error rather than a usage row filed under a feature that does not
 *    exist. Attribution is the whole point; a mis-filed row makes the panel lie.
 *
 * 2. `tier` lives here, not at the call site. Callers used to name models
 *    inline, which is how five of them ended up pinned to models Google had
 *    already shut down. See pricing.ts.
 */

import type { AiTier } from './pricing';

export type AiMode = 'auto' | 'manual' | 'off';

export type AiApp = 'marketing' | 'nexus' | 'admin';

/** Who causes the call. Informational, but it is what the panel groups by. */
export type AiTrigger = 'public' | 'staff' | 'student' | 'cron';

export interface AiFeatureDef {
  /** Stable id, persisted in usage rows and in the overrides map. */
  id: string;
  /** Human label, shown in the control panel and in manual-mode messages. */
  label: string;
  app: AiApp;
  /** Section heading in the control panel. */
  group: string;
  trigger: AiTrigger;
  /** Which model cascade to use. See TIER_MODELS in pricing.ts. */
  tier: AiTier;
  defaultMode: AiMode;
  /**
   * Whether returning the prompt for a human to run is a real option. False for
   * the public chatbots: a visitor cannot be handed a prompt, so their only
   * states are auto and off.
   */
  supportsManual: boolean;
  /**
   * Whether this feature may be served by the unbilled free-tier key.
   * Free-tier inputs are used by Google to improve their products, so anything
   * carrying student work, transcripts or personal data sets this false.
   */
  allowFreeKey: boolean;
  /** Optional per-feature ceiling, checked by the budget guard. */
  dailyCallCap?: number;
  /**
   * Calls one visitor may make per hour. Public chatbots only.
   *
   * The feature-wide dailyCallCap protects the budget; this protects it from
   * being spent by one person. Without it a single script hitting an
   * unauthenticated endpoint reaches the feature cap on its own and every real
   * visitor is locked out for the rest of the day.
   */
  perClientHourlyCap?: number;
}

/** The nexus_settings row that holds the overrides. */
export const AI_CONTROLS_KEY = 'ai_controls';

export const AI_FEATURES = [
  // ── Marketing: public, unauthenticated, highest volume ───────────────────
  /**
   * Mounted in [locale]/layout.tsx, so it is live on every page of the public
   * site. It also runs a tool loop, so one visitor message is up to four
   * Gemini calls. Highest spender in the ecosystem by a wide margin, and the
   * reason the daily cap exists. Cheap tier is not a compromise here: it
   * answers questions about courses from a supplied knowledge base.
   */
  {
    id: 'marketing.site-chat',
    label: 'Site chatbot (every page)',
    app: 'marketing',
    group: 'Public chatbots',
    trigger: 'public',
    tier: 'cheap',
    defaultMode: 'auto',
    supportsManual: false,
    allowFreeKey: true,
    dailyCallCap: 2000,
    perClientHourlyCap: 30,
  },
  {
    id: 'marketing.nata-chat',
    label: 'NATA chatbot',
    app: 'marketing',
    group: 'Public chatbots',
    trigger: 'public',
    tier: 'cheap',
    defaultMode: 'auto',
    supportsManual: false,
    allowFreeKey: true,
    dailyCallCap: 1000,
    perClientHourlyCap: 30,
  },
  {
    id: 'marketing.college-aintra',
    label: 'Aintra on college pages',
    app: 'marketing',
    group: 'Public chatbots',
    trigger: 'public',
    tier: 'cheap',
    defaultMode: 'auto',
    supportsManual: false,
    allowFreeKey: true,
    dailyCallCap: 500,
    perClientHourlyCap: 20,
  },
  {
    id: 'marketing.tnea-aintra',
    label: 'Aintra on TNEA pages',
    app: 'marketing',
    group: 'Public chatbots',
    trigger: 'public',
    tier: 'cheap',
    defaultMode: 'auto',
    supportsManual: false,
    allowFreeKey: true,
    dailyCallCap: 500,
    perClientHourlyCap: 20,
  },
  {
    id: 'marketing.keam-aintra',
    label: 'Aintra on KEAM pages',
    app: 'marketing',
    group: 'Public chatbots',
    trigger: 'public',
    tier: 'cheap',
    defaultMode: 'auto',
    supportsManual: false,
    allowFreeKey: true,
    dailyCallCap: 500,
    perClientHourlyCap: 20,
  },

  // ── Admin: staff-triggered, low volume ───────────────────────────────────
  {
    id: 'admin.chat-review',
    label: 'AI review of a chat log',
    app: 'admin',
    group: 'Admin tools',
    trigger: 'staff',
    tier: 'standard',
    defaultMode: 'auto',
    supportsManual: true,
    allowFreeKey: true,
  },
  {
    id: 'admin.kb-refine',
    label: 'Refine a knowledge base correction',
    app: 'admin',
    group: 'Admin tools',
    trigger: 'staff',
    tier: 'cheap',
    defaultMode: 'auto',
    supportsManual: true,
    allowFreeKey: true,
  },

  // ── Nexus: teaching content. Carries student data, so no free key. ───────
  /**
   * Shared by five routes (recap preview, recap autopublish, module items,
   * foundation chapters, video-track checkpoints) plus the nightly autodraft
   * cron, all through generateSectionsAndQuestions. Each caller passes its own
   * id so the panel can tell a teacher pressing a button apart from a cron.
   */
  {
    id: 'nexus.recap-questions',
    label: 'Class recap questions',
    app: 'nexus',
    group: 'Class content',
    trigger: 'staff',
    tier: 'standard',
    defaultMode: 'auto',
    supportsManual: true,
    allowFreeKey: false,
  },
  {
    id: 'nexus.recap-questions-cron',
    label: 'Class recap questions (nightly)',
    app: 'nexus',
    group: 'Class content',
    trigger: 'cron',
    tier: 'standard',
    defaultMode: 'auto',
    supportsManual: false,
    allowFreeKey: false,
    dailyCallCap: 60,
  },
  {
    id: 'nexus.class-summary',
    label: 'Class wrap-up summary',
    app: 'nexus',
    group: 'Class content',
    trigger: 'staff',
    tier: 'standard',
    defaultMode: 'auto',
    supportsManual: true,
    allowFreeKey: false,
  },
  {
    id: 'nexus.video-meta',
    label: 'YouTube listing metadata',
    app: 'nexus',
    group: 'Class content',
    trigger: 'staff',
    tier: 'cheap',
    defaultMode: 'auto',
    supportsManual: true,
    allowFreeKey: false,
  },
  {
    id: 'nexus.module-autogen',
    label: 'Module item auto-generate',
    app: 'nexus',
    group: 'Study materials',
    trigger: 'staff',
    tier: 'standard',
    defaultMode: 'auto',
    supportsManual: true,
    allowFreeKey: false,
  },
  {
    id: 'nexus.foundation-autogen',
    label: 'Foundation chapter auto-generate',
    app: 'nexus',
    group: 'Study materials',
    trigger: 'staff',
    tier: 'standard',
    defaultMode: 'auto',
    supportsManual: true,
    allowFreeKey: false,
  },
  {
    id: 'nexus.video-checkpoints',
    label: 'Video track checkpoints',
    app: 'nexus',
    group: 'Study materials',
    trigger: 'staff',
    tier: 'standard',
    defaultMode: 'auto',
    supportsManual: true,
    allowFreeKey: false,
  },
  /**
   * Sends a whole chapter PDF inline, up to 14 MB. Expensive per call, and
   * GenerateFolderTestsDialog fires it once per chapter in a folder, so one
   * press can be a dozen calls. The obvious candidate for manual mode on a
   * tight month.
   */
  {
    id: 'nexus.chapter-test',
    label: 'Generate a test from a chapter PDF',
    app: 'nexus',
    group: 'Study materials',
    trigger: 'staff',
    tier: 'document',
    defaultMode: 'auto',
    supportsManual: true,
    allowFreeKey: false,
    dailyCallCap: 40,
  },
  /**
   * The test wizard's Generate step, split in two by what it reads.
   *
   * Two ids rather than one because the spend differs by an order of magnitude:
   * a topic prompt is a few hundred input tokens, a 42-page PDF is eleven
   * thousand. Collapsed into one row, the control panel could not show which of
   * the two actually emptied the month, and switching the expensive one to
   * manual would have taken the cheap one down with it.
   */
  {
    id: 'nexus.test-wizard-generate',
    label: 'Generate test questions from a topic or class recording',
    app: 'nexus',
    group: 'Study materials',
    trigger: 'staff',
    tier: 'standard',
    defaultMode: 'auto',
    supportsManual: true,
    // The recording branch sends a class transcript, which is students talking.
    // Free-tier inputs train Google's models, so this can never use that key.
    allowFreeKey: false,
    dailyCallCap: 60,
  },
  {
    id: 'nexus.test-wizard-generate-doc',
    label: 'Generate test questions from a chapter PDF in the wizard',
    app: 'nexus',
    group: 'Study materials',
    trigger: 'staff',
    tier: 'document',
    defaultMode: 'auto',
    supportsManual: true,
    allowFreeKey: false,
    dailyCallCap: 40,
  },
  /**
   * The only student-triggered feature that scales with the student body.
   * Already caches its answer onto the question row, so the second student to
   * ask about the same question costs nothing.
   */
  {
    id: 'nexus.answer-explain',
    label: 'Explain an answer in detail',
    app: 'nexus',
    group: 'Student tools',
    trigger: 'student',
    tier: 'cheap',
    defaultMode: 'auto',
    supportsManual: false,
    allowFreeKey: false,
    dailyCallCap: 300,
  },
  {
    id: 'nexus.exam-recall-ocr',
    label: 'Read questions from an exam photo',
    app: 'nexus',
    group: 'Student tools',
    trigger: 'student',
    tier: 'document',
    defaultMode: 'auto',
    supportsManual: false,
    allowFreeKey: false,
    dailyCallCap: 200,
  },
  {
    id: 'nexus.exam-recall-match',
    label: 'Match a recalled question',
    app: 'nexus',
    group: 'Student tools',
    trigger: 'student',
    tier: 'cheap',
    defaultMode: 'auto',
    supportsManual: false,
    allowFreeKey: false,
    dailyCallCap: 200,
  },
] as const satisfies readonly AiFeatureDef[];

/**
 * The union of valid ids. This is what makes `feature` un-typo-able at call
 * sites, which is what makes the panel's per-feature numbers trustworthy.
 */
export type AiFeatureId = (typeof AI_FEATURES)[number]['id'];

const BY_ID = new Map<string, AiFeatureDef>(AI_FEATURES.map((f) => [f.id, f as AiFeatureDef]));

export function featureById(id: string): AiFeatureDef | undefined {
  return BY_ID.get(id);
}

/**
 * The full contents of the nexus_settings 'ai_controls' row.
 *
 * Caps are in USD because that is the unit Google bills and prices in. The
 * panel converts to rupees for display using usdToInr, which is stored rather
 * than hardcoded so a rate change does not need a deploy.
 */
export interface AiControls {
  /** The kill switch. False stops every AI call in every app immediately. */
  masterEnabled: boolean;
  monthlyCapUsd: number;
  dailyCapUsd: number;
  usdToInr: number;
  /** Sparse overrides of each feature's defaultMode. */
  modes: Record<string, AiMode>;
}

/**
 * Deliberately low. A cap that has to be raised on the first busy day is
 * working; a cap set high enough to never notice is decoration. Google's own
 * project-level cap is the outer backstop, this is the one with per-feature
 * attribution behind it.
 */
export const DEFAULT_AI_CONTROLS: AiControls = {
  masterEnabled: true,
  monthlyCapUsd: 25,
  dailyCapUsd: 2,
  usdToInr: 88,
  modes: {},
};

/** Merges a stored partial over the defaults. Mirrors resolveFlags(). */
export function resolveControls(stored: unknown): AiControls {
  const raw = (stored ?? {}) as Partial<AiControls>;
  return {
    masterEnabled: raw.masterEnabled ?? DEFAULT_AI_CONTROLS.masterEnabled,
    monthlyCapUsd: numberOr(raw.monthlyCapUsd, DEFAULT_AI_CONTROLS.monthlyCapUsd),
    dailyCapUsd: numberOr(raw.dailyCapUsd, DEFAULT_AI_CONTROLS.dailyCapUsd),
    usdToInr: numberOr(raw.usdToInr, DEFAULT_AI_CONTROLS.usdToInr),
    modes: { ...(raw.modes ?? {}) },
  };
}

/**
 * A feature's effective mode.
 *
 * An unknown id resolves to 'off', the opposite of isFeatureEnabled() in
 * feature-flags.ts, which lets unknown ids through. The reasoning is inverted
 * because the stakes are: an unrecognised nav path should still render, but an
 * unrecognised id asking to spend money is a bug, and a bug should not bill.
 */
export function modeFor(id: string, controls: AiControls): AiMode {
  if (!controls.masterEnabled) return 'off';
  const def = BY_ID.get(id);
  if (!def) return 'off';
  return controls.modes[id] ?? def.defaultMode;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}
