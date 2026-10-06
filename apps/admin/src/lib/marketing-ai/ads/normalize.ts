/**
 * Google Ads REST rows -> ads_entity_daily rows.
 *
 * REST returns camelCase field names and int64 values as strings
 * ("costMicros": "1250000"). Everything numeric is parsed here once, so no
 * other module ever sees a string metric.
 */

import type { EntityDay, Level } from '../types';

const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string | null => (v === undefined || v === null || v === '' ? null : String(v));
const optNum = (v: unknown): number | null => (v === undefined || v === null || v === '' ? null : num(v));

/** Drop null fields; null when nothing is left, so rows without extras stay small. */
function compact(o: Record<string, unknown>): Record<string, unknown> | null {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));
  return Object.keys(out).length ? out : null;
}

export function normalizeRow(level: Level, customerId: string, row: any): EntityDay | null {
  const date = row?.segments?.date;
  const campaignId = str(row?.campaign?.id);
  if (!date || !campaignId) return null;

  const base: EntityDay = {
    customer_id: customerId,
    date,
    level,
    entity_key: campaignId,
    campaign_id: campaignId,
    campaign_name: str(row?.campaign?.name),
    ad_group_id: str(row?.adGroup?.id),
    ad_group_name: str(row?.adGroup?.name),
    criterion_id: null,
    text: null,
    match_type: null,
    status: null,
    primary_status: null,
    budget_micros: null,
    impressions: num(row?.metrics?.impressions),
    clicks: num(row?.metrics?.clicks),
    cost_micros: num(row?.metrics?.costMicros),
    conversions: num(row?.metrics?.conversions),
    conversions_value: num(row?.metrics?.conversionsValue),
    attributes: null,
  };

  switch (level) {
    case 'campaign': {
      const reasons: string[] = Array.isArray(row?.campaign?.primaryStatusReasons) ? row.campaign.primaryStatusReasons : [];
      return {
        ...base,
        status: str(row?.campaign?.status),
        primary_status: [row?.campaign?.primaryStatus, ...reasons].filter(Boolean).join('|') || null,
        budget_micros: row?.campaignBudget?.amountMicros !== undefined ? num(row.campaignBudget.amountMicros) : null,
        attributes: compact({ bidding_strategy_type: str(row?.campaign?.biddingStrategyType) }),
      };
    }
    case 'ad_group':
      if (!base.ad_group_id) return null;
      return {
        ...base,
        entity_key: base.ad_group_id,
        status: str(row?.adGroup?.status),
        attributes: compact({ cpc_bid_micros: optNum(row?.adGroup?.cpcBidMicros) }),
      };
    case 'keyword': {
      const crit = row?.adGroupCriterion;
      const criterionId = str(crit?.criterionId);
      if (!base.ad_group_id || !criterionId) return null;
      return {
        ...base,
        entity_key: `${base.ad_group_id}~${criterionId}`,
        criterion_id: criterionId,
        text: str(crit?.keyword?.text),
        match_type: str(crit?.keyword?.matchType),
        status: str(crit?.status),
        attributes: compact({
          cpc_bid_micros: optNum(crit?.cpcBidMicros),
          effective_cpc_bid_micros: optNum(crit?.effectiveCpcBidMicros),
          first_page_cpc_micros: optNum(crit?.positionEstimates?.firstPageCpcMicros),
          quality_score: optNum(crit?.qualityInfo?.qualityScore),
          serving_status: str(crit?.systemServingStatus),
          approval_status: str(crit?.approvalStatus),
        }),
      };
    }
    case 'search_term': {
      const term = str(row?.searchTermView?.searchTerm);
      if (!base.ad_group_id || !term) return null;
      return {
        ...base,
        entity_key: `${base.ad_group_id}~${term.toLowerCase()}`,
        text: term,
        status: str(row?.searchTermView?.status),
      };
    }
    case 'device': {
      const device = str(row?.segments?.device);
      if (!device) return null;
      return { ...base, entity_key: `${campaignId}~${device}`, text: device };
    }
    case 'ad': {
      const aga = row?.adGroupAd;
      const adId = str(aga?.ad?.id);
      if (!base.ad_group_id || !adId) return null;
      const headlines: string[] = (aga?.ad?.responsiveSearchAd?.headlines ?? []).map((h: any) => h?.text).filter(Boolean);
      const descriptions: string[] = (aga?.ad?.responsiveSearchAd?.descriptions ?? []).map((d: any) => d?.text).filter(Boolean);
      return {
        ...base,
        entity_key: `${base.ad_group_id}~${adId}`,
        criterion_id: adId,
        text: headlines[0] ?? `Ad ${adId}`,
        status: str(aga?.status),
        attributes: {
          type: str(aga?.ad?.type),
          final_urls: Array.isArray(aga?.ad?.finalUrls) ? aga.ad.finalUrls : [],
          ad_strength: str(aga?.adStrength),
          approval: str(aga?.policySummary?.approvalStatus),
          headlines: headlines.length,
          headline_texts: headlines,
          description_texts: descriptions,
        },
      };
    }
    case 'hour': {
      const dow = str(row?.segments?.dayOfWeek);
      const hour = row?.segments?.hour;
      if (!dow || typeof hour !== 'number') return null;
      return { ...base, entity_key: `${campaignId}~${dow}~${hour}`, text: `${dow} ${hour}:00`, attributes: { day_of_week: dow, hour } };
    }
    case 'geo': {
      const city = str(row?.segments?.geoTargetCity);
      if (!city) return null;
      // The name is filled in by the ingest from geo_target_constant.
      return { ...base, entity_key: `${campaignId}~${city}`, text: city, attributes: { city_resource: city } };
    }
  }
}

/**
 * The same entity can come back in several rows for one day (a search term
 * matched by two keywords in one ad group, or a state snapshot beside the day's
 * metrics). Sum the metrics, so the upsert key stays unique and no click is
 * lost, and fill state fields and extras from whichever row has them.
 */
export function mergeDuplicates(rows: EntityDay[]): EntityDay[] {
  const byKey = new Map<string, EntityDay>();
  for (const r of rows) {
    const k = `${r.date}|${r.level}|${r.entity_key}`;
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, { ...r });
      continue;
    }
    prev.impressions += r.impressions;
    prev.clicks += r.clicks;
    prev.cost_micros += r.cost_micros;
    prev.conversions += r.conversions;
    prev.conversions_value += r.conversions_value;
    prev.status = prev.status ?? r.status;
    prev.primary_status = prev.primary_status ?? r.primary_status;
    prev.budget_micros = prev.budget_micros ?? r.budget_micros;
    if (r.attributes) prev.attributes = { ...(prev.attributes ?? {}), ...r.attributes };
  }
  return [...byKey.values()];
}
