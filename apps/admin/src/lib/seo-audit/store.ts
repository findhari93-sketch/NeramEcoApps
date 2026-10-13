/**
 * Database reads and writes for SEO Health. The tables are not in the generated
 * Supabase types, so the client is typed loosely here and nowhere else.
 */
import { getSupabaseAdminClient } from '@neram/database';
import type { PageWindow, QueryPageWindow, RunKind, RunStatus, RunTrigger, UrlStatus } from './types';

export function db(): any {
  return getSupabaseAdminClient() as any;
}

const PAGE = 1000;

/** Every row of a query, past PostgREST's 1,000-row cap. `build` gets the range to apply. */
export async function selectAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Upserts in batches. Every row must carry the same keys, or PostgREST nulls the missing ones. */
export async function upsertBatches(client: any, table: string, rows: Record<string, unknown>[], onConflict: string, size = 500): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await client.from(table).upsert(chunk, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    written += chunk.length;
  }
  return written;
}

export async function startRun(client: any, kind: RunKind, trigger: RunTrigger): Promise<string | null> {
  const { data } = await client.from('seo_audit_runs').insert({ kind, trigger, status: 'running' }).select('id').single();
  return data?.id ?? null;
}

export async function finishRun(client: any, id: string | null, status: RunStatus, counts: Record<string, unknown>, error?: string | null) {
  if (!id) return;
  await client
    .from('seo_audit_runs')
    .update({ status, counts, finished_at: new Date().toISOString(), error: error ? error.slice(0, 2000) : null })
    .eq('id', id);
}

/** The counts of the last successful run of a kind, for jobs that carry state forward. */
export async function lastRunCounts(client: any, kind: RunKind): Promise<Record<string, unknown> | null> {
  const { data } = await client.from('seo_audit_runs').select('counts').eq('kind', kind).in('status', ['ok', 'partial']).order('started_at', { ascending: false }).limit(1);
  return data?.[0]?.counts ?? null;
}

/** A run that did nothing because Search Console is not connected yet. */
export async function recordNotConnected(client: any, kind: RunKind, trigger: RunTrigger, missing: string[]) {
  const now = new Date().toISOString();
  await client.from('seo_audit_runs').insert({ kind, trigger, status: 'not_connected', finished_at: now, counts: { missing } });
}

export async function loadUrlStatus(client: any): Promise<UrlStatus[]> {
  return selectAll<UrlStatus>((from, to) => client.from('seo_url_status').select('*').order('url').range(from, to));
}

const toNum = (r: any) => ({ ...r, clicks: Number(r.clicks), impressions: Number(r.impressions), avg_position: Number(r.avg_position) });

export async function pageWindow(client: any, from: string, to: string): Promise<PageWindow[]> {
  const rows = await selectAll<any>((a, b) => client.rpc('seo_page_window', { p_from: from, p_to: to }).range(a, b));
  return rows.map(toNum);
}

export async function queryPageWindow(client: any, from: string, to: string, minImpressions = 10): Promise<QueryPageWindow[]> {
  const rows = await selectAll<any>((a, b) => client.rpc('seo_query_page_window', { p_from: from, p_to: to, p_min_impressions: minImpressions }).range(a, b));
  return rows.map(toNum);
}

/** The latest date with search data, or null before the first ingest. */
export async function latestSearchDate(client: any): Promise<string | null> {
  const { data } = await client.from('gsc_search_daily').select('date').eq('query', '').order('date', { ascending: false }).limit(1);
  return data?.[0]?.date ?? null;
}

export async function earliestSearchDate(client: any): Promise<string | null> {
  const { data } = await client.from('gsc_search_daily').select('date').eq('query', '').order('date', { ascending: true }).limit(1);
  return data?.[0]?.date ?? null;
}

/** YYYY-MM-DD, shifted by whole days. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Search Console data is final about 3 days later (Pacific time), so that is the newest day we read. */
export function lastFinalDate(now: Date = new Date()): string {
  return shiftDate(now.toISOString().slice(0, 10), -3);
}
