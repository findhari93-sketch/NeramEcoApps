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
 */
export async function getJosaaYears(client?: TypedSupabaseClient): Promise<number[]> {
  const supabase = client || getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('josaa_or_cr')
    .select('year')
    .order('year', { ascending: false });
  if (error) throw error;
  const seen = new Set<number>();
  const years: number[] = [];
  for (const r of data ?? []) {
    if (!seen.has(r.year)) { seen.add(r.year); years.push(r.year); }
  }
  return years;
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
