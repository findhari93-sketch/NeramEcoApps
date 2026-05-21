// @ts-nocheck - Supabase types not generated
/**
 * NIRF Architecture Rankings Queries.
 *
 * Reads from the nirf_rankings table. Public reads only include rows where
 * a college has been matched (or manually approved by an admin), and a
 * college_id is set. Service-role tools can still see pending/unmatched rows.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { NIRFRanking, NIRFRankingWithCollege } from '../types';

const COLLEGE_REF = `
  id, slug, name, short_name, city, state, state_slug, type, logo_url, neram_tier, naac_grade
`;

const ROW_SELECT = `
  id, college_id, category, year, rank, rank_band, score,
  tlr, rpc, go, oi, pr,
  source_name, source_city, source_state, source_url,
  match_status, match_score, notes, created_at, updated_at,
  college:colleges(${COLLEGE_REF})
`;

const PUBLIC_STATUSES = ['matched', 'manual'];

export interface NIRFRankingsFilter {
  year?: number;
  years?: number[];
  state?: string;
  city?: string;
  type?: string;
  scoreMin?: number;
  scoreMax?: number;
  rankMin?: number;
  rankMax?: number;
  search?: string;
  sort?: 'rank_asc' | 'score_desc' | 'name_asc';
  page?: number;
  limit?: number;
}

const DEFAULT_LIMIT = 100;

/**
 * Get NIRF rankings with filters. Returns paginated results plus the total
 * matching count for pager UIs.
 */
export async function getNIRFRankings(
  opts: NIRFRankingsFilter = {},
  client?: TypedSupabaseClient,
): Promise<{ data: NIRFRankingWithCollege[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();
  const limit = Math.min(opts.limit ?? DEFAULT_LIMIT, 500);
  const page = Math.max(1, opts.page ?? 1);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let q = supabase
    .from('nirf_rankings')
    .select(ROW_SELECT, { count: 'exact' })
    .eq('category', 'architecture')
    .in('match_status', PUBLIC_STATUSES)
    .not('college_id', 'is', null);

  if (opts.year) q = q.eq('year', opts.year);
  if (opts.years && opts.years.length) q = q.in('year', opts.years);
  if (opts.rankMin !== undefined) q = q.gte('rank', opts.rankMin);
  if (opts.rankMax !== undefined) q = q.lte('rank', opts.rankMax);
  if (opts.scoreMin !== undefined) q = q.gte('score', opts.scoreMin);
  if (opts.scoreMax !== undefined) q = q.lte('score', opts.scoreMax);
  // Search is applied post-fetch so we can match against joined college fields
  // (name, short_name) which PostgREST cannot OR across a join.

  switch (opts.sort) {
    case 'score_desc':
      q = q.order('score', { ascending: false, nullsFirst: false });
      break;
    case 'name_asc':
      q = q.order('source_name', { ascending: true });
      break;
    case 'rank_asc':
    default:
      q = q.order('year', { ascending: false }).order('rank', { ascending: true });
  }

  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) {
    console.error('[getNIRFRankings] error', error);
    return { data: [], count: 0 };
  }

  // Apply post-fetch filters that depend on the joined college (state/city/type)
  // and the free-text search. These narrow the result set, so `count` (which
  // came from PostgREST before these filters) is overridden below to reflect
  // the actual matching row count.
  let rows = (data ?? []) as NIRFRankingWithCollege[];
  const hasPostFilters = Boolean(
    opts.state || opts.city || opts.type || opts.search,
  );
  if (opts.state) {
    rows = rows.filter(
      (r) =>
        r.college?.state_slug === opts.state ||
        r.college?.state?.toLowerCase() === opts.state.toLowerCase(),
    );
  }
  if (opts.city) {
    rows = rows.filter((r) => r.college?.city?.toLowerCase() === opts.city.toLowerCase());
  }
  if (opts.type) {
    rows = rows.filter((r) => r.college?.type?.toLowerCase() === opts.type.toLowerCase());
  }
  if (opts.search) {
    const needle = opts.search.toLowerCase();
    rows = rows.filter((r) => {
      const hay = [
        r.source_name,
        r.source_city,
        r.source_state,
        r.college?.name,
        r.college?.short_name,
        r.college?.city,
        r.college?.state,
      ]
        .filter(Boolean)
        .join(' | ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }

  return { data: rows, count: hasPostFilters ? rows.length : count ?? rows.length };
}

/**
 * Get all NIRF rankings for one college, sorted newest year first.
 */
export async function getNIRFRankingByCollege(
  collegeSlug: string,
  client?: TypedSupabaseClient,
): Promise<NIRFRankingWithCollege[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data: college, error: collErr } = await supabase
    .from('colleges')
    .select('id')
    .eq('slug', collegeSlug)
    .single();
  if (collErr || !college) return [];

  const { data, error } = await supabase
    .from('nirf_rankings')
    .select(ROW_SELECT)
    .eq('category', 'architecture')
    .eq('college_id', college.id)
    .in('match_status', PUBLIC_STATUSES)
    .order('year', { ascending: false });
  if (error) return [];
  return (data ?? []) as NIRFRankingWithCollege[];
}

/**
 * Distinct years that have public NIRF ranking data.
 */
export async function getAvailableNIRFYears(
  client?: TypedSupabaseClient,
): Promise<number[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nirf_rankings')
    .select('year')
    .eq('category', 'architecture')
    .in('match_status', PUBLIC_STATUSES)
    .not('college_id', 'is', null);
  if (error || !data) return [];
  const set = new Set<number>(data.map((r) => r.year));
  return Array.from(set).sort((a, b) => b - a);
}

/**
 * Distinct states + cities for filter dropdowns, joined from the colleges
 * referenced by NIRF rankings. Optionally scoped to a year.
 */
export async function getNIRFStatesAndCities(
  year?: number,
  client?: TypedSupabaseClient,
): Promise<{ states: { name: string; slug: string }[]; cities: { city: string; state: string }[] }> {
  const supabase = client || getSupabaseAdminClient();
  let q = supabase
    .from('nirf_rankings')
    .select('college:colleges(state, state_slug, city)')
    .eq('category', 'architecture')
    .in('match_status', PUBLIC_STATUSES)
    .not('college_id', 'is', null);
  if (year) q = q.eq('year', year);

  const { data, error } = await q;
  if (error || !data) return { states: [], cities: [] };

  const stateMap = new Map<string, string>(); // slug -> name
  const cityMap = new Map<string, string>(); // "city|state" -> ok
  for (const row of data as Array<{ college?: { state?: string; state_slug?: string; city?: string } }>) {
    const c = row.college;
    if (!c) continue;
    if (c.state && c.state_slug) stateMap.set(c.state_slug, c.state);
    if (c.city && c.state) cityMap.set(`${c.city}|${c.state}`, '');
  }
  return {
    states: Array.from(stateMap.entries())
      .map(([slug, name]) => ({ slug, name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    cities: Array.from(cityMap.keys())
      .map((k) => {
        const [city, state] = k.split('|');
        return { city, state };
      })
      .sort((a, b) => a.city.localeCompare(b.city)),
  };
}

/**
 * College slugs that have any NIRF ranking. Used by generateStaticParams.
 */
export async function getNIRFRankedCollegeSlugs(
  client?: TypedSupabaseClient,
): Promise<string[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('nirf_rankings')
    .select('college:colleges(slug)')
    .eq('category', 'architecture')
    .in('match_status', PUBLIC_STATUSES)
    .not('college_id', 'is', null);
  if (error || !data) return [];
  const slugs = new Set<string>();
  for (const row of data as Array<{ college?: { slug?: string } }>) {
    if (row.college?.slug) slugs.add(row.college.slug);
  }
  return Array.from(slugs).sort();
}

export type { NIRFRanking, NIRFRankingWithCollege };
