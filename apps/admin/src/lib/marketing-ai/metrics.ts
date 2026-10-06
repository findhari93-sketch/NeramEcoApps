/**
 * Every number the agent shows or reasons about is computed here, by code.
 * The AI never calculates a metric (spec §9): it is handed these results and
 * asked to interpret them.
 *
 * Money is INR in this module. Google reports micros (1 INR = 1,000,000), and
 * the conversion happens once, in toTotals.
 */

import type { EntityDay, EvidenceRow, Level } from './types';

export const MICROS = 1_000_000;

export interface Totals {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  value: number;
}

export interface Derived {
  ctr: number | null; // %
  cpc: number | null; // INR
  cpa: number | null; // INR
  convRate: number | null; // %
  roas: number | null; // value / cost
}

export const ZERO: Totals = { impressions: 0, clicks: 0, cost: 0, conversions: 0, value: 0 };

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function toTotals(rows: Pick<EntityDay, 'impressions' | 'clicks' | 'cost_micros' | 'conversions' | 'conversions_value'>[]): Totals {
  const t = { ...ZERO };
  for (const r of rows) {
    t.impressions += r.impressions;
    t.clicks += r.clicks;
    t.cost += r.cost_micros / MICROS;
    t.conversions += r.conversions;
    t.value += r.conversions_value;
  }
  return { ...t, cost: round(t.cost), conversions: round(t.conversions) };
}

export function derive(t: Totals): Derived {
  return {
    ctr: t.impressions > 0 ? round((t.clicks / t.impressions) * 100) : null,
    cpc: t.clicks > 0 ? round(t.cost / t.clicks) : null,
    cpa: t.conversions > 0 ? round(t.cost / t.conversions) : null,
    convRate: t.clicks > 0 ? round((t.conversions / t.clicks) * 100) : null,
    roas: t.cost > 0 && t.value > 0 ? round(t.value / t.cost) : null,
  };
}

/** Percentage change from previous to current. Null when there is no baseline. */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return round(((current - previous) / previous) * 100, 1);
}

/** YYYY-MM-DD, n days before the given date. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Yesterday in IST, which is the last complete day of Google Ads data for an Indian account. */
export function lastCompleteDayIST(now = new Date()): string {
  const ist = new Date(now.getTime() + 5.5 * 3600_000);
  ist.setUTCDate(ist.getUTCDate() - 1);
  return ist.toISOString().slice(0, 10);
}

export interface Window {
  from: string;
  to: string;
  days: number;
}

/** The `days`-long window ending on `to`, inclusive. */
export function windowEnding(to: string, days: number): Window {
  return { from: shiftDate(to, -(days - 1)), to, days };
}

export function inWindow(date: string, w: Window): boolean {
  return date >= w.from && date <= w.to;
}

export interface Aggregate extends Totals {
  key: string;
  level: Level;
  campaign_id: string | null;
  campaign_name: string | null;
  ad_group_id: string | null;
  ad_group_name: string | null;
  criterion_id: string | null;
  text: string | null;
  match_type: string | null;
  /** Status / primary status / budget from the latest day seen. */
  status: string | null;
  primary_status: string | null;
  budget_micros: number | null;
  /** Level-specific extras from the latest day (an ad's URLs and strength, a city's name). */
  attributes: Record<string, unknown> | null;
  latest_date: string;
}

/** Sum daily rows per entity within a window. */
export function aggregate(rows: EntityDay[], level: Level, w: Window): Aggregate[] {
  const byKey = new Map<string, { agg: Aggregate; rows: EntityDay[] }>();
  for (const r of rows) {
    if (r.level !== level || !inWindow(r.date, w)) continue;
    let slot = byKey.get(r.entity_key);
    if (!slot) {
      slot = {
        agg: {
          ...ZERO,
          key: r.entity_key,
          level,
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          ad_group_id: r.ad_group_id,
          ad_group_name: r.ad_group_name,
          criterion_id: r.criterion_id,
          text: r.text,
          match_type: r.match_type,
          status: r.status,
          primary_status: r.primary_status,
          budget_micros: r.budget_micros,
          attributes: r.attributes ?? null,
          latest_date: r.date,
        },
        rows: [],
      };
      byKey.set(r.entity_key, slot);
    }
    slot.rows.push(r);
    if (r.date >= slot.agg.latest_date) {
      slot.agg.latest_date = r.date;
      slot.agg.status = r.status ?? slot.agg.status;
      slot.agg.primary_status = r.primary_status ?? slot.agg.primary_status;
      slot.agg.budget_micros = r.budget_micros ?? slot.agg.budget_micros;
      slot.agg.attributes = r.attributes ?? slot.agg.attributes;
      slot.agg.campaign_name = r.campaign_name ?? slot.agg.campaign_name;
      slot.agg.ad_group_name = r.ad_group_name ?? slot.agg.ad_group_name;
    }
  }
  return [...byKey.values()].map(({ agg, rows: rs }) => ({ ...agg, ...toTotals(rs) }));
}

export function evidenceRow(a: Aggregate, label?: string): EvidenceRow {
  const d = derive(a);
  return {
    key: a.key,
    label: label ?? a.text ?? a.ad_group_name ?? a.campaign_name ?? a.key,
    impressions: a.impressions,
    clicks: a.clicks,
    cost: a.cost,
    conversions: a.conversions,
    ctr: d.ctr,
    cpc: d.cpc,
    cpa: d.cpa,
  };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export interface PeriodComparison {
  current: Totals & Derived;
  previous: Totals & Derived;
  change: Record<'cost' | 'conversions' | 'cpa' | 'ctr' | 'cpc' | 'convRate' | 'clicks', number | null>;
}

/** Account totals for the window ending on `to`, against the window before it. */
export function comparePeriods(rows: EntityDay[], to: string, days: number): PeriodComparison {
  const cur = windowEnding(to, days);
  const prev = windowEnding(shiftDate(to, -days), days);
  const campaignRows = rows.filter((r) => r.level === 'campaign');
  const c = toTotals(campaignRows.filter((r) => inWindow(r.date, cur)));
  const p = toTotals(campaignRows.filter((r) => inWindow(r.date, prev)));
  const cd = derive(c);
  const pd = derive(p);
  return {
    current: { ...c, ...cd },
    previous: { ...p, ...pd },
    change: {
      cost: pctChange(c.cost, p.cost),
      conversions: pctChange(c.conversions, p.conversions),
      clicks: pctChange(c.clicks, p.clicks),
      cpa: pctChange(cd.cpa, pd.cpa),
      ctr: pctChange(cd.ctr, pd.ctr),
      cpc: pctChange(cd.cpc, pd.cpc),
      convRate: pctChange(cd.convRate, pd.convRate),
    },
  };
}

/** Daily account totals for a trend chart. */
export function dailySeries(rows: EntityDay[], w: Window): Array<{ date: string } & Totals & Derived> {
  const byDate = new Map<string, EntityDay[]>();
  for (const r of rows) {
    if (r.level !== 'campaign' || !inWindow(r.date, w)) continue;
    const list = byDate.get(r.date) ?? [];
    list.push(r);
    byDate.set(r.date, list);
  }
  const out: Array<{ date: string } & Totals & Derived> = [];
  for (let d = w.from; d <= w.to; d = shiftDate(d, 1)) {
    const t = toTotals(byDate.get(d) ?? []);
    out.push({ date: d, ...t, ...derive(t) });
  }
  return out;
}

export const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? 'n/a' : `₹${Math.round(n).toLocaleString('en-IN')}`;
