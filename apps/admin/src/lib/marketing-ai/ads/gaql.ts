/**
 * GAQL for the nightly ingest. One query per level, each segmented by date, so
 * the rows land in ads_entity_daily as one row per entity per day.
 *
 * REMOVED entities are filtered in the query: they cannot be acted on and only
 * add noise. PAUSED ones are kept because their history still explains a trend.
 *
 * Google returns a dated row only for a day with impressions, so a campaign that
 * stopped serving (the account ran out of balance in June 2026) vanishes from
 * the daily queries. snapshotQuery reads the current state of campaigns, ad
 * groups, keywords and ads without a date; the ingest stores it on the last
 * day, with zero metrics where nothing served.
 */

import type { Level } from '../types';

const METRICS = 'metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions, metrics.conversions_value';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** A keyword's bid, first-page bid, Quality Score and serving state (current values, not per day). */
const KW_ATTRS =
  'ad_group_criterion.cpc_bid_micros, ad_group_criterion.effective_cpc_bid_micros, ad_group_criterion.position_estimates.first_page_cpc_micros, ad_group_criterion.quality_info.quality_score, ad_group_criterion.system_serving_status, ad_group_criterion.approval_status';

export function buildQuery(level: Level, from: string, to: string): string {
  if (!isoDate.test(from) || !isoDate.test(to)) throw new Error('buildQuery: dates must be YYYY-MM-DD');
  const during = `segments.date BETWEEN '${from}' AND '${to}'`;
  switch (level) {
    case 'campaign':
      return `SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.bidding_strategy_type, campaign_budget.amount_micros, segments.date, ${METRICS} FROM campaign WHERE ${during} AND campaign.status != 'REMOVED'`;
    case 'ad_group':
      return `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group.status, segments.date, ${METRICS} FROM ad_group WHERE ${during} AND ad_group.status != 'REMOVED'`;
    case 'keyword':
      return `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ${KW_ATTRS}, segments.date, ${METRICS} FROM keyword_view WHERE ${during} AND ad_group_criterion.status != 'REMOVED'`;
    case 'search_term':
      return `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, search_term_view.search_term, search_term_view.status, segments.date, ${METRICS} FROM search_term_view WHERE ${during}`;
    case 'device':
      return `SELECT campaign.id, campaign.name, segments.device, segments.date, ${METRICS} FROM campaign WHERE ${during} AND campaign.status != 'REMOVED'`;
    case 'ad':
      return `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.status, ad_group_ad.ad_strength, ad_group_ad.policy_summary.approval_status, segments.date, ${METRICS} FROM ad_group_ad WHERE ${during} AND ad_group_ad.status != 'REMOVED'`;
    case 'hour':
      return `SELECT campaign.id, campaign.name, segments.day_of_week, segments.hour, segments.date, ${METRICS} FROM campaign WHERE ${during} AND campaign.status != 'REMOVED'`;
    case 'geo':
      return `SELECT campaign.id, campaign.name, segments.geo_target_city, segments.date, ${METRICS} FROM geographic_view WHERE ${during}`;
  }
}

export const INGEST_LEVELS: Level[] = ['campaign', 'ad_group', 'keyword', 'search_term', 'device', 'ad', 'hour', 'geo'];

export const SNAPSHOT_LEVELS = ['campaign', 'ad_group', 'keyword', 'ad'] as const;
export type SnapshotLevel = (typeof SNAPSHOT_LEVELS)[number];

/** Current state, no date segment: status, budget, bids, first-page bid, Quality Score, ad text. */
export function snapshotQuery(level: SnapshotLevel): string {
  switch (level) {
    case 'campaign':
      return `SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign.primary_status_reasons, campaign.bidding_strategy_type, campaign_budget.amount_micros FROM campaign WHERE campaign.status != 'REMOVED'`;
    case 'ad_group':
      return `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group.status, ad_group.cpc_bid_micros FROM ad_group WHERE ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'`;
    case 'keyword':
      return `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ${KW_ATTRS} FROM ad_group_criterion WHERE ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED' AND ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'`;
    case 'ad':
      return `SELECT campaign.id, campaign.name, ad_group.id, ad_group.name, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.ad.final_urls, ad_group_ad.ad.responsive_search_ad.headlines, ad_group_ad.ad.responsive_search_ad.descriptions, ad_group_ad.status, ad_group_ad.ad_strength, ad_group_ad.policy_summary.approval_status FROM ad_group_ad WHERE ad_group_ad.status != 'REMOVED' AND ad_group.status != 'REMOVED' AND campaign.status != 'REMOVED'`;
  }
}

/** City names for geo rows (segments.geo_target_city is only a resource name). */
export function geoNamesQuery(resourceNames: string[]): string | null {
  const safe = resourceNames.filter((r) => /^geoTargetConstants\/\d+$/.test(r)).slice(0, 500);
  if (!safe.length) return null;
  return `SELECT geo_target_constant.resource_name, geo_target_constant.name, geo_target_constant.canonical_name FROM geo_target_constant WHERE geo_target_constant.resource_name IN (${safe.map((r) => `'${r}'`).join(', ')})`;
}

/** Enabled, non-negative keywords of one ad group, to avoid duplicates and never pause the last one. */
export function adGroupKeywordsQuery(adGroupId: string): string {
  if (!/^\d+$/.test(adGroupId)) throw new Error('adGroupKeywordsQuery: id must be numeric');
  return `SELECT ad_group.status, ad_group_criterion.criterion_id, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status FROM ad_group_criterion WHERE ad_group.id = ${adGroupId} AND ad_group_criterion.type = 'KEYWORD' AND ad_group_criterion.negative = FALSE AND ad_group_criterion.status != 'REMOVED'`;
}

/** Enabled ads of one ad group: Google allows 3 enabled responsive search ads, and the last ad must never be paused. */
export function adGroupAdsQuery(adGroupId: string): string {
  if (!/^\d+$/.test(adGroupId)) throw new Error('adGroupAdsQuery: id must be numeric');
  return `SELECT ad_group.status, ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status FROM ad_group_ad WHERE ad_group.id = ${adGroupId} AND ad_group_ad.status = 'ENABLED'`;
}

/** Live state of one keyword, read just before a mutation to check for drift. */
export function keywordStateQuery(adGroupId: string, criterionId: string): string {
  if (!/^\d+$/.test(adGroupId) || !/^\d+$/.test(criterionId)) throw new Error('keywordStateQuery: ids must be numeric');
  return `SELECT ad_group_criterion.resource_name, ad_group_criterion.status, ad_group_criterion.keyword.text, ad_group_criterion.cpc_bid_micros, ad_group_criterion.effective_cpc_bid_micros, campaign.bidding_strategy_type FROM ad_group_criterion WHERE ad_group.id = ${adGroupId} AND ad_group_criterion.criterion_id = ${criterionId}`;
}

/** Live budget of one campaign, read just before a budget change. */
export function campaignBudgetQuery(campaignId: string): string {
  if (!/^\d+$/.test(campaignId)) throw new Error('campaignBudgetQuery: id must be numeric');
  return `SELECT campaign.id, campaign.status, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.explicitly_shared FROM campaign WHERE campaign.id = ${campaignId}`;
}

/** Existing campaign-level negatives, to avoid adding a duplicate. */
export function campaignNegativesQuery(campaignId: string): string {
  if (!/^\d+$/.test(campaignId)) throw new Error('campaignNegativesQuery: id must be numeric');
  return `SELECT campaign_criterion.resource_name, campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign.id = ${campaignId} AND campaign_criterion.negative = TRUE AND campaign_criterion.type = 'KEYWORD'`;
}
