// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Counseling Intelligence Queries
 *
 * Public-facing queries for counseling systems, rank predictions,
 * college predictions, and historical data.
 */

import { getSupabaseBrowserClient, TypedSupabaseClient } from '../client';
import type {
  CounselingSystem,
  CollegeCounselingParticipation,
  HistoricalCutoff,
  RankListEntry,
  AllotmentListEntry,
  College,
  RankPredictionResult,
  PredictionDataSource,
  CounselingCollegePrediction,
  AllotmentCollegePrediction,
  CollegeTier,
  PredictionLog,
  CounselingCollegeDirectory,
  SimilarStudent,
} from '../types';

// ============================================
// COUNSELING SYSTEM QUERIES
// ============================================

/**
 * Get all active counseling systems
 */
export async function getCounselingSystems(
  client?: TypedSupabaseClient
): Promise<CounselingSystem[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('counseling_systems')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw error;
  return data || [];
}

/**
 * Get a counseling system by its code (e.g., 'TNEA_BARCH')
 */
export async function getCounselingSystemByCode(
  code: string,
  client?: TypedSupabaseClient
): Promise<CounselingSystem | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('counseling_systems')
    .select('*')
    .eq('code', code)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

/**
 * Get a counseling system by slug (for marketing pages)
 */
export async function getCounselingSystemBySlug(
  slug: string,
  client?: TypedSupabaseClient
): Promise<CounselingSystem | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('counseling_systems')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

// ============================================
// COLLEGE PARTICIPATION QUERIES
// ============================================

/**
 * Get colleges participating in a counseling system for a given year
 */
export async function getCollegesByCounselingSystem(
  systemId: string,
  year: number,
  client?: TypedSupabaseClient
): Promise<(CollegeCounselingParticipation & { college: College })[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('college_counseling_participation')
    .select('*, college:colleges(*)')
    .eq('counseling_system_id', systemId)
    .eq('year', year)
    .eq('is_active', true);

  if (error) throw error;
  return (data || []) as any;
}

/**
 * Get participation years for a counseling system
 */
export async function getParticipationYears(
  systemId: string,
  client?: TypedSupabaseClient
): Promise<number[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('college_counseling_participation')
    .select('year')
    .eq('counseling_system_id', systemId)
    .order('year', { ascending: false });

  if (error) throw error;
  const years = [...new Set((data || []).map((d: any) => d.year))];
  return years;
}

// ============================================
// HISTORICAL CUTOFF QUERIES
// ============================================

export interface CutoffQueryOptions {
  collegeId?: string;
  category?: string;
  round?: string;
  branchCode?: string;
  limit?: number;
}

/**
 * Get historical cutoffs for a counseling system and year
 */
export async function getHistoricalCutoffs(
  systemId: string,
  year: number,
  options: CutoffQueryOptions = {},
  client?: TypedSupabaseClient
): Promise<HistoricalCutoff[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('historical_cutoffs')
    .select('*')
    .eq('counseling_system_id', systemId)
    .eq('year', year);

  if (options.collegeId) {
    query = query.eq('college_id', options.collegeId);
  }
  if (options.category) {
    query = query.eq('category', options.category);
  }
  if (options.round) {
    query = query.eq('round', options.round);
  }
  if (options.branchCode) {
    query = query.eq('branch_code', options.branchCode);
  }

  query = query.order('closing_rank', { ascending: true, nullsFirst: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Get available cutoff years for a counseling system
 */
export async function getCutoffYears(
  systemId: string,
  client?: TypedSupabaseClient
): Promise<number[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('historical_cutoffs')
    .select('year')
    .eq('counseling_system_id', systemId)
    .order('year', { ascending: false });

  if (error) throw error;
  const years = [...new Set((data || []).map((d: any) => d.year))];
  return years;
}

/**
 * Get cutoff history for a specific college across years
 */
export async function getCollegeCutoffHistory(
  collegeId: string,
  systemId: string,
  category: string,
  client?: TypedSupabaseClient
): Promise<HistoricalCutoff[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('historical_cutoffs')
    .select('*')
    .eq('college_id', collegeId)
    .eq('counseling_system_id', systemId)
    .eq('category', category)
    .order('year', { ascending: false })
    .order('round', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ============================================
// RANK LIST QUERIES
// ============================================

/**
 * Get rank list entries for a system and year
 */
export async function getRankListEntries(
  systemId: string,
  year: number,
  options: { community?: string; limit?: number; offset?: number } = {},
  client?: TypedSupabaseClient
): Promise<{ entries: RankListEntry[]; count: number }> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('rank_list_entries')
    .select('*', { count: 'exact' })
    .eq('counseling_system_id', systemId)
    .eq('year', year);

  if (options.community) {
    query = query.eq('community', options.community);
  }

  query = query.order('rank', { ascending: true });

  if (options.limit) {
    const offset = options.offset || 0;
    query = query.range(offset, offset + options.limit - 1);
  }

  const { data, error, count } = await query;
  if (error) throw error;
  return { entries: data || [], count: count || 0 };
}

/**
 * Get available years that have rank list OR allotment data.
 * Merges both sources, deduplicates, and returns in descending order.
 * Each year includes source info for the UI.
 */
export async function getRankListYears(
  systemId: string,
  client?: TypedSupabaseClient
): Promise<number[]> {
  const [rankSummary, allotmentSummary] = await Promise.all([
    getRankListYearSummary(systemId, client),
    getAllotmentYearSummary(systemId, client),
  ]);
  const yearsSet = new Set<number>();
  rankSummary.forEach((s) => yearsSet.add(s.year));
  allotmentSummary.forEach((s) => yearsSet.add(s.year));
  return [...yearsSet].sort((a, b) => b - a);
}

/**
 * Get available years with source info (rank_list vs allotment vs both).
 * Used by the API to tell the UI which data source each year uses.
 */
export async function getAvailableYearsWithSource(
  systemId: string,
  client?: TypedSupabaseClient
): Promise<{ year: number; source: 'rank_list' | 'allotment' | 'both'; count: number }[]> {
  const [rankSummary, allotmentSummary] = await Promise.all([
    getRankListYearSummary(systemId, client),
    getAllotmentYearSummary(systemId, client),
  ]);

  const yearMap = new Map<number, { rankCount: number; allotmentCount: number }>();
  rankSummary.forEach((s) => {
    const existing = yearMap.get(s.year) || { rankCount: 0, allotmentCount: 0 };
    existing.rankCount = s.totalEntries;
    yearMap.set(s.year, existing);
  });
  allotmentSummary.forEach((s) => {
    const existing = yearMap.get(s.year) || { rankCount: 0, allotmentCount: 0 };
    existing.allotmentCount = s.totalEntries;
    yearMap.set(s.year, existing);
  });

  return [...yearMap.entries()]
    .map(([year, { rankCount, allotmentCount }]) => ({
      year,
      source: (rankCount > 0 && allotmentCount > 0 ? 'both' : rankCount > 0 ? 'rank_list' : 'allotment') as 'rank_list' | 'allotment' | 'both',
      count: rankCount || allotmentCount,
    }))
    .sort((a, b) => b.year - a.year);
}

/**
 * Find students with similar scores (for rank predictor UI)
 * Returns anonymized entries within ±range marks of the input score
 */
export async function findSimilarStudents(
  systemId: string,
  year: number,
  score: number,
  range: number = 5,
  limit: number = 20,
  client?: TypedSupabaseClient
): Promise<RankListEntry[]> {
  const supabase = client || getSupabaseBrowserClient();

  // Try with initial range, expand if empty (e.g. score above/below all data)
  for (const r of [range, 20, 50]) {
    const { data, error } = await supabase
      .from('rank_list_entries')
      .select('*')
      .eq('counseling_system_id', systemId)
      .eq('year', year)
      .gte('aggregate_mark', score - r)
      .lte('aggregate_mark', score + r)
      .order('rank', { ascending: true })
      .limit(limit);

    if (error) throw error;
    if (data && data.length > 0) return data;
  }

  return [];
}

/**
 * Find similar students from allotment data within ±range marks.
 * Returns entries shaped like RankListEntry for UI compatibility.
 */
export async function findSimilarStudentsFromAllotment(
  systemId: string,
  year: number,
  score: number,
  range: number = 5,
  limit: number = 20,
  client?: TypedSupabaseClient,
  predictedRank?: number,
  category?: string
): Promise<any[]> {
  const supabase = client || getSupabaseBrowserClient();

  let data: any[] | null = null;

  // Strategy: find students near the PREDICTED RANK (not just score range)
  // This gives more relevant results centered around where the user would actually be
  if (predictedRank) {
    const rankRange = 15; // ±15 ranks around predicted
    const { data: result, error } = await supabase
      .from('allotment_list_entries')
      .select('rank, aggregate_mark, community, college_code, college_name, allotted_category, candidate_name')
      .eq('counseling_system_id', systemId)
      .eq('year', year)
      .not('rank', 'is', null)
      .not('aggregate_mark', 'is', null)
      .gte('rank', Math.max(1, predictedRank - rankRange))
      .lte('rank', predictedRank + rankRange)
      .order('rank', { ascending: true })
      .limit(limit);

    if (error) throw error;
    if (result && result.length > 0) data = result;
  }

  // Fallback: search by score range if rank-based search found nothing
  if (!data) {
    for (const r of [range, 20, 50]) {
      const { data: result, error } = await supabase
        .from('allotment_list_entries')
        .select('rank, aggregate_mark, community, college_code, college_name, allotted_category, candidate_name')
        .eq('counseling_system_id', systemId)
        .eq('year', year)
        .not('rank', 'is', null)
        .not('aggregate_mark', 'is', null)
        .gte('aggregate_mark', score - r)
        .lte('aggregate_mark', score + r)
        .order('rank', { ascending: true })
        .limit(limit);

      if (error) throw error;
      if (result && result.length > 0) {
        data = result;
        break;
      }
    }
  }

  if (!data || data.length === 0) return [];

  // Compute community rank for each student by counting how many of the same
  // community have a better (lower) rank in the full dataset
  const communities = [...new Set(data.map((d: any) => d.community))];
  const communityRankMap = new Map<string, number>();

  // For each community represented, get the count of students with better rank
  if (category || communities.length > 0) {
    const targetCommunities = category ? [category, ...communities.filter(c => c !== category)] : communities;
    for (const comm of targetCommunities) {
      // Find the best (lowest) rank in our result set for this community
      const bestRankInSet = data.filter((d: any) => d.community === comm)
        .reduce((min: number, d: any) => Math.min(min, d.rank), Infinity);

      if (bestRankInSet < Infinity) {
        const { count, error } = await supabase
          .from('allotment_list_entries')
          .select('*', { count: 'exact', head: true })
          .eq('counseling_system_id', systemId)
          .eq('year', year)
          .eq('community', comm)
          .not('rank', 'is', null)
          .lt('rank', bestRankInSet);

        if (!error && count != null) {
          // The community rank of the best student in our set = count + 1
          communityRankMap.set(`${comm}_${bestRankInSet}`, count + 1);
        }
      }
    }
  }

  // Build a running community rank counter for students in our result set
  const communityCounters = new Map<string, number>();
  // First pass: get the base rank for the first student of each community
  for (const comm of communities) {
    const firstOfComm = data.find((d: any) => d.community === comm);
    if (firstOfComm) {
      const baseRank = communityRankMap.get(`${comm}_${firstOfComm.rank}`);
      communityCounters.set(comm, baseRank || 0);
    }
  }

  // Map to SimilarStudent shape — includes college info and computed community rank
  let lastCommunityRanks = new Map<string, number>();
  return data.map((d: any) => {
    let commRank: number | null = null;
    const base = communityCounters.get(d.community);
    if (base != null && base > 0) {
      const current = (lastCommunityRanks.get(d.community) || 0) + 1;
      lastCommunityRanks.set(d.community, current);
      commRank = base + current - 1;
    }

    return {
      rank: d.rank,
      aggregate_mark: d.aggregate_mark,
      community: d.community,
      community_rank: commRank,
      college_code: d.college_code || undefined,
      college_name: d.college_name || undefined,
      allotted_category: d.allotted_category || undefined,
      candidate_name: d.candidate_name || undefined,
    };
  });
}

/**
 * Predict rank from composite score.
 * First tries rank_list_entries; falls back to allotment_list_entries if no rank list data exists.
 * Uses linear interpolation between nearest entries.
 */
export async function predictRankFromScore(
  systemId: string,
  year: number,
  score: number,
  category?: string,
  client?: TypedSupabaseClient
): Promise<RankPredictionResult | null> {
  const supabase = client || getSupabaseBrowserClient();

  // Determine data source: prefer rank_list, fall back to allotment
  const rankListSummary = await getRankListYearSummary(systemId, supabase);
  const rankListYear = rankListSummary.find((ys) => ys.year === year);
  const rankListCount = rankListYear?.totalEntries || 0;

  let tableName: string;
  let dataSource: PredictionDataSource;
  let dataSourceLabel: string;
  let totalCandidates: number;

  if (rankListCount > 0) {
    tableName = 'rank_list_entries';
    dataSource = 'rank_list';
    dataSourceLabel = `${year} data`;
    totalCandidates = rankListCount;
  } else {
    // Fall back to allotment data
    const allotmentSummary = await getAllotmentYearSummary(systemId, supabase);
    const allotmentYear = allotmentSummary.find((ys) => ys.year === year);
    const allotmentCount = allotmentYear?.totalEntries || 0;
    if (allotmentCount === 0) return null;
    tableName = 'allotment_list_entries';
    dataSource = 'allotment_list';
    dataSourceLabel = `${year} data`;
    totalCandidates = allotmentCount;
  }

  // Fetch nearby entries (for matched count) — expand range if ±5 finds nothing
  let nearbyEntries: any[] | null = null;
  for (const r of [5, 20, 50]) {
    const { data } = await supabase
      .from(tableName)
      .select('rank, aggregate_mark, community')
      .eq('counseling_system_id', systemId)
      .eq('year', year)
      .not('rank', 'is', null)
      .not('aggregate_mark', 'is', null)
      .gte('aggregate_mark', score - r)
      .lte('aggregate_mark', score + r)
      .order('rank', { ascending: true });
    if (data && data.length > 0) {
      nearbyEntries = data;
      break;
    }
  }

  // ============================================
  // OVERALL RANK: Interpolate to single point, then ±5
  // ============================================
  const [{ data: entryAbove }, { data: entryBelow }] = await Promise.all([
    supabase.from(tableName).select('rank, aggregate_mark')
      .eq('counseling_system_id', systemId).eq('year', year)
      .not('rank', 'is', null).not('aggregate_mark', 'is', null)
      .gte('aggregate_mark', score)
      .order('aggregate_mark', { ascending: true }).limit(1),
    supabase.from(tableName).select('rank, aggregate_mark')
      .eq('counseling_system_id', systemId).eq('year', year)
      .not('rank', 'is', null).not('aggregate_mark', 'is', null)
      .lte('aggregate_mark', score)
      .order('aggregate_mark', { ascending: false }).limit(1),
  ]);

  let predictedRank: number;

  if (entryAbove?.length && entryBelow?.length) {
    const a = entryAbove[0] as any;
    const b = entryBelow[0] as any;
    if (a.aggregate_mark === b.aggregate_mark) {
      predictedRank = Math.round((a.rank + b.rank) / 2);
    } else {
      const ratio = (a.aggregate_mark - score) / (a.aggregate_mark - b.aggregate_mark);
      predictedRank = Math.round(a.rank + ratio * (b.rank - a.rank));
    }
  } else if (entryAbove?.length && !entryBelow?.length) {
    // Score is BELOW the entire dataset — worst case
    predictedRank = totalCandidates;
  } else if (entryBelow?.length && !entryAbove?.length) {
    // Score is ABOVE the entire dataset — best case
    predictedRank = 1;
  } else {
    return null;
  }

  const predictedRankMin = Math.max(1, predictedRank - 5);
  const predictedRankMax = Math.min(totalCandidates, predictedRank + 5);

  // ============================================
  // CATEGORY RANK
  // ============================================
  let categoryRankMin: number | null = null;
  let categoryRankMax: number | null = null;

  if (category) {
    if (dataSource === 'rank_list') {
      // Check if community_rank is populated for this category
      const catNearby = (nearbyEntries || []).filter((e: any) => e.community === category);
      const { data: catCheckData } = await supabase
        .from('rank_list_entries')
        .select('community_rank')
        .eq('counseling_system_id', systemId).eq('year', year)
        .eq('community', category)
        .not('community_rank', 'is', null)
        .limit(1);
      const hasCommunityRank = catCheckData && catCheckData.length > 0;

      if (hasCommunityRank) {
        const [{ data: catAbove }, { data: catBelow }] = await Promise.all([
          supabase.from('rank_list_entries')
            .select('community_rank, aggregate_mark')
            .eq('counseling_system_id', systemId).eq('year', year)
            .eq('community', category)
            .gte('aggregate_mark', score)
            .not('community_rank', 'is', null)
            .order('aggregate_mark', { ascending: true }).limit(1),
          supabase.from('rank_list_entries')
            .select('community_rank, aggregate_mark')
            .eq('counseling_system_id', systemId).eq('year', year)
            .eq('community', category)
            .lte('aggregate_mark', score)
            .not('community_rank', 'is', null)
            .order('aggregate_mark', { ascending: false }).limit(1),
        ]);

        let catRank: number | null = null;
        if (catAbove?.length && catBelow?.length) {
          const a = catAbove[0] as any;
          const b = catBelow[0] as any;
          if (a.aggregate_mark === b.aggregate_mark) {
            catRank = Math.round((a.community_rank + b.community_rank) / 2);
          } else {
            const ratio = (a.aggregate_mark - score) / (a.aggregate_mark - b.aggregate_mark);
            catRank = Math.round(a.community_rank + ratio * (b.community_rank - a.community_rank));
          }
        } else if (catAbove?.length) {
          catRank = (catAbove[0] as any).community_rank;
        } else if (catBelow?.length) {
          catRank = (catBelow[0] as any).community_rank;
        }

        if (catRank != null) {
          categoryRankMin = Math.max(1, catRank - 5);
          categoryRankMax = catRank + 5;
        }
      }
    }

    // Fallback for both rank_list (no community_rank) and allotment data:
    // count students with higher score in same category
    if (categoryRankMin == null) {
      const { count: higherCount } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .eq('counseling_system_id', systemId)
        .eq('year', year)
        .eq('community', category)
        .not('aggregate_mark', 'is', null)
        .gt('aggregate_mark', score);

      const { count: catTotal } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .eq('counseling_system_id', systemId)
        .eq('year', year)
        .eq('community', category);

      if (catTotal && catTotal > 0) {
        const estimatedRank = (higherCount || 0) + 1;
        categoryRankMin = Math.max(1, estimatedRank - 3);
        categoryRankMax = Math.min(catTotal, estimatedRank + 3);
      }
    }
  }

  // Percentile
  const midRank = Math.round((predictedRankMin + predictedRankMax) / 2);
  const percentile = Math.round(((totalCandidates - midRank) / totalCandidates) * 100);

  // Similar students from whichever data source is available
  let similarStudents = dataSource === 'rank_list'
    ? await findSimilarStudents(systemId, year, score, 5, 20, supabase)
    : await findSimilarStudentsFromAllotment(systemId, year, score, 5, 20, supabase, predictedRank, category);

  // Enrich missing college names from directory (when allotment data is source)
  if (dataSource === 'allotment_list') {
    similarStudents = await enrichCollegeNames(similarStudents, systemId, supabase);
  }

  return {
    predictedRankMin,
    predictedRankMax,
    categoryRankMin,
    categoryRankMax,
    percentile,
    totalCandidates,
    matchedEntries: nearbyEntries?.length || 0,
    year,
    similarStudents,
    dataSource,
    dataSourceLabel,
  };
}

// ============================================
// COLLEGE PREDICTION QUERIES
// ============================================

/**
 * Forward prediction: Given a predicted rank, find matching colleges.
 * Classifies each college as Safe, Moderate, or Reach.
 */
export async function predictCollegesFromRank(
  systemId: string,
  year: number,
  predictedRank: number,
  category: string,
  options: {
    round?: string;
    branchCode?: string;
    collegeType?: string;
    state?: string;
    maxFee?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<CounselingCollegePrediction[]> {
  const supabase = client || getSupabaseBrowserClient();

  // Get cutoffs for this system, year, category
  let query = supabase
    .from('historical_cutoffs')
    .select('*')
    .eq('counseling_system_id', systemId)
    .eq('year', year)
    .eq('category', category);

  if (options.round) {
    query = query.eq('round', options.round);
  } else {
    // Default to final round or the latest round
    query = query.or('round.eq.final,round.eq.round_3,round.eq.round_2,round.eq.round_1');
  }

  if (options.branchCode) {
    query = query.eq('branch_code', options.branchCode);
  }

  const { data: cutoffs, error: cutoffError } = await query;
  if (cutoffError) throw cutoffError;
  if (!cutoffs || cutoffs.length === 0) return [];

  // Get college details for all matched colleges
  const collegeIds = [...new Set(cutoffs.map((c: any) => c.college_id))];

  let collegeQuery = supabase
    .from('colleges')
    .select('*')
    .in('id', collegeIds)
    .eq('is_active', true);

  if (options.state) {
    collegeQuery = collegeQuery.eq('state', options.state);
  }

  const { data: colleges, error: collegeError } = await collegeQuery;
  if (collegeError) throw collegeError;

  const collegeMap = new Map((colleges || []).map((c: any) => [c.id, c]));

  // Build predictions with tier classification
  const predictions: CounselingCollegePrediction[] = [];

  // For each cutoff, keep only the latest round per college+branch
  const latestCutoffs = new Map<string, any>();
  for (const cutoff of cutoffs) {
    const key = `${cutoff.college_id}-${cutoff.branch_code}`;
    const existing = latestCutoffs.get(key);
    if (!existing || cutoff.round > existing.round) {
      latestCutoffs.set(key, cutoff);
    }
  }

  for (const [, cutoff] of latestCutoffs) {
    const college = collegeMap.get(cutoff.college_id);
    if (!college) continue;

    // Apply fee filter
    if (options.maxFee && college.annual_fee_approx && college.annual_fee_approx > options.maxFee) {
      continue;
    }

    const closingRank = cutoff.closing_rank;
    if (!closingRank) continue;

    // Tier classification
    let tier: CollegeTier;
    if (predictedRank < closingRank * 0.7) {
      tier = 'safe';
    } else if (predictedRank < closingRank) {
      tier = 'moderate';
    } else if (predictedRank < closingRank * 1.3) {
      tier = 'reach';
    } else {
      continue; // Too unlikely, skip
    }

    predictions.push({
      college: college as College,
      tier,
      closingRank,
      closingMark: cutoff.closing_mark,
      predictedRank,
      scoreDifference: closingRank - predictedRank,
      year,
      category,
    });
  }

  // Sort: safe first, then moderate, then reach. Within tier, by closing rank
  const tierOrder: Record<CollegeTier, number> = { safe: 0, moderate: 1, reach: 2 };
  predictions.sort((a, b) => {
    const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
    if (tierDiff !== 0) return tierDiff;
    return (a.closingRank || 0) - (b.closingRank || 0);
  });

  return predictions;
}

/**
 * Reverse prediction: Given a college, find the required score/rank.
 */
export async function getRequiredScoreForCollege(
  collegeId: string,
  systemId: string,
  year: number,
  category: string,
  client?: TypedSupabaseClient
): Promise<{
  closingMark: number | null;
  closingRank: number | null;
  openingMark: number | null;
  openingRank: number | null;
  round: string;
  branchCode: string;
  history: HistoricalCutoff[];
} | null> {
  const supabase = client || getSupabaseBrowserClient();

  // Get the latest round cutoff for this college
  const { data, error } = await supabase
    .from('historical_cutoffs')
    .select('*')
    .eq('college_id', collegeId)
    .eq('counseling_system_id', systemId)
    .eq('year', year)
    .eq('category', category)
    .order('round', { ascending: false })
    .limit(1);

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const cutoff = data[0] as any;

  // Get history across years for trend
  const history = await getCollegeCutoffHistory(collegeId, systemId, category, supabase);

  return {
    closingMark: cutoff.closing_mark,
    closingRank: cutoff.closing_rank,
    openingMark: cutoff.opening_mark,
    openingRank: cutoff.opening_rank,
    round: cutoff.round,
    branchCode: cutoff.branch_code,
    history,
  };
}

// ============================================
// ALLOTMENT LIST QUERIES
// ============================================

/**
 * Get allotment entries for a system and year
 */
export async function getAllotmentEntries(
  systemId: string,
  year: number,
  options: { collegeId?: string; category?: string; limit?: number } = {},
  client?: TypedSupabaseClient
): Promise<AllotmentListEntry[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('allotment_list_entries')
    .select('*')
    .eq('counseling_system_id', systemId)
    .eq('year', year);

  if (options.collegeId) {
    query = query.eq('college_id', options.collegeId);
  }
  if (options.category) {
    query = query.eq('allotted_category', options.category);
  }

  query = query.order('rank', { ascending: true });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ============================================
// PREDICTION LOGGING
// ============================================

/**
 * Log a prediction run for analytics
 */
export async function logPrediction(
  data: Omit<PredictionLog, 'id' | 'created_at'>,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseBrowserClient();

  const { error } = await supabase
    .from('prediction_logs')
    .insert(data as any);

  if (error) {
    console.error('Failed to log prediction:', error);
    // Don't throw — logging failure shouldn't break the prediction
  }
}

// ============================================
// RANK LIST STATISTICS
// ============================================

/**
 * Get year-wise summary of rank list entries for a counseling system.
 * Returns which years have data and how many records each year has.
 * Uses server-side RPC to avoid Supabase's default 1000-row limit.
 */
export async function getRankListYearSummary(
  systemId: string,
  client?: TypedSupabaseClient
): Promise<{ year: number; totalEntries: number }[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await (supabase as any).rpc('get_rank_list_year_summary', {
    p_system_id: systemId,
  });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    year: row.year,
    totalEntries: Number(row.total_entries),
  }));
}

/**
 * Get community-wise breakdown stats for a counseling system + year.
 * Returns count, rank range, and average score per community category.
 * Uses server-side RPC to avoid Supabase's default 1000-row limit.
 */
export async function getRankListCommunityStats(
  systemId: string,
  year: number,
  client?: TypedSupabaseClient
): Promise<{
  community: string;
  count: number;
  minRank: number;
  maxRank: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
}[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await (supabase as any).rpc('get_rank_list_community_stats', {
    p_system_id: systemId,
    p_year: year,
  });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    community: row.community,
    count: Number(row.count),
    minRank: row.min_rank,
    maxRank: row.max_rank,
    avgScore: Number(row.avg_score),
    minScore: Number(row.min_score),
    maxScore: Number(row.max_score),
  }));
}

// ============================================
// ALLOTMENT LIST STATISTICS
// ============================================

/**
 * Get year-wise summary of allotment list entries.
 * Uses server-side RPC to avoid 1000-row limit.
 */
export async function getAllotmentYearSummary(
  systemId: string,
  client?: TypedSupabaseClient
): Promise<{ year: number; totalEntries: number }[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await (supabase as any).rpc('get_allotment_year_summary', {
    p_system_id: systemId,
  });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    year: row.year,
    totalEntries: Number(row.total_entries),
  }));
}

/**
 * Get community-wise breakdown stats for allotment data.
 * Uses server-side RPC.
 */
export async function getAllotmentCommunityStats(
  systemId: string,
  year: number,
  client?: TypedSupabaseClient
): Promise<{
  community: string;
  count: number;
  minRank: number;
  maxRank: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
}[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await (supabase as any).rpc('get_allotment_community_stats', {
    p_system_id: systemId,
    p_year: year,
  });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    community: row.community,
    count: Number(row.count),
    minRank: row.min_rank,
    maxRank: row.max_rank,
    avgScore: Number(row.avg_score),
    minScore: Number(row.min_score),
    maxScore: Number(row.max_score),
  }));
}

// ============================================
// ALLOTMENT-BASED COLLEGE PREDICTION
// ============================================

/**
 * Predict colleges from allotment data.
 * Finds which colleges students at similar ranks (±50 ranks) actually got allotted to.
 * Groups by college + branch, showing count, rank range, and categories.
 */
export async function predictCollegesFromAllotment(
  systemId: string,
  year: number,
  predictedRank: number,
  category?: string,
  client?: TypedSupabaseClient
): Promise<AllotmentCollegePrediction[]> {
  const supabase = client || getSupabaseBrowserClient();

  // Find allotment entries within ±50 ranks of predicted rank
  const rankMin = Math.max(1, predictedRank - 50);
  const rankMax = predictedRank + 50;

  let query = supabase
    .from('allotment_list_entries')
    .select('college_code, college_name, branch_code, branch_name, rank, aggregate_mark, community, allotted_category')
    .eq('counseling_system_id', systemId)
    .eq('year', year)
    .not('rank', 'is', null)
    .gte('rank', rankMin)
    .lte('rank', rankMax)
    .order('rank', { ascending: true })
    .limit(500);

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return [];

  // Group by college_code + branch_code
  const grouped = new Map<string, {
    collegeCode: string;
    collegeName: string | null;
    branchCode: string;
    branchName: string | null;
    ranks: number[];
    scores: number[];
    categories: Set<string>;
  }>();

  for (const entry of data as any[]) {
    const key = `${entry.college_code}-${entry.branch_code}`;
    let group = grouped.get(key);
    if (!group) {
      group = {
        collegeCode: entry.college_code,
        collegeName: entry.college_name,
        branchCode: entry.branch_code,
        branchName: entry.branch_name,
        ranks: [],
        scores: [],
        categories: new Set(),
      };
      grouped.set(key, group);
    }
    if (entry.rank) group.ranks.push(entry.rank);
    if (entry.aggregate_mark) group.scores.push(entry.aggregate_mark);
    group.categories.add(entry.allotted_category);
  }

  const predictions: AllotmentCollegePrediction[] = [];
  for (const [, group] of grouped) {
    if (group.ranks.length === 0) continue;
    predictions.push({
      collegeCode: group.collegeCode,
      collegeName: group.collegeName,
      branchCode: group.branchCode,
      branchName: group.branchName,
      allottedCount: group.ranks.length,
      minRank: Math.min(...group.ranks),
      maxRank: Math.max(...group.ranks),
      avgScore: Math.round((group.scores.reduce((a, b) => a + b, 0) / group.scores.length) * 100) / 100,
      categories: [...group.categories],
      year,
    });
  }

  // Sort by allotted count descending (most popular colleges first)
  predictions.sort((a, b) => b.allottedCount - a.allottedCount);

  // Enrich missing college names from directory
  const codesWithoutNames = predictions
    .filter(p => !p.collegeName && p.collegeCode)
    .map(p => p.collegeCode);

  if (codesWithoutNames.length > 0) {
    const directory = await getCollegeDirectory(systemId, supabase);
    for (const pred of predictions) {
      if (!pred.collegeName && directory.has(pred.collegeCode)) {
        pred.collegeName = directory.get(pred.collegeCode)!;
      }
    }
  }

  return predictions;
}

// ============================================
// COLLEGE DIRECTORY LOOKUP
// ============================================

/**
 * Get the full college directory for a counseling system.
 * Returns a Map of college_code → college_name for fast lookups.
 */
export async function getCollegeDirectory(
  systemId: string,
  client?: TypedSupabaseClient
): Promise<Map<string, string>> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('counseling_college_directory')
    .select('college_code, college_name')
    .eq('counseling_system_id', systemId)
    .order('college_code');

  if (error) throw error;

  const map = new Map<string, string>();
  for (const entry of (data || []) as any[]) {
    map.set(entry.college_code, entry.college_name);
  }
  return map;
}

/**
 * Get full college directory entries (with city, district) for admin display.
 */
export async function getCollegeDirectoryEntries(
  systemId: string,
  client?: TypedSupabaseClient
): Promise<CounselingCollegeDirectory[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('counseling_college_directory')
    .select('*')
    .eq('counseling_system_id', systemId)
    .order('college_code');

  if (error) throw error;
  return (data || []) as CounselingCollegeDirectory[];
}

/**
 * Look up a single college name by code.
 */
export async function getCollegeNameByCode(
  systemId: string,
  code: string,
  client?: TypedSupabaseClient
): Promise<string | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('counseling_college_directory')
    .select('college_name')
    .eq('counseling_system_id', systemId)
    .eq('college_code', code)
    .single();

  if (error) return null;
  return (data as any)?.college_name || null;
}

/**
 * Enrich entries that have college_code but missing college_name
 * by looking up from the counseling_college_directory.
 */
export async function enrichCollegeNames<T extends { college_code?: string; college_name?: string | null }>(
  entries: T[],
  systemId: string,
  client?: TypedSupabaseClient
): Promise<T[]> {
  const needsEnrichment = entries.filter(e => e.college_code && !e.college_name);
  if (needsEnrichment.length === 0) return entries;

  const directory = await getCollegeDirectory(systemId, client);

  return entries.map(entry => {
    if (entry.college_code && !entry.college_name && directory.has(entry.college_code)) {
      return { ...entry, college_name: directory.get(entry.college_code)! };
    }
    return entry;
  });
}
