// @ts-nocheck
// College Hub — Supabase Data Fetching
// All ISR queries use createAdminClientISR so Next.js can statically prerender
// college pages at build time (instead of the no-store admin client which
// causes "Dynamic server usage" errors during static generation).
// getColleges() remains dynamic (searchParams-driven → always SSR anyway).
// React.cache provides per-request deduplication within a single render.

import { cache } from 'react';
import { createAdminClientISR, getSupabaseAdminClient } from '@neram/database';
import type { College, CollegeDetail, CollegeListItem, CollegeFilters } from './types';
import { COLLEGES_PER_PAGE } from './constants';

// ISR revalidation buckets — must match `export const revalidate` on the pages
const ISR_COLLEGE = 3600;   // state listings, detail pages (1 hour)
const ISR_EXAM_HUB = 86400; // TNEA / JoSAA hubs (1 day)

// ─── List queries ────────────────────────────────────────────────────────────

const LISTING_SELECT = `
  id, slug, name, short_name, city, state, state_slug, type, neram_tier,
  coa_approved, naac_grade, nirf_rank, nirf_rank_architecture, arch_index_score,
  annual_fee_min, annual_fee_max, annual_fee_approx, total_barch_seats,
  accepted_exams, counseling_systems, logo_url, hero_image_url, highlights,
  verified, data_completeness
`;

// Dynamic: called from /colleges?state=...&sort=... — page reads searchParams
// so it's always SSR. Use the regular no-store admin client here.
export async function getColleges(
  filters: CollegeFilters = {}
): Promise<{ data: CollegeListItem[]; count: number }> {
  const supabase = getSupabaseAdminClient();
  const {
    state,
    type,
    counselingSystem,
    minFee,
    maxFee,
    naacGrade,
    coa,
    search,
    sortBy = 'arch_index',
    page = 1,
    limit = COLLEGES_PER_PAGE,
  } = filters;

  let query = supabase
    .from('colleges')
    .select(LISTING_SELECT, { count: 'exact' });

  if (state) query = query.eq('state_slug', state);
  if (type) query = query.eq('type', type);
  if (counselingSystem) query = query.contains('counseling_systems', [counselingSystem]);
  if (coa !== undefined) query = query.eq('coa_approved', coa);
  if (naacGrade) query = query.eq('naac_grade', naacGrade);
  if (minFee) query = query.gte('annual_fee_approx', minFee);
  if (maxFee) query = query.lte('annual_fee_approx', maxFee);
  if (search) query = query.ilike('name', `%${search}%`);

  // Sort
  if (sortBy === 'arch_index') query = query.order('arch_index_score', { ascending: false, nullsFirst: false });
  else if (sortBy === 'nirf_rank') query = query.order('nirf_rank_architecture', { ascending: true, nullsFirst: false });
  else if (sortBy === 'fee_low') query = query.order('annual_fee_approx', { ascending: true, nullsFirst: false });
  else if (sortBy === 'fee_high') query = query.order('annual_fee_approx', { ascending: false, nullsFirst: false });
  else if (sortBy === 'name') query = query.order('name', { ascending: true });

  // Pagination
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { data: (data ?? []) as CollegeListItem[], count: count ?? 0 };
}

// ISR: state listing pages are prerendered via generateStaticParams
export const getStateColleges = cache(async (stateSlug: string): Promise<CollegeListItem[]> => {
  const supabase = createAdminClientISR(ISR_COLLEGE);
  const { data, error } = await supabase
    .from('colleges')
    .select(LISTING_SELECT)
    .eq('state_slug', stateSlug)
    .order('arch_index_score', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as CollegeListItem[];
});

// ISR: TNEA hub is prerendered, revalidated daily
export const getTNEAColleges = cache(async (): Promise<CollegeListItem[]> => {
  const supabase = createAdminClientISR(ISR_EXAM_HUB);
  const { data, error } = await supabase
    .from('colleges')
    .select(LISTING_SELECT)
    .contains('counseling_systems', ['TNEA'])
    .order('nirf_rank_architecture', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as CollegeListItem[];
});

// ISR: JoSAA hub is prerendered, revalidated daily
export const getJoSAAColleges = cache(async (): Promise<CollegeListItem[]> => {
  const supabase = createAdminClientISR(ISR_EXAM_HUB);
  const { data, error } = await supabase
    .from('colleges')
    .select(LISTING_SELECT)
    .contains('counseling_systems', ['JoSAA'])
    .order('nirf_rank', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as CollegeListItem[];
});

// ─── Detail query ────────────────────────────────────────────────────────────

// ISR: college detail pages are prerendered via generateStaticParams
export const getCollegeBySlug = cache(async (slug: string): Promise<CollegeDetail | null> => {
  const supabase = createAdminClientISR(ISR_COLLEGE);

  // Step 1: fetch the college row first (need ID for related queries)
  const { data: college, error: collegeError } = await supabase
    .from('colleges')
    .select('*')
    .eq('slug', slug)
    .single();

  if (collegeError || !college) return null;

  const collegeId = college.id;

  // Step 2: fetch all relations in parallel using the known ID
  const [feesRes, cutoffsRes, placementsRes, infraRes, facultyRes] = await Promise.all([
    supabase.from('college_fees').select('*').eq('college_id', collegeId).order('year_number'),
    supabase.from('college_cutoffs').select('*').eq('college_id', collegeId).order('academic_year', { ascending: false }),
    supabase.from('college_placements').select('*').eq('college_id', collegeId).order('academic_year', { ascending: false }),
    supabase.from('college_infrastructure').select('*').eq('college_id', collegeId).maybeSingle(),
    supabase.from('college_faculty').select('*').eq('college_id', collegeId).eq('is_active', true).order('display_order'),
  ]);

  return {
    ...(college as College),
    fees: feesRes.data ?? [],
    cutoffs: cutoffsRes.data ?? [],
    placements: placementsRes.data ?? [],
    infrastructure: infraRes.data ?? null,
    faculty: facultyRes.data ?? [],
  } as CollegeDetail;
});

// ─── Sitemap / generateStaticParams helpers ──────────────────────────────────

// These run during `next build` param generation — use ISR client for
// consistency (no-store would also work here, but ISR is safer).
export async function getAllCollegeSlugs(): Promise<
  Array<{ state: string; slug: string }>
> {
  const supabase = createAdminClientISR(ISR_COLLEGE);
  const { data, error } = await supabase
    .from('colleges')
    .select('state_slug, slug')
    .order('state_slug');
  if (error) throw error;
  return (data ?? []).map((r) => ({ state: r.state_slug ?? 'india', slug: r.slug }));
}

export async function getActiveStates(): Promise<
  Array<{ state_slug: string; state: string; count: number }>
> {
  const supabase = createAdminClientISR(ISR_COLLEGE);
  const { data, error } = await supabase
    .from('colleges')
    .select('state_slug, state')
    .not('state_slug', 'is', null);
  if (error) throw error;

  // Group by state_slug
  const counts = new Map<string, { state: string; count: number }>();
  for (const r of data ?? []) {
    if (!r.state_slug) continue;
    const existing = counts.get(r.state_slug);
    if (existing) existing.count++;
    else counts.set(r.state_slug, { state: r.state, count: 1 });
  }

  return Array.from(counts.entries()).map(([state_slug, v]) => ({
    state_slug,
    state: v.state,
    count: v.count,
  }));
}

// ─── Rankings ────────────────────────────────────────────────────────────────

// ISR: NIRF ranked colleges
export const getNIRFRankedColleges = cache(async (): Promise<CollegeListItem[]> => {
  const supabase = createAdminClientISR(ISR_EXAM_HUB);
  const { data, error } = await supabase
    .from('colleges')
    .select(LISTING_SELECT)
    .not('nirf_rank_architecture', 'is', null)
    .order('nirf_rank_architecture', { ascending: true, nullsFirst: false })
    .limit(100);
  if (error) return [];
  return (data ?? []) as CollegeListItem[];
});

// ISR: ArchIndex ranked colleges
export const getArchIndexRankedColleges = cache(async (): Promise<CollegeListItem[]> => {
  const supabase = createAdminClientISR(ISR_EXAM_HUB);
  const { data, error } = await supabase
    .from('colleges')
    .select(LISTING_SELECT)
    .not('arch_index_score', 'is', null)
    .order('arch_index_score', { ascending: false, nullsFirst: false })
    .limit(100);
  if (error) return [];
  return (data ?? []) as CollegeListItem[];
});

// ─── Fee Range ────────────────────────────────────────────────────────────────

export const FEE_RANGES = {
  'below-1-lakh':   { label: 'Below ₹1 Lakh/year',   min: 0,       max: 100000 },
  'below-2-lakhs':  { label: 'Below ₹2 Lakhs/year',  min: 0,       max: 200000 },
  'below-3-lakhs':  { label: 'Below ₹3 Lakhs/year',  min: 0,       max: 300000 },
  'below-5-lakhs':  { label: 'Below ₹5 Lakhs/year',  min: 0,       max: 500000 },
  '5-to-10-lakhs':  { label: '₹5L - ₹10L/year',      min: 500000,  max: 1000000 },
  'above-10-lakhs': { label: 'Above ₹10 Lakhs/year', min: 1000000, max: 99999999 },
} as const;

export type FeeRangeKey = keyof typeof FEE_RANGES;

export const getCollegesByFeeRange = cache(async (rangeKey: FeeRangeKey): Promise<CollegeListItem[]> => {
  const range = FEE_RANGES[rangeKey];
  if (!range) return [];
  const supabase = createAdminClientISR(ISR_EXAM_HUB);
  const { data, error } = await supabase
    .from('colleges')
    .select(LISTING_SELECT)
    .gte('annual_fee_approx', range.min)
    .lte('annual_fee_approx', range.max)
    .order('arch_index_score', { ascending: false, nullsFirst: false });
  if (error) return [];
  return (data ?? []) as CollegeListItem[];
});

// ─── Landing page stats ─────────────────────────────────────────────────────

export const getLandingStats = cache(async (): Promise<{
  totalColleges: number;
  totalStates: number;
  coaApprovedCount: number;
}> => {
  const supabase = createAdminClientISR(ISR_COLLEGE);
  const { data, error } = await supabase
    .from('colleges')
    .select('state_slug, coa_approved');
  if (error) return { totalColleges: 0, totalStates: 0, coaApprovedCount: 0 };

  const rows = data ?? [];
  const states = new Set(rows.map((r) => r.state_slug).filter(Boolean));
  const coa = rows.filter((r) => r.coa_approved).length;
  return { totalColleges: rows.length, totalStates: states.size, coaApprovedCount: coa };
});

export const getCollegeCountByType = cache(async (): Promise<{ type: string; count: number }[]> => {
  const supabase = createAdminClientISR(ISR_COLLEGE);
  const { data, error } = await supabase
    .from('colleges')
    .select('type');
  if (error) return [];

  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    if (!r.type) continue;
    counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([type, count]) => ({ type, count }));
});

export const getCollegeCountByCounseling = cache(async (): Promise<{ system: string; count: number }[]> => {
  const supabase = createAdminClientISR(ISR_COLLEGE);
  const { data, error } = await supabase
    .from('colleges')
    .select('counseling_systems');
  if (error) return [];

  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    for (const sys of r.counseling_systems ?? []) {
      counts.set(sys, (counts.get(sys) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries()).map(([system, count]) => ({ system, count }));
});

export const getFeaturedColleges = cache(async (): Promise<CollegeListItem[]> => {
  const supabase = createAdminClientISR(ISR_COLLEGE);
  const { data, error } = await supabase
    .from('colleges')
    .select(LISTING_SELECT)
    .order('name', { ascending: true })
    .limit(8);
  if (error) return [];
  return (data ?? []) as CollegeListItem[];
});

// ─── Similar ──────────────────────────────────────────────────────────────────

export const getSimilarColleges = cache(
  async (college: Pick<College, 'id' | 'state_slug' | 'type' | 'annual_fee_approx'>): Promise<CollegeListItem[]> => {
    const supabase = createAdminClientISR(ISR_COLLEGE);
    const { data, error } = await supabase
      .from('colleges')
      .select(LISTING_SELECT)
      .eq('state_slug', college.state_slug ?? '')
      .neq('id', college.id)
      .limit(4)
      .order('arch_index_score', { ascending: false, nullsFirst: false });
    if (error) return [];
    return (data ?? []) as CollegeListItem[];
  }
);
