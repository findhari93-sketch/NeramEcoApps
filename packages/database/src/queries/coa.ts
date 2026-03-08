// @ts-nocheck - Supabase types not generated for coa_institutions
/**
 * Neram Classes - COA Institution Queries
 *
 * Queries for Council of Architecture approved institution lookup.
 */

import { getSupabaseBrowserClient, TypedSupabaseClient } from '../client';
import type { CoaInstitution, CoaStatStat } from '../types';

// ============================================
// SEARCH
// ============================================

/**
 * Search COA institutions by name, code, city, or university (fuzzy + ILIKE)
 */
export async function searchCoaColleges(
  searchTerm: string,
  limit = 10,
  client?: TypedSupabaseClient
): Promise<CoaInstitution[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase.rpc('search_coa_colleges', {
    search_term: searchTerm,
    result_limit: limit,
  });

  if (error) throw error;
  return (data as CoaInstitution[]) || [];
}

// ============================================
// LIST / FILTER
// ============================================

export interface CoaListFilters {
  state?: string;
  city?: string;
  status?: string;
  sortBy?: 'name' | 'intake' | 'commenced_year';
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

export interface CoaListResult {
  data: CoaInstitution[];
  total: number;
}

/**
 * Get COA institutions with optional filtering/pagination
 */
export async function getCOAColleges(
  filters: CoaListFilters = {},
  client?: TypedSupabaseClient
): Promise<CoaListResult> {
  const supabase = client || getSupabaseBrowserClient();
  const {
    state,
    city,
    status,
    sortBy = 'name',
    sortDir = 'asc',
    page = 1,
    pageSize = 20,
  } = filters;

  let query = supabase
    .from('coa_institutions')
    .select('*', { count: 'exact' });

  if (state) query = query.eq('state', state);
  if (city) query = query.ilike('city', `%${city}%`);
  if (status) query = query.eq('approval_status', status);

  query = query.order(sortBy, { ascending: sortDir === 'asc' });
  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data as CoaInstitution[]) || [], total: count || 0 };
}

/**
 * Get distinct cities for a given state
 */
export async function getCOACities(
  state: string,
  client?: TypedSupabaseClient
): Promise<string[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('coa_institutions')
    .select('city')
    .eq('state', state)
    .order('city');

  if (error) throw error;
  const unique = [...new Set((data || []).map((r: { city: string }) => r.city))];
  return unique.filter(Boolean) as string[];
}

// ============================================
// STATS
// ============================================

/**
 * Get pre-computed state-level stats from materialized view
 */
export async function getCOAStats(
  client?: TypedSupabaseClient
): Promise<CoaStatStat[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('coa_state_stats')
    .select('*')
    .order('total_seats', { ascending: false });

  if (error) throw error;
  return (data as CoaStatStat[]) || [];
}
