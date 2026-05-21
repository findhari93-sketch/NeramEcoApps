// @ts-nocheck - Supabase types not regenerated yet for josaa_* tables
/**
 * JoSAA B.Arch Rank Predictor Queries.
 *
 * Reads from josaa_institutes / josaa_programs / josaa_or_cr tables (loaded by
 * scripts/import-josaa-barch.mjs) and the predict_colleges / trend_for RPCs.
 *
 * All queries use the browser (anon) client by default — RLS allows public
 * read on these tables. Pass a service-role client only when needed.
 */

import { getSupabaseBrowserClient, TypedSupabaseClient } from '../client';
import type {
  JosaaInstitute,
  JosaaPrediction,
  JosaaTrendPoint,
  JosaaRankType,
  JosaaCategory,
} from '../types';

export type JosaaSeatType =
  | 'OPEN'
  | 'OBC-NCL'
  | 'SC'
  | 'ST'
  | 'EWS'
  | 'OPEN (PwD)'
  | 'OBC-NCL (PwD)'
  | 'SC (PwD)'
  | 'ST (PwD)'
  | 'EWS (PwD)';

export type JosaaGender = 'Gender-Neutral' | 'Female-only (including Supernumerary)';

export type JosaaQuota = 'AI' | 'HS' | 'OS' | 'GO' | 'JK' | 'LA';

export type JosaaInstituteType = 'NIT' | 'IIT' | 'IIIT' | 'SPA' | 'GFTI';

export interface PredictJosaaCollegesParams {
  rank: number;
  seatType?: JosaaSeatType;
  gender?: JosaaGender;
  quota?: JosaaQuota | null;
  year?: number | null;
  roundNo?: number | null;
}

/**
 * Run the predict_colleges RPC. Returns rows tagged safe/probable/reach.
 * @deprecated Use predictJosaaCollegesV2 for new code. Kept for backward compat.
 */
export async function predictJosaaColleges(
  params: PredictJosaaCollegesParams,
  client?: TypedSupabaseClient,
): Promise<JosaaPrediction[]> {
  const supabase = client || getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('predict_colleges', {
    p_rank: params.rank,
    p_seat_type: params.seatType ?? 'OPEN',
    p_gender: params.gender ?? 'Gender-Neutral',
    p_quota: params.quota ?? null,
    p_year: params.year ?? null,
    p_round_no: params.roundNo ?? null,
  });
  if (error) throw error;
  return (data ?? []) as JosaaPrediction[];
}

export interface PredictJosaaCollegesV2Params {
  rank: number;
  rankType?: JosaaRankType;        // 'CRL' or 'CATEGORY' (default CRL)
  category?: JosaaCategory;         // ignored when rankType='CRL' (forced to OPEN)
  pwd?: boolean;                    // applies PwD seat-type variant
  gender?: JosaaGender;
  homeState?: string | null;        // null = "All India only" (AI seats only)
  year?: number | null;
  roundNo?: number | null;
}

/**
 * Run the predict_colleges_v2 RPC. Smarter than v1:
 *  - separates rank-type (CRL vs Category) from category enum
 *  - infers per-row quota eligibility from the candidate's home state
 *  - returns college_slug/state_slug/city_slug for deep-linking to marketing
 */
export async function predictJosaaCollegesV2(
  params: PredictJosaaCollegesV2Params,
  client?: TypedSupabaseClient,
): Promise<JosaaPrediction[]> {
  const supabase = client || getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('predict_colleges_v2', {
    p_rank: params.rank,
    p_rank_type: params.rankType ?? 'CRL',
    p_category: params.category ?? 'OPEN',
    p_pwd: params.pwd ?? false,
    p_gender: params.gender ?? 'Gender-Neutral',
    p_home_state: params.homeState ?? null,
    p_year: params.year ?? null,
    p_round_no: params.roundNo ?? null,
  });
  if (error) throw error;
  return (data ?? []) as JosaaPrediction[];
}

export interface GetJosaaTrendParams {
  instituteShort: string;
  programShort?: string;
  seatType?: JosaaSeatType;
  gender?: JosaaGender;
  quota?: JosaaQuota | null;
}

/**
 * Run the trend_for RPC. Returns opening/closing ranks across years + rounds
 * for a single institute+program+seat_type+gender combination.
 */
export async function getJosaaTrend(
  params: GetJosaaTrendParams,
  client?: TypedSupabaseClient,
): Promise<JosaaTrendPoint[]> {
  const supabase = client || getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('trend_for', {
    p_institute_short: params.instituteShort,
    p_program_short: params.programShort ?? 'B.Arch',
    p_seat_type: params.seatType ?? 'OPEN',
    p_gender: params.gender ?? 'Gender-Neutral',
    p_quota: params.quota ?? null,
  });
  if (error) throw error;
  return (data ?? []) as JosaaTrendPoint[];
}

export interface ListJosaaInstitutesFilter {
  instituteType?: JosaaInstituteType | JosaaInstituteType[];
  state?: string | string[];
  nirfTop20?: boolean;
}

/**
 * List institutes for filter sidebars and dropdowns. Defaults to all rows.
 */
export async function listJosaaInstitutes(
  filter: ListJosaaInstitutesFilter = {},
  client?: TypedSupabaseClient,
): Promise<JosaaInstitute[]> {
  const supabase = client || getSupabaseBrowserClient();
  let q = supabase
    .from('josaa_institutes')
    .select('id, name, short_name, institute_type, state, city, nirf_rank, established, is_nirf_top20')
    .order('nirf_rank', { ascending: true, nullsFirst: false })
    .order('short_name', { ascending: true });

  if (filter.instituteType) {
    const types = Array.isArray(filter.instituteType) ? filter.instituteType : [filter.instituteType];
    q = q.in('institute_type', types);
  }
  if (filter.state) {
    const states = Array.isArray(filter.state) ? filter.state : [filter.state];
    q = q.in('state', states);
  }
  if (filter.nirfTop20) {
    q = q.eq('is_nirf_top20', true);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as JosaaInstitute[];
}

/**
 * Return distinct years present in josaa_or_cr (descending).
 *
 * Note: Supabase JS SDK defaults to a 1000-row limit per query. josaa_or_cr
 * has ~8k+ rows so a naive select would only return rows from the newest
 * year. The DB-side RPC `josaa_distinct_years` returns just the distinct
 * year list and bypasses the cap.
 */
export async function getJosaaYears(client?: TypedSupabaseClient): Promise<number[]> {
  const supabase = client || getSupabaseBrowserClient();
  const { data, error } = await supabase.rpc('josaa_distinct_years');
  if (error) throw error;
  return (data ?? []).map((r: any) => r.year as number);
}

/**
 * Return distinct round numbers for a given year, ascending.
 */
export async function getJosaaRounds(
  year: number,
  client?: TypedSupabaseClient,
): Promise<number[]> {
  const supabase = client || getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('josaa_or_cr')
    .select('round_no')
    .eq('year', year)
    .order('round_no', { ascending: true });
  if (error) throw error;
  const seen = new Set<number>();
  const rounds: number[] = [];
  for (const r of data ?? []) {
    if (!seen.has(r.round_no)) { seen.add(r.round_no); rounds.push(r.round_no); }
  }
  return rounds;
}

/**
 * Return distinct states for institutes that have at least one row in
 * josaa_or_cr. Used to populate the state filter without showing empty states.
 */
export async function getJosaaStates(client?: TypedSupabaseClient): Promise<string[]> {
  const supabase = client || getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('josaa_institutes')
    .select('state')
    .not('state', 'is', null)
    .order('state', { ascending: true });
  if (error) throw error;
  const seen = new Set<string>();
  for (const r of data ?? []) {
    if (r.state) seen.add(r.state);
  }
  return Array.from(seen);
}
