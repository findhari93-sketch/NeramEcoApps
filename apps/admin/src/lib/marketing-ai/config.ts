/**
 * Environment and settings for the Google Ads agent.
 *
 * Every Google Ads credential is server-only. None of these may ever be a
 * NEXT_PUBLIC_* variable: the OAuth client secret and refresh token together are
 * full control of the ad account.
 *
 * Two switches matter most:
 *
 *   GOOGLE_ADS_MODE               mock (default) | live
 *     mock serves fixture data from ads/mock.ts, so local dev, CI and staging
 *     work before API access exists and never touch the real account.
 *
 *   MARKETING_AI_ALLOW_MUTATIONS  'true' only on production
 *     Without it, every mutation and conversion upload is sent with
 *     validateOnly, so Google checks it and changes nothing.
 */

import type { AccountProfile, AgentSettings, ExecutableCategory } from './types';

/** Google Ads REST API version. v25 was current on 2026-10-06; Google sunsets each version about a year after release. */
export const DEFAULT_GOOGLE_ADS_API_VERSION = 'v25';

export interface AdsEnv {
  mode: 'mock' | 'live';
  apiVersion: string;
  /**
   * Optional and ignored by Google since 2026-09-09, when API access moved from
   * developer tokens to the Google Cloud project of the OAuth client. Sent only
   * if set, for older tokens; Google plans to reject it in a future version.
   */
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** The advertiser account, digits only. */
  customerId: string;
  /** Only when the signed-in user reaches the ad account through a manager (MCC) account. Digits only. */
  loginCustomerId: string;
  /**
   * Conversion action ids for the offline uploads (digits only). Phone verified
   * (an OTP-verified sign-up) is the one Google bids for; the others are
   * secondary, for reporting.
   */
  conversionActionPhone: string;
  conversionActionDemo: string;
  conversionActionPaid: string;
  allowMutations: boolean;
}

const digits = (v: string | undefined) => (v || '').replace(/\D/g, '');

export function readAdsEnv(env: Record<string, string | undefined> = process.env): AdsEnv {
  return {
    mode: env.GOOGLE_ADS_MODE === 'live' ? 'live' : 'mock',
    apiVersion: env.GOOGLE_ADS_API_VERSION || DEFAULT_GOOGLE_ADS_API_VERSION,
    developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN || '',
    clientId: env.GOOGLE_ADS_CLIENT_ID || '',
    clientSecret: env.GOOGLE_ADS_CLIENT_SECRET || '',
    refreshToken: env.GOOGLE_ADS_REFRESH_TOKEN || '',
    customerId: digits(env.GOOGLE_ADS_CUSTOMER_ID) || (env.GOOGLE_ADS_MODE === 'live' ? '' : '1234567890'),
    loginCustomerId: digits(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID),
    conversionActionPhone: digits(env.GOOGLE_ADS_CONV_ACTION_PHONE),
    conversionActionDemo: digits(env.GOOGLE_ADS_CONV_ACTION_DEMO),
    conversionActionPaid: digits(env.GOOGLE_ADS_CONV_ACTION_PAID),
    allowMutations: env.MARKETING_AI_ALLOW_MUTATIONS === 'true',
  };
}

/** Names of the live-mode variables that are missing. Empty means ready. */
export function missingLiveEnv(env: AdsEnv): string[] {
  const missing: string[] = [];
  if (!env.clientId) missing.push('GOOGLE_ADS_CLIENT_ID');
  if (!env.clientSecret) missing.push('GOOGLE_ADS_CLIENT_SECRET');
  if (!env.refreshToken) missing.push('GOOGLE_ADS_REFRESH_TOKEN');
  if (!env.customerId) missing.push('GOOGLE_ADS_CUSTOMER_ID');
  return missing;
}

export const SETTINGS_KEYS = ['autonomy', 'targets', 'guardrails', 'profile'] as const;

/**
 * Categories that may run automatically without first earning it, because
 * they only ever reduce spend or block traffic Neram never wants, and each is
 * undoable. Everything else (raises, new keywords, new ads, pausing ads) needs
 * 15 human decisions at 90% approval before it can go automatic.
 */
export const SAFE_AUTO: readonly ExecutableCategory[] = ['add_negative', 'budget_cut', 'pause_keyword', 'bid_cut'];

/** From the account snapshot of 2026-10-06 (apps/admin/Docs/neram-google-ads-account-context.md). */
export const DEFAULT_PROFILE: AccountProfile = {
  brand_facts: [
    'NATA and JEE Paper 2 coaching since 2009',
    '1,000+ students trained',
    'AIR 1 in JEE B.Arch 2024',
    'Faculty: IIT, NIT and SPA alumni and practising architects',
    'Live online and offline (hybrid) classes',
    'Centres across Tamil Nadu (Chennai, Coimbatore, Madurai, Trichy) and Bengaluru',
    'Free demo class',
    'Free app: cutoff calculator, college predictor (5,000+ colleges), question bank, mock tests',
    'Microsoft Education partner',
  ],
  competitors: ['iarch', 'i arch', 'dq labs', 'dq edge', 'dqedge', 'brds', 'aptoinn', 'triarch', 'winarch', 'ada classes', 'adaclasses', 'sri sai'],
  protected_keywords: ['nata coaching'],
  landing_pages: {
    coaching: 'https://neramclasses.com/nata-coaching/tamil-nadu',
    resources: 'https://neramclasses.com/free-resources',
  },
  // Bengaluru is in scope: Neram coaches it online (user, 2026-10-06).
  target_area: 'Tamil Nadu, and Bengaluru for online coaching',
  outside_places: ['hyderabad', 'mumbai', 'delhi', 'pune', 'kolkata', 'kerala', 'kochi', 'trivandrum', 'andhra', 'vizag', 'dubai'],
};

export const DEFAULT_SETTINGS: AgentSettings = {
  // Safe actions automatic from day one (user decision, 2026-10-06).
  autonomy: {
    level: 2,
    kill_switch: false,
    categories: {
      add_negative: 'auto',
      budget_cut: 'auto',
      pause_keyword: 'auto',
      budget_raise: 'approve',
      bid_cut: 'auto',
      bid_raise: 'approve',
      add_keyword: 'approve',
      new_ad: 'approve',
      pause_ad: 'approve',
    },
  },
  // Off-season: the minimum. Admission season (March to June): more room.
  targets: {
    target_cpa_inr: 650,
    monthly_spend_cap_inr: 7000,
    conversions_since: null,
    proxy_history_since: '2026-01-01',
    season: { months: [3, 4, 5, 6], target_cpa_inr: 650, monthly_spend_cap_inr: 40000 },
  },
  guardrails: {
    max_budget_change_pct: 20,
    max_cpc_ceiling_inr: 60,
    max_auto_actions_per_day: 10,
    min_clicks_to_judge: 10,
    auto_min_confidence: 0.85,
    auto_demote_cpa_worsening_pct: 30,
  },
  profile: DEFAULT_PROFILE,
};

/**
 * Hard ceilings no setting can exceed. An admin can make the agent more
 * cautious than this, never less.
 */
export const HARD_LIMITS = {
  max_budget_change_pct: 30,
  max_cpc_ceiling_inr: 200,
  max_auto_actions_per_day: 25,
  min_auto_confidence: 0.7,
} as const;

const clamp = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.min(hi, Math.max(lo, v));
};

const isoDay = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/** Trimmed, de-duplicated, non-empty strings; the fallback when the value is not a list. */
function stringList(v: unknown, fallback: string[], opts: { lower?: boolean; max?: number; maxLen?: number } = {}): string[] {
  if (!Array.isArray(v)) return [...fallback];
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') continue;
    const t = (opts.lower ? x.toLowerCase() : x).replace(/\s+/g, ' ').trim().slice(0, opts.maxLen ?? 120);
    if (t && !out.includes(t)) out.push(t);
  }
  return out.slice(0, opts.max ?? 50);
}

const httpsUrl = (v: unknown, fallback: string) => {
  try {
    return typeof v === 'string' && new URL(v).protocol === 'https:' ? v : fallback;
  } catch {
    return fallback;
  }
};

export function resolveProfile(p: any): AccountProfile {
  const d = DEFAULT_PROFILE;
  return {
    brand_facts: stringList(p?.brand_facts, d.brand_facts, { max: 20, maxLen: 120 }),
    competitors: stringList(p?.competitors, d.competitors, { lower: true, max: 50, maxLen: 40 }),
    protected_keywords: stringList(p?.protected_keywords, d.protected_keywords, { lower: true, max: 50, maxLen: 80 }),
    landing_pages: {
      coaching: httpsUrl(p?.landing_pages?.coaching, d.landing_pages.coaching),
      resources: httpsUrl(p?.landing_pages?.resources, d.landing_pages.resources),
    },
    target_area: typeof p?.target_area === 'string' && p.target_area.trim() ? p.target_area.trim().slice(0, 60) : d.target_area,
    outside_places: stringList(p?.outside_places, d.outside_places, { lower: true, max: 80, maxLen: 40 }),
  };
}

/** Merge stored rows over the defaults, clamping anything out of range. */
export function resolveSettings(stored: Partial<Record<string, any>> | null | undefined): AgentSettings {
  const s = stored || {};
  const d = DEFAULT_SETTINGS;
  const cats = { ...d.autonomy.categories };
  for (const k of Object.keys(cats) as ExecutableCategory[]) {
    const v = s.autonomy?.categories?.[k];
    if (v === 'auto' || v === 'approve') cats[k] = v;
  }
  const level = [0, 1, 2, 3].includes(s.autonomy?.level) ? s.autonomy.level : d.autonomy.level;
  return {
    autonomy: {
      level,
      kill_switch: s.autonomy?.kill_switch === true,
      categories: cats,
    },
    targets: {
      target_cpa_inr: clamp(s.targets?.target_cpa_inr, 50, 100000, d.targets.target_cpa_inr),
      monthly_spend_cap_inr: clamp(s.targets?.monthly_spend_cap_inr, 0, 10000000, d.targets.monthly_spend_cap_inr),
      conversions_since: isoDay(s.targets?.conversions_since),
      // Absent means the default; an explicit null means "never use last season".
      proxy_history_since: s.targets && 'proxy_history_since' in s.targets ? isoDay(s.targets.proxy_history_since) : d.targets.proxy_history_since,
      season: {
        months: Array.isArray(s.targets?.season?.months)
          ? [...new Set<number>(s.targets.season.months.filter((m: unknown) => Number.isInteger(m) && (m as number) >= 1 && (m as number) <= 12))].sort((a, b) => a - b)
          : [...d.targets.season.months],
        target_cpa_inr: clamp(s.targets?.season?.target_cpa_inr, 50, 100000, d.targets.season.target_cpa_inr),
        monthly_spend_cap_inr: clamp(s.targets?.season?.monthly_spend_cap_inr, 0, 10000000, d.targets.season.monthly_spend_cap_inr),
      },
    },
    guardrails: {
      max_budget_change_pct: clamp(s.guardrails?.max_budget_change_pct, 1, HARD_LIMITS.max_budget_change_pct, d.guardrails.max_budget_change_pct),
      max_cpc_ceiling_inr: clamp(s.guardrails?.max_cpc_ceiling_inr, MIN_KEYWORD_BID_INR, HARD_LIMITS.max_cpc_ceiling_inr, d.guardrails.max_cpc_ceiling_inr),
      max_auto_actions_per_day: clamp(s.guardrails?.max_auto_actions_per_day, 0, HARD_LIMITS.max_auto_actions_per_day, d.guardrails.max_auto_actions_per_day),
      min_clicks_to_judge: clamp(s.guardrails?.min_clicks_to_judge, 1, 1000, d.guardrails.min_clicks_to_judge),
      auto_min_confidence: clamp(s.guardrails?.auto_min_confidence, HARD_LIMITS.min_auto_confidence, 1, d.guardrails.auto_min_confidence),
      auto_demote_cpa_worsening_pct: clamp(s.guardrails?.auto_demote_cpa_worsening_pct, 5, 200, d.guardrails.auto_demote_cpa_worsening_pct),
    },
    profile: resolveProfile(s.profile),
  };
}

export interface EffectiveTargets {
  target_cpa_inr: number;
  monthly_spend_cap_inr: number;
  in_season: boolean;
}

/**
 * The targets that apply on a date (YYYY-MM-DD): the season's in the season
 * months, the off-season's otherwise. Every rule reads targets through this.
 */
export function effectiveTargets(settings: AgentSettings, date: string): EffectiveTargets {
  const month = Number(date.slice(5, 7));
  const t = settings.targets;
  const inSeason = t.season.months.includes(month);
  return inSeason
    ? { target_cpa_inr: t.season.target_cpa_inr, monthly_spend_cap_inr: t.season.monthly_spend_cap_inr, in_season: true }
    : { target_cpa_inr: t.target_cpa_inr, monthly_spend_cap_inr: t.monthly_spend_cap_inr, in_season: false };
}

/**
 * Google can spend up to twice a campaign's daily budget on one day, but never
 * more than 30.4 times it in a calendar month. So daily budgets that add up to
 * cap / 30.4 guarantee the monthly cap.
 */
export const DAYS_PER_BILLING_MONTH = 30.4;

/** Google's floor for a daily budget, and the agent's: below this a campaign barely serves. */
export const MIN_DAILY_BUDGET_INR = 50;

/** The agent never cuts a keyword's max CPC below this (INR): under it a keyword barely shows. */
export const MIN_KEYWORD_BID_INR = 5;

/**
 * The NATA cycle that ads and keywords should name on a date. From July the
 * next year's exam is the one students prepare for (the 2026 exams end in
 * June), so on 2026-10-06 this is 2027.
 */
export function examCycleYear(date: string): number {
  const y = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 7 ? y + 1 : y;
}

/** A line that talks about a past result or founding, where an old year is the point ("AIR 1 in 2024", "since 2009"). */
const RESULT_WORDS = /\b(air|rank|ranks|result|results|topper|toppers|since|established|est|selected|scored)\b/i;

/**
 * Exam years in a text that are before the current cycle (2026 when NATA 2027
 * is next), looking back three cycles. Claims about past results are skipped.
 */
export function pastCycleYears(text: string | null | undefined, cycleYear: number): string[] {
  if (!text || RESULT_WORDS.test(text)) return [];
  return [...new Set(text.match(/\b20\d{2}\b/g) ?? [])].filter((y) => Number(y) < cycleYear && Number(y) >= cycleYear - 3);
}
