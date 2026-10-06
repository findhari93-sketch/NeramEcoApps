/**
 * A fake Google Ads account for GOOGLE_ADS_MODE=mock.
 *
 * Shaped from the live account snapshot of 2026-10-06
 * (apps/admin/Docs/neram-google-ads-account-context.md): one Tamil Nadu Search
 * campaign at ₹180 a day on Manual CPC, a main ad group with the real keywords,
 * bids and first-page bids, and a Brand group that never served (₹8 default
 * bid, ad under review). The account's own problems are kept on purpose so
 * every rule has something to find: case duplicates, 2026 keywords and ad text,
 * a Bangalore keyword in a Tamil Nadu campaign, competitor and off-scope
 * searches, and keywords below the first-page bid that convert well.
 *
 * Numbers are 30-day totals spread over the requested dates deterministically,
 * so the same query always returns the same rows. Never used in live mode.
 *
 * GOOGLE_ADS_MOCK_SCENARIO=not_serving makes the last 10 days empty, like the
 * real account after its prepaid balance ran out, so the "not showing ads"
 * alert can be seen.
 */

import type { AdsClient, ClickConversion, MutateResource } from './client';

interface FixtureEntity {
  campaign: string;
  adGroup?: string;
  criterion?: string;
  text?: string;
  matchType?: string;
  status?: string;
  device?: string;
  impressions: number;
  clicks: number;
  cost: number; // INR per 30 days
  conversions: number;
}

interface FixtureKeyword extends FixtureEntity {
  bid: number; // INR
  firstPage: number | null; // INR
  qs: number | null;
  serving: 'ELIGIBLE' | 'RARELY_SERVED';
}

const CAMPAIGNS: Record<string, { name: string; budget: number; status: string; primary: string; reasons: string[]; strategy: string }> = {
  '111': { name: 'TN Local - NATA 2026', budget: 180, status: 'ENABLED', primary: 'ELIGIBLE', reasons: [], strategy: 'MANUAL_CPC' },
};

const AD_GROUPS: Record<string, { campaign: string; name: string; bid: number }> = {
  '1001': { campaign: '111', name: 'neramclasses.com Tamilnadu', bid: 28 },
  '1002': { campaign: '111', name: 'Brand - Neram Classes', bid: 8 },
};

const kw = (criterion: string, text: string, matchType: string, bid: number, firstPage: number | null, qs: number | null, serving: FixtureKeyword['serving'], clicks: number, cost: number, conversions: number, status = 'ENABLED'): FixtureKeyword => ({
  campaign: '111',
  adGroup: '1001',
  criterion,
  text,
  matchType,
  status,
  bid,
  firstPage,
  qs,
  serving,
  impressions: clicks * 16,
  clicks,
  cost,
  conversions,
});

const KEYWORDS: FixtureKeyword[] = [
  kw('9001', 'nata entrance exam', 'PHRASE', 25, null, 3, 'RARELY_SERVED', 40, 1000, 6),
  kw('9002', 'NATA mock Test', 'PHRASE', 32, 30, 6, 'ELIGIBLE', 28, 1360, 3.5),
  kw('9003', 'NATA coaching class', 'PHRASE', 25, 35.3, 5, 'ELIGIBLE', 30, 1200, 1.2),
  kw('9004', 'nata self study material', 'PHRASE', 25, 22, 6, 'ELIGIBLE', 15, 360, 1),
  kw('9005', 'nata coaching in madurai', 'PHRASE', 28, 29.18, 5, 'ELIGIBLE', 6, 270, 2),
  kw('9006', 'NATA coaching in Madurai', 'PHRASE', 40, 29.18, 5, 'ELIGIBLE', 4, 300, 0),
  kw('9007', 'nata past papers', 'EXACT', 30, 33.2, 6, 'ELIGIBLE', 5, 140, 1),
  kw('9008', 'nata coaching near me', 'PHRASE', 30, null, 3, 'RARELY_SERVED', 2, 40, 0.5),
  kw('9009', 'NATA coaching in chennai', 'PHRASE', 30, 28, 5, 'ELIGIBLE', 14, 1000, 0.4),
  kw('9010', 'nata online coaching', 'PHRASE', 60, 41.25, 4, 'ELIGIBLE', 3, 150, 0),
  kw('9011', 'NATA coaching', 'PHRASE', 30, 30.71, 5, 'ELIGIBLE', 3, 60, 0),
  kw('9012', 'nata coaching in Bangalore', 'PHRASE', 28, 50, 2, 'ELIGIBLE', 2, 100, 0),
  kw('9013', 'nata crash course 2026', 'PHRASE', 59.26, 38.5, 5, 'ELIGIBLE', 1, 50, 0),
  kw('9014', 'nata exam date 2026', 'PHRASE', 7.5, null, null, 'ELIGIBLE', 0, 0, 0),
  kw('9015', 'nata online', 'PHRASE', 27.96, 105.79, 4, 'ELIGIBLE', 1, 30, 0.2),
  kw('9016', 'iarch', 'EXACT', 28, null, 2, 'RARELY_SERVED', 0, 0, 0, 'PAUSED'),
  kw('9017', 'dq labs', 'PHRASE', 28, null, 2, 'RARELY_SERVED', 0, 0, 0, 'PAUSED'),
  { ...kw('9101', 'neram classes', 'EXACT', 8, 12, null, 'ELIGIBLE', 0, 0, 0), adGroup: '1002', impressions: 0 },
  { ...kw('9102', 'neram nata coaching', 'PHRASE', 8, 18, null, 'ELIGIBLE', 0, 0, 0), adGroup: '1002', impressions: 0 },
];

const sum = (list: FixtureEntity[], k: 'impressions' | 'clicks' | 'cost' | 'conversions') => list.reduce((s, e) => s + e[k], 0);
const MAIN = KEYWORDS.filter((k) => k.adGroup === '1001');

const CAMPAIGN_TOTALS: FixtureEntity[] = [{ campaign: '111', impressions: sum(MAIN, 'impressions'), clicks: sum(MAIN, 'clicks'), cost: sum(MAIN, 'cost'), conversions: sum(MAIN, 'conversions') }];

const AD_GROUP_TOTALS: FixtureEntity[] = [{ ...CAMPAIGN_TOTALS[0], adGroup: '1001' }];

const st = (text: string, clicks: number, cost: number, conversions: number): FixtureEntity => ({ campaign: '111', adGroup: '1001', text, impressions: clicks * 14, clicks, cost, conversions });

const SEARCH_TERMS: FixtureEntity[] = [
  st('nata entrance exam 2027', 20, 500, 4),
  st('nata mock test', 15, 700, 2),
  st('nata exam sample paper', 6, 170, 2),
  st('how to prepare for nata exam', 5, 140, 1),
  st('free nata mock test', 5, 150, 1),
  st('nata application form 2026', 6, 150, 0),
  st('nata coaching centre chennai', 10, 700, 0.4),
  st('i arch chennai', 6, 300, 0),
  st('dq labs whitefield', 4, 200, 0),
  st('neet coaching centre near me', 3, 120, 0),
  st('architecture jobs in chennai', 3, 110, 0),
  st('jee main coaching chennai', 4, 180, 0),
];

const DEVICES: FixtureEntity[] = [
  { campaign: '111', device: 'MOBILE', impressions: 0.88, clicks: 0.88, cost: 0.88, conversions: 0.9 },
  { campaign: '111', device: 'DESKTOP', impressions: 0.1, clicks: 0.1, cost: 0.1, conversions: 0.09 },
  { campaign: '111', device: 'TABLET', impressions: 0.02, clicks: 0.02, cost: 0.02, conversions: 0.01 },
].map((d) => {
  const c = CAMPAIGN_TOTALS[0];
  return { ...d, impressions: c.impressions * d.impressions, clicks: c.clicks * d.clicks, cost: c.cost * d.cost, conversions: c.conversions * d.conversions };
});

interface FixtureAd extends FixtureEntity {
  ad: string;
  strength: string;
  approval: string;
  url: string;
  headlines: string[];
  descriptions: string[];
}

/** The main ad still says 2026 (and "Enroll Nw"); the Brand ad is under review and never served. */
const ADS: FixtureAd[] = [
  {
    ...CAMPAIGN_TOTALS[0],
    adGroup: '1001',
    ad: '7001',
    strength: 'AVERAGE',
    approval: 'APPROVED',
    url: 'https://neramclasses.com/nata-coaching/tamil-nadu',
    headlines: ['NATA 2026 Coaching - Enroll Nw', 'Hybrid NATA - Online & Offline', 'Live Classes + AI Tools', 'IIT/NIT Faculty', 'Book a Free Demo Class'],
    descriptions: ["Tamil Nadu's #1 NATA Coaching. Live classes + AI tools. IIT/NIT faculty. Book free demo.", 'Free app: Cutoff Calculator, College Predictor & 5000+ colleges. No signup needed.'],
  },
  {
    campaign: '111',
    adGroup: '1002',
    ad: '7002',
    strength: 'PENDING',
    approval: 'UNDER_REVIEW',
    url: 'https://neramclasses.com/nata-coaching/tamil-nadu',
    headlines: ['NATA Prep? Neram Classes', 'NATA Coaching Centre Near You', 'NATA Exam Course'],
    descriptions: ['Official Neram Classes site. NATA and JEE Paper 2 coaching by practising architects.', 'Book a free demo class with your parent. Classes in Tamil Nadu, Bengaluru and online.'],
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
  },
];

/** Day parts: nights get a little spend and nothing back. */
const PARTS: Array<{ hour: number; share: number; convShare: number }> = [
  { hour: 2, share: 0.06, convShare: 0 },
  { hour: 9, share: 0.3, convShare: 0.33 },
  { hour: 14, share: 0.34, convShare: 0.37 },
  { hour: 20, share: 0.3, convShare: 0.3 },
];
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

/** Cities: Bengaluru spends with no sign-ups even though the campaign targets Tamil Nadu. */
const CITIES: Array<{ id: string; name: string; share: number; convShare: number }> = [
  { id: '1007768', name: 'Chennai', share: 0.42, convShare: 0.45 },
  { id: '1007751', name: 'Coimbatore', share: 0.16, convShare: 0.17 },
  { id: '1007779', name: 'Madurai', share: 0.14, convShare: 0.2 },
  { id: '1007806', name: 'Tiruchirappalli', share: 0.1, convShare: 0.1 },
  { id: '1007711', name: 'Bengaluru', share: 0.08, convShare: 0 },
  { id: '1007804', name: 'Salem', share: 0.1, convShare: 0.08 },
];

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (d <= end && out.length < 400) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/** One day's share of a 30-day total: about 1/30, with a stable wobble. */
function dayShare(key: string, date: string): number {
  return (1 / 30) * (0.75 + 0.5 * hash(`${key}|${date}`));
}

/** Round a fractional daily count up or down by a stable coin flip, so small 30-day totals do not vanish. */
function count(total: number, share: number, key: string): number {
  const exact = total * share;
  const whole = Math.floor(exact);
  return whole + (hash(`${key}|r`) < exact - whole ? 1 : 0);
}

function spread(e: FixtureEntity, key: string, date: string) {
  const s = dayShare(key, date);
  const clicks = count(e.clicks, s, `${key}|${date}|c`);
  return {
    impressions: String(Math.max(clicks, count(e.impressions, s, `${key}|${date}|i`))),
    clicks: String(clicks),
    costMicros: String(clicks ? Math.round(e.cost * s * 100) * 10_000 : 0),
    conversions: clicks ? Math.round(e.conversions * s * 100) / 100 : 0,
    conversionsValue: 0,
  };
}

const micros = (inr: number | null) => (inr === null ? undefined : String(Math.round(inr * 100) * 10_000));

function campaignPart(id: string, notServing = false) {
  const c = CAMPAIGNS[id];
  return { id, name: c.name, status: c.status, primaryStatus: notServing ? 'NOT_ELIGIBLE' : c.primary, primaryStatusReasons: c.reasons, biddingStrategyType: c.strategy };
}

function adGroupPart(id: string) {
  return { id, name: AD_GROUPS[id].name, status: 'ENABLED', cpcBidMicros: micros(AD_GROUPS[id].bid) };
}

function criterionPart(k: FixtureKeyword, customerId: string) {
  return {
    resourceName: `customers/${customerId}/adGroupCriteria/${k.adGroup}~${k.criterion}`,
    criterionId: k.criterion,
    status: k.status,
    keyword: { text: k.text, matchType: k.matchType },
    cpcBidMicros: micros(k.bid),
    effectiveCpcBidMicros: micros(k.bid),
    positionEstimates: k.firstPage === null ? {} : { firstPageCpcMicros: micros(k.firstPage) },
    qualityInfo: k.qs === null ? {} : { qualityScore: k.qs },
    systemServingStatus: k.serving,
    approvalStatus: 'APPROVED',
  };
}

function adPart(a: FixtureAd) {
  return {
    status: 'ENABLED',
    adStrength: a.strength,
    policySummary: { approvalStatus: a.approval },
    ad: { id: a.ad, type: 'RESPONSIVE_SEARCH_AD', finalUrls: [a.url], responsiveSearchAd: { headlines: a.headlines.map((text) => ({ text })), descriptions: a.descriptions.map((text) => ({ text })) } },
  };
}

export function createMockAdsClient(customerId: string, scenario: string | undefined = process.env.GOOGLE_ADS_MOCK_SCENARIO): AdsClient {
  const notServing = scenario === 'not_serving';
  const removedAds = new Set<string>();
  return {
    mode: 'mock',
    customerId,
    async search(query: string) {
      const range = query.match(/BETWEEN '(\d{4}-\d{2}-\d{2})' AND '(\d{4}-\d{2}-\d{2})'/);
      const from = query.match(/FROM\s+(\w+)/)?.[1];
      const byGroup = query.match(/ad_group\.id = (\d+)/)?.[1];

      if (from === 'geo_target_constant') {
        return CITIES.filter((c) => query.includes(`geoTargetConstants/${c.id}'`)).map((c) => ({ geoTargetConstant: { resourceName: `geoTargetConstants/${c.id}`, name: c.name, canonicalName: `${c.name},India` } }));
      }
      if (from === 'campaign_criterion') return [];

      if (!range) {
        // Live state: the drift checks before a mutation, and the ingest snapshot.
        if (from === 'ad_group_ad' && byGroup) {
          return ADS.filter((a) => a.adGroup === byGroup && !removedAds.has(a.ad)).map((a) => ({ adGroup: { status: 'ENABLED' }, adGroupAd: { status: 'ENABLED', ad: { id: a.ad, type: 'RESPONSIVE_SEARCH_AD' } } }));
        }
        if (from === 'ad_group_ad') {
          return ADS.map((a) => ({ campaign: campaignPart(a.campaign, notServing), adGroup: adGroupPart(a.adGroup!), adGroupAd: adPart(a) }));
        }
        if (from === 'ad_group_criterion') {
          const crit = query.match(/criterion_id = (\d+)/)?.[1];
          if (crit) {
            const k = KEYWORDS.find((x) => x.adGroup === byGroup && x.criterion === crit);
            return k ? [{ adGroupCriterion: criterionPart(k, customerId), campaign: { biddingStrategyType: CAMPAIGNS[k.campaign].strategy } }] : [];
          }
          const list = byGroup ? KEYWORDS.filter((k) => k.adGroup === byGroup) : KEYWORDS;
          return list.map((k) => ({ campaign: campaignPart(k.campaign, notServing), adGroup: adGroupPart(k.adGroup!), adGroupCriterion: criterionPart(k, customerId) }));
        }
        if (from === 'campaign') {
          const id = query.match(/campaign\.id = (\d+)/)?.[1];
          if (id) {
            const c = CAMPAIGNS[id];
            return c
              ? [{ campaign: { id, status: c.status }, campaignBudget: { resourceName: `customers/${customerId}/campaignBudgets/5${id}`, amountMicros: String(c.budget * 1_000_000), explicitlyShared: false } }]
              : [];
          }
          return Object.keys(CAMPAIGNS).map((cid) => ({ campaign: campaignPart(cid, notServing), campaignBudget: { amountMicros: String(CAMPAIGNS[cid].budget * 1_000_000) } }));
        }
        if (from === 'ad_group') return Object.keys(AD_GROUPS).map((id) => ({ campaign: campaignPart(AD_GROUPS[id].campaign, notServing), adGroup: adGroupPart(id) }));
        return [];
      }

      // Dated rows exist only for days with impressions, as in Google Ads.
      const lastServed = notServing ? new Date(new Date(`${range[2]}T00:00:00Z`).getTime() - 10 * 86_400_000).toISOString().slice(0, 10) : range[2];
      const days = datesBetween(range[1], range[2]).filter((d) => d <= lastServed);
      const rows: any[] = [];
      const isDevice = /segments\.device/.test(query);
      const isHour = /segments\.hour/.test(query);
      const push = (row: any, e: FixtureEntity, key: string, date: string) => {
        const metrics = spread(e, key, date);
        if (Number(metrics.impressions) > 0) rows.push({ ...row, segments: { ...row.segments, date }, metrics });
      };

      for (const date of days) {
        const camp = campaignPart('111');
        if (from === 'campaign' && isHour) {
          const tn = CAMPAIGN_TOTALS[0];
          const dow = DAYS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7];
          for (const p of PARTS) {
            const e = { ...tn, impressions: tn.impressions * p.share, clicks: tn.clicks * p.share, cost: tn.cost * p.share, conversions: tn.conversions * p.convShare };
            push({ campaign: camp, segments: { dayOfWeek: dow, hour: p.hour } }, e, `h${p.hour}`, date);
          }
        } else if (from === 'geographic_view') {
          const tn = CAMPAIGN_TOTALS[0];
          for (const c of CITIES) {
            const e = { ...tn, impressions: tn.impressions * c.share, clicks: tn.clicks * c.share, cost: tn.cost * c.share, conversions: tn.conversions * c.convShare };
            push({ campaign: camp, segments: { geoTargetCity: `geoTargetConstants/${c.id}` } }, e, `g${c.id}`, date);
          }
        } else if (from === 'ad_group_ad') {
          for (const a of ADS) push({ campaign: camp, adGroup: adGroupPart(a.adGroup!), adGroupAd: adPart(a) }, a, `ad${a.ad}`, date);
        } else if (from === 'campaign' && isDevice) {
          for (const e of DEVICES) push({ campaign: camp, segments: { device: e.device } }, e, `dev${e.device}`, date);
        } else if (from === 'campaign') {
          for (const e of CAMPAIGN_TOTALS) push({ campaign: camp, campaignBudget: { amountMicros: String(CAMPAIGNS[e.campaign].budget * 1_000_000) } }, e, `c${e.campaign}`, date);
        } else if (from === 'ad_group') {
          for (const e of AD_GROUP_TOTALS) push({ campaign: camp, adGroup: adGroupPart(e.adGroup!) }, e, `ag${e.adGroup}`, date);
        } else if (from === 'keyword_view') {
          for (const k of KEYWORDS) push({ campaign: camp, adGroup: adGroupPart(k.adGroup!), adGroupCriterion: criterionPart(k, customerId) }, k, `k${k.criterion}`, date);
        } else if (from === 'search_term_view') {
          for (const e of SEARCH_TERMS) push({ campaign: camp, adGroup: adGroupPart(e.adGroup!), searchTermView: { searchTerm: e.text, status: 'NONE' } }, e, `st${e.text}`, date);
        }
      }
      return rows;
    },
    async mutate(resource: MutateResource, operations: unknown[]) {
      return { results: operations.map((_, i) => ({ resourceName: `customers/${customerId}/${resource}/mock-${Date.now()}-${i}` })) };
    },
    async uploadClickConversions(conversions: ClickConversion[]) {
      return {
        results: conversions.map((c) => ({ gclid: c.gclid, conversionAction: c.conversionAction, conversionDateTime: c.conversionDateTime })),
        partialFailureError: null,
      };
    },
  };
}
