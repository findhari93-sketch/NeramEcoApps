import { DEFAULT_SETTINGS } from '../config';
import { shiftDate } from '../metrics';
import type { AgentSettings, EntityDay, Level } from '../types';

/** One ads_entity_daily row with sensible defaults. Money is given in INR. */
export function day(level: Level, date: string, o: Partial<Omit<EntityDay, 'cost_micros'>> & { cost?: number } = {}): EntityDay {
  const { cost = 0, ...rest } = o;
  return {
    customer_id: '1',
    date,
    level,
    entity_key: rest.entity_key ?? rest.campaign_id ?? 'c1',
    campaign_id: 'c1',
    campaign_name: 'Camp',
    ad_group_id: null,
    ad_group_name: null,
    criterion_id: null,
    text: null,
    match_type: null,
    status: 'ENABLED',
    primary_status: null,
    budget_micros: null,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    conversions_value: 0,
    ...rest,
    cost_micros: Math.round(cost * 1_000_000),
  };
}

/** Spread 30-day totals evenly over the 30 days ending on `end`. */
export function spread30(level: Level, end: string, totals: { clicks: number; cost: number; conversions?: number; impressions?: number }, o: Partial<EntityDay> = {}): EntityDay[] {
  const out: EntityDay[] = [];
  for (let i = 0; i < 30; i++) {
    const last = i === 29;
    const share = (n: number) => (last ? n - Math.floor(n / 30) * 29 : Math.floor(n / 30));
    out.push(
      day(level, shiftDate(end, -i), {
        ...o,
        clicks: share(totals.clicks),
        impressions: share(totals.impressions ?? totals.clicks * 10),
        conversions: i === 0 ? totals.conversions ?? 0 : 0,
        cost: totals.cost / 30,
      }),
    );
  }
  return out;
}

/**
 * Settings for tests. Unlike the real default, conversions are trusted from
 * 2026-01-01, so rules that judge by sign-ups run; pass conversions_since: null
 * to test the learning-period silence.
 */
type SettingsOverride = {
  autonomy?: Partial<Omit<AgentSettings['autonomy'], 'categories'>> & { categories?: Partial<AgentSettings['autonomy']['categories']> };
  targets?: Partial<AgentSettings['targets']>;
  guardrails?: Partial<AgentSettings['guardrails']>;
  profile?: Partial<AgentSettings['profile']>;
};

export function settings(over: SettingsOverride = {}): AgentSettings {
  return {
    autonomy: { ...DEFAULT_SETTINGS.autonomy, ...over.autonomy, categories: { ...DEFAULT_SETTINGS.autonomy.categories, ...over.autonomy?.categories } },
    targets: { ...DEFAULT_SETTINGS.targets, conversions_since: '2026-01-01', ...over.targets },
    guardrails: { ...DEFAULT_SETTINGS.guardrails, ...over.guardrails },
    profile: { ...DEFAULT_SETTINGS.profile, ...over.profile },
  } as AgentSettings;
}
