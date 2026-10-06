/**
 * Shared shapes for the Google Ads agent. See docs/marketing-intelligence/README.md
 * for how the pieces fit together.
 */

export type Level = 'campaign' | 'ad_group' | 'keyword' | 'search_term' | 'device' | 'ad' | 'hour' | 'geo';

/** One row of ads_entity_daily: what Google Ads reported for one entity on one day. */
export interface EntityDay {
  customer_id: string;
  date: string; // YYYY-MM-DD
  level: Level;
  entity_key: string;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_group_id: string | null;
  ad_group_name: string | null;
  criterion_id: string | null;
  text: string | null;
  match_type: string | null;
  status: string | null;
  primary_status: string | null;
  budget_micros: number | null;
  impressions: number;
  clicks: number;
  cost_micros: number;
  conversions: number;
  conversions_value: number;
  /**
   * Level-specific extras: an ad's final_urls, ad_strength, approval and
   * headline count; an hour row's day_of_week and hour; a geo row's city name.
   */
  attributes?: Record<string, unknown> | null;
}

export type Category =
  | 'add_negative'
  | 'pause_keyword'
  | 'budget_cut'
  | 'budget_raise'
  | 'bid_cut'
  | 'bid_raise'
  | 'add_keyword'
  | 'new_ad'
  | 'pause_ad'
  | 'ad_schedule'
  | 'location'
  | 'device_bid'
  | 'alert'
  | 'insight';

/** Categories that map to a Google Ads mutation (see actions.ts). The rest are advice. */
export const EXECUTABLE_CATEGORIES = ['add_negative', 'pause_keyword', 'budget_cut', 'budget_raise', 'bid_cut', 'bid_raise', 'add_keyword', 'new_ad', 'pause_ad'] as const;
export type ExecutableCategory = (typeof EXECUTABLE_CATEGORIES)[number];

export function isExecutable(category: string): category is ExecutableCategory {
  return (EXECUTABLE_CATEGORIES as readonly string[]).includes(category);
}

export type Priority = 'critical' | 'high' | 'medium' | 'low';
export type Risk = 'low' | 'medium' | 'high';

export type RecommendationStatus =
  | 'detected'
  | 'recommended'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'executed'
  | 'failed'
  | 'measured'
  | 'expired';

/** The observed numbers behind a finding. Always computed by code, never by the AI. */
export interface EvidenceRow {
  key: string;
  label: string;
  impressions: number;
  clicks: number;
  cost: number; // INR
  conversions: number;
  ctr: number | null;
  cpc: number | null;
  cpa: number | null;
}

export interface Evidence {
  window: { from: string; to: string; days: number };
  rows: EvidenceRow[];
  /** Extra numbers a rule wants to show, e.g. previous-period CPA. */
  facts?: Record<string, number | string | null>;
  /**
   * True when the conversions in this evidence come from before
   * targets.conversions_since (last season's "Sign-up" goal), not the OTP
   * conversion. Such a finding always waits for a person; autopilot refuses it.
   */
  proxy?: boolean;
}

export type ProposedChange =
  | { kind: 'add_negative'; campaign_id: string; text: string; match_type: 'EXACT' | 'PHRASE' }
  | { kind: 'pause_keyword'; ad_group_id: string; criterion_id: string; text: string }
  | { kind: 'budget_change'; campaign_id: string; from_micros: number; to_micros: number; pct: number }
  | { kind: 'keyword_bid'; campaign_id: string; ad_group_id: string; criterion_id: string; text: string; from_micros: number; to_micros: number; pct: number }
  | { kind: 'add_keyword'; campaign_id: string; ad_group_id: string; text: string; match_type: 'EXACT' | 'PHRASE' }
  | { kind: 'new_ad'; campaign_id: string; ad_group_id: string; headlines: string[]; descriptions: string[]; final_urls: string[] }
  | { kind: 'pause_ad'; campaign_id: string; ad_group_id: string; ad_id: string; label: string }
  | { kind: 'ad_schedule'; campaign_id: string; slots: Array<{ day: string; part: string; cost: number; conversions: number }> }
  | { kind: 'location'; campaign_id: string; city: string; action: 'exclude' | 'target' }
  | { kind: 'device_bid'; campaign_id: string; device: string; suggested_modifier_pct: number }
  | { kind: 'none' };

/** What a rule emits. Becomes a marketing_ai_recommendations row. */
export interface Finding {
  ruleId: string;
  category: Category;
  entityType: Level | 'account';
  entityId: string;
  campaignId: string | null;
  title: string;
  reason: string;
  priority: Priority;
  risk: Risk;
  estimatedImpact?: string;
  proposedChange: ProposedChange;
  evidence: Evidence;
  dedupeKey: string;
  /** Filled by the AI layer when it runs. */
  aiAssessment?: string | null;
  aiIntent?: string | null;
  confidence?: number | null;
}

export interface Recommendation {
  id: string;
  rule_id: string;
  category: Category;
  source: string;
  entity_type: string;
  entity_id: string;
  campaign_id: string | null;
  title: string;
  description: string | null;
  reason: string;
  priority: Priority;
  risk_level: Risk;
  estimated_impact: string | null;
  status: RecommendationStatus;
  proposed_change: ProposedChange | null;
  evidence: Evidence;
  ai_assessment: string | null;
  ai_intent: string | null;
  confidence: number | null;
  dedupe_key: string;
  run_id: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  executed_at: string | null;
  execution_result: unknown;
  measured_result: unknown;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export type CategoryMode = 'approve' | 'auto';

/**
 * What the Google Ads API cannot tell the agent: who Neram is, what it may
 * claim, who the competitors are, and which keywords must never be touched.
 * Seeded from apps/admin/Docs/neram-google-ads-account-context.md and edited in
 * Agent Settings.
 */
export interface AccountProfile {
  /** Claims an AI-written ad may use, word for word or close to it. Nothing else. */
  brand_facts: string[];
  /** Other coaching brands. Never in ad text; never a negative unless an admin adds it. */
  competitors: string[];
  /** Keywords the agent never pauses, cuts or blocks, e.g. the umbrella "nata coaching". Lower case. */
  protected_keywords: string[];
  landing_pages: {
    /** Coaching intent: classes, centres, fees. */
    coaching: string;
    /** Informational intent: mock tests, past papers, study material (free app). */
    resources: string;
  };
  /** The area the campaigns are meant for, e.g. "Tamil Nadu". */
  target_area: string;
  /** Places outside that area. A keyword naming one is flagged (R21). Lower case. */
  outside_places: string[];
}

export interface AgentSettings {
  autonomy: {
    level: 0 | 1 | 2 | 3;
    kill_switch: boolean;
    categories: Record<ExecutableCategory, CategoryMode>;
  };
  /** Off-season targets, plus the admission season's (March to June by default). See effectiveTargets in config.ts. */
  targets: {
    target_cpa_inr: number;
    monthly_spend_cap_inr: number;
    /**
     * The day "Phone verified (Neram app)" became the primary conversion. Rules
     * that judge by conversions use only data from this date, and stay silent
     * until there are 21 days of it. Null: conversions are not trusted yet.
     */
    conversions_since: string | null;
    /**
     * Start of last season's history (the old "Sign-up" goal), which may stand
     * in for OTP data in suggestions that need approval until conversions_since
     * has 21 days. Null: never use it.
     */
    proxy_history_since: string | null;
    season: {
      /** 1 = January. */
      months: number[];
      target_cpa_inr: number;
      monthly_spend_cap_inr: number;
    };
  };
  guardrails: {
    max_budget_change_pct: number;
    /** No keyword bid is ever raised above this (INR), and first-page bids above it are not chased. */
    max_cpc_ceiling_inr: number;
    max_auto_actions_per_day: number;
    min_clicks_to_judge: number;
    auto_min_confidence: number;
    auto_demote_cpa_worsening_pct: number;
  };
  profile: AccountProfile;
}

export type Actor = { type: 'admin'; id: string } | { type: 'autopilot' } | { type: 'cron' };

export function actorLabel(actor: Actor): string {
  return actor.type === 'admin' ? actor.id : actor.type;
}
