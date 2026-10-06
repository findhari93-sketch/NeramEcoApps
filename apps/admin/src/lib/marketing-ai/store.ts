/**
 * Database reads and writes that are not the recommendation lifecycle.
 *
 * The new tables are not in the generated Supabase types yet, so `db` is typed
 * loosely here and nowhere else leaks it.
 */

import { getSupabaseAdminClient } from '@neram/database';
import { resolveSettings, SETTINGS_KEYS } from './config';
import type { AgentSettings, EntityDay } from './types';

export function db(): any {
  return getSupabaseAdminClient() as any;
}

export async function loadSettings(client: any): Promise<AgentSettings> {
  const { data, error } = await client.from('marketing_ai_settings').select('key, value').in('key', SETTINGS_KEYS as unknown as string[]);
  if (error) throw new Error(error.message);
  const stored: Record<string, unknown> = {};
  for (const row of data ?? []) stored[row.key] = row.value;
  return resolveSettings(stored);
}

export async function saveSettings(client: any, settings: AgentSettings, adminId: string | null): Promise<void> {
  const now = new Date().toISOString();
  const rows = SETTINGS_KEYS.map((key) => ({ key, value: settings[key], updated_by: adminId, updated_at: now }));
  const { error } = await client.from('marketing_ai_settings').upsert(rows, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

export type RunKind = 'ingest' | 'analyze' | 'conversions' | 'execute' | 'autopilot' | 'measure' | 'weekly';

export async function startRun(client: any, kind: RunKind, trigger: 'cron' | 'manual', triggeredBy: string | null, mode: string): Promise<string | null> {
  const { data, error } = await client
    .from('marketing_ai_runs')
    .insert({ kind, trigger, triggered_by: triggeredBy, mode })
    .select('id')
    .single();
  if (error) {
    console.error('[marketing-ai] could not start run:', error.message);
    return null;
  }
  return data.id;
}

export async function finishRun(
  client: any,
  id: string | null,
  status: 'succeeded' | 'failed',
  fields: { stats?: unknown; error?: string | null; provider?: string | null; model?: string | null; prompt_version?: string | null; tokens_in?: number; tokens_out?: number; cost_usd?: number },
): Promise<void> {
  if (!id) return;
  const { error } = await client
    .from('marketing_ai_runs')
    .update({ status, finished_at: new Date().toISOString(), ...fields })
    .eq('id', id);
  if (error) console.error('[marketing-ai] could not finish run:', error.message);
}

const UPSERT_CHUNK = 500;

export async function upsertEntityDays(client: any, rows: EntityDay[]): Promise<number> {
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK).map((r) => ({ ...r, fetched_at: now }));
    const { error } = await client.from('ads_entity_daily').upsert(chunk, { onConflict: 'customer_id,date,level,entity_key' });
    if (error) throw new Error(`ads_entity_daily upsert failed: ${error.message}`);
  }
  return rows.length;
}

const PAGE = 1000;
const COLUMNS =
  'customer_id, date, level, entity_key, campaign_id, campaign_name, ad_group_id, ad_group_name, criterion_id, text, match_type, status, primary_status, budget_micros, impressions, clicks, cost_micros, conversions, conversions_value, attributes';

/** Every row for the account in a date range. Paged, because PostgREST stops at 1,000 rows. */
export async function loadEntityDays(client: any, customerId: string, from: string, to: string, levels?: string[]): Promise<EntityDay[]> {
  const out: EntityDay[] = [];
  for (let offset = 0; offset < 200_000; offset += PAGE) {
    let q = client.from('ads_entity_daily').select(COLUMNS).eq('customer_id', customerId).gte('date', from).lte('date', to);
    if (levels?.length) q = q.in('level', levels);
    const { data, error } = await q.order('date', { ascending: true }).order('id', { ascending: true }).range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      out.push({
        ...r,
        impressions: Number(r.impressions),
        clicks: Number(r.clicks),
        cost_micros: Number(r.cost_micros),
        conversions: Number(r.conversions),
        conversions_value: Number(r.conversions_value),
        budget_micros: r.budget_micros === null ? null : Number(r.budget_micros),
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function latestRuns(client: any) {
  const { data, error } = await client
    .from('marketing_ai_runs')
    .select('id, kind, trigger, status, mode, provider, model, started_at, finished_at, error, stats')
    .order('started_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  const byKind: Record<string, any> = {};
  for (const r of data ?? []) if (!byKind[r.kind]) byKind[r.kind] = r;
  return { recent: data ?? [], byKind };
}
