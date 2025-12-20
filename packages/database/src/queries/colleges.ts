// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - College Queries
 *
 * Database queries for colleges and cutoff data (for tools)
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { College, CutoffData, ExamType } from '../types';

// ============================================
// COLLEGE QUERIES
// ============================================

/**
 * Get college by ID
 */
export async function getCollegeById(
  collegeId: string,
  client?: TypedSupabaseClient
): Promise<College | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('colleges')
    .select('*')
    .eq('id', collegeId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Get college by slug
 */
export async function getCollegeBySlug(
  slug: string,
  client?: TypedSupabaseClient
): Promise<College | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('colleges')
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
// LIST QUERIES
// ============================================

export interface ListCollegesOptions {
  state?: string;
  city?: string;
  type?: 'government' | 'private' | 'deemed';
  isActive?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
  orderBy?: keyof College;
  orderDirection?: 'asc' | 'desc';
}

/**
 * List colleges with filters
 */
export async function listColleges(
  options: ListCollegesOptions = {},
  client?: TypedSupabaseClient
): Promise<{ colleges: College[]; count: number }> {
  const supabase = client || getSupabaseBrowserClient();

  const {
    state,
    city,
    type,
    isActive = true,
    search,
    limit = 50,
    offset = 0,
    orderBy = 'nirf_rank',
    orderDirection = 'asc',
  } = options;

  let query = supabase
    .from('colleges')
    .select('*', { count: 'exact' });

  if (isActive !== undefined) {
    query = query.eq('is_active', isActive);
  }

  if (state) {
    query = query.eq('state', state);
  }

  if (city) {
    query = query.eq('city', city);
  }

  if (type) {
    query = query.eq('type', type);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%`);
  }

  // Handle null values in ordering (NIRF rank can be null)
  query = query
    .order(orderBy, { ascending: orderDirection === 'asc', nullsFirst: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    colleges: data || [],
    count: count || 0,
  };
}

/**
 * Search colleges
 */
export async function searchColleges(
  searchQuery: string,
  options: Omit<ListCollegesOptions, 'search'> = {},
  client?: TypedSupabaseClient
): Promise<College[]> {
  const { colleges } = await listColleges({ ...options, search: searchQuery }, client);
  return colleges;
}

/**
 * Filter colleges by state
 */
export async function filterCollegesByState(
  state: string,
  client?: TypedSupabaseClient
): Promise<College[]> {
  const { colleges } = await listColleges({ state }, client);
  return colleges;
}

/**
 * Filter colleges by city
 */
export async function filterCollegesByCity(
  city: string,
  client?: TypedSupabaseClient
): Promise<College[]> {
  const { colleges } = await listColleges({ city }, client);
  return colleges;
}

// ============================================
// DISTINCT VALUES (for dropdowns)
// ============================================

/**
 * Get distinct states
 */
export async function getDistinctStates(
  client?: TypedSupabaseClient
): Promise<string[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('colleges')
    .select('state')
    .eq('is_active', true);

  if (error) throw error;

  // Get unique states
  const rows = (data || []) as { state: string }[];
  const states = [...new Set(rows.map(d => d.state))].sort();
  return states;
}

/**
 * Get distinct cities (optionally filtered by state)
 */
export async function getDistinctCities(
  state?: string,
  client?: TypedSupabaseClient
): Promise<string[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('colleges')
    .select('city')
    .eq('is_active', true);

  if (state) {
    query = query.eq('state', state);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data || []) as { city: string }[];
  const cities = [...new Set(rows.map(d => d.city))].sort();
  return cities;
}

// ============================================
// CUTOFF DATA QUERIES
// ============================================

/**
 * Get cutoffs by college
 */
export async function getCutoffsByCollege(
  collegeId: string,
  options: { year?: number; examType?: ExamType; round?: number } = {},
  client?: TypedSupabaseClient
): Promise<CutoffData[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { year, examType, round } = options;

  let query = supabase
    .from('cutoff_data')
    .select('*')
    .eq('college_id', collegeId);

  if (year) {
    query = query.eq('year', year);
  }

  if (examType) {
    query = query.eq('exam_type', examType);
  }

  if (round) {
    query = query.eq('round', round);
  }

  query = query.order('year', { ascending: false }).order('round', { ascending: true });

  const { data, error } = await query;

  if (error) throw error;

  return data || [];
}

/**
 * Get cutoffs by year
 */
export async function getCutoffsByYear(
  year: number,
  examType?: ExamType,
  client?: TypedSupabaseClient
): Promise<CutoffData[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('cutoff_data')
    .select('*')
    .eq('year', year);

  if (examType) {
    query = query.eq('exam_type', examType);
  }

  const { data, error } = await query;

  if (error) throw error;

  return data || [];
}

/**
 * Get latest cutoff year
 */
export async function getLatestCutoffYear(
  client?: TypedSupabaseClient
): Promise<number | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('cutoff_data')
    .select('year')
    .order('year', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return (data as { year: number } | null)?.year || null;
}

// ============================================
// COMPOSITE QUERIES
// ============================================

/**
 * Get college with cutoffs
 */
export async function getCollegeWithCutoffs(
  collegeId: string,
  client?: TypedSupabaseClient
): Promise<{ college: College; cutoffs: CutoffData[] } | null> {
  const supabase = client || getSupabaseBrowserClient();

  const college = await getCollegeById(collegeId, supabase);
  if (!college) return null;

  const cutoffs = await getCutoffsByCollege(collegeId, {}, supabase);

  return { college, cutoffs };
}

// ============================================
// COLLEGE PREDICTOR
// ============================================

export type ChanceLevel = 'High' | 'Medium' | 'Low';

export interface CollegePrediction {
  college: College;
  cutoff: CutoffData;
  chance: ChanceLevel;
  scoreDifference: number;
}

/**
 * Predict colleges based on score
 */
export async function predictColleges(
  score: number,
  category: 'general' | 'obc' | 'sc' | 'st' | 'ews',
  examType: ExamType,
  state?: string,
  client?: TypedSupabaseClient
): Promise<CollegePrediction[]> {
  const supabase = client || getSupabaseBrowserClient();

  // Get latest year's cutoffs
  const latestYear = await getLatestCutoffYear(supabase);
  if (!latestYear) return [];

  // Get all cutoffs for the latest year
  const cutoffs = await getCutoffsByYear(latestYear, examType, supabase);

  // Get the category cutoff field
  const cutoffField = `${category}_cutoff` as keyof CutoffData;

  // Filter cutoffs with valid scores
  const validCutoffs = cutoffs.filter(c => c[cutoffField] !== null);

  // Get college IDs
  const collegeIds = [...new Set(validCutoffs.map(c => c.college_id))];

  // Fetch all colleges
  const { colleges } = await listColleges({
    isActive: true,
    limit: 1000,
  }, supabase);

  // Create college map
  const collegeMap = new Map(colleges.map(c => [c.id, c]));

  // Calculate predictions
  const predictions: CollegePrediction[] = [];

  for (const cutoff of validCutoffs) {
    const college = collegeMap.get(cutoff.college_id);
    if (!college) continue;

    // Filter by state if specified
    if (state && college.state !== state) continue;

    const cutoffScore = cutoff[cutoffField] as number;
    const scoreDifference = score - cutoffScore;

    let chance: ChanceLevel;
    if (scoreDifference >= 10) {
      chance = 'High';
    } else if (scoreDifference >= 0) {
      chance = 'Medium';
    } else if (scoreDifference >= -10) {
      chance = 'Low';
    } else {
      continue; // Too low, skip
    }

    predictions.push({
      college,
      cutoff,
      chance,
      scoreDifference,
    });
  }

  // Sort by chance (High first) then by score difference
  predictions.sort((a, b) => {
    const chanceOrder = { High: 0, Medium: 1, Low: 2 };
    const chanceDiff = chanceOrder[a.chance] - chanceOrder[b.chance];
    if (chanceDiff !== 0) return chanceDiff;
    return b.scoreDifference - a.scoreDifference;
  });

  return predictions;
}

// ============================================
// WRITE OPERATIONS (Admin only)
// ============================================

/**
 * Create a new college
 */
export async function createCollege(
  collegeData: Omit<College, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<College> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('colleges')
    .insert(collegeData as any)
    .select()
    .single();

  if (error) throw error;
  return data as College;
}

/**
 * Update college
 */
export async function updateCollege(
  collegeId: string,
  updates: Partial<Omit<College, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<College> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('colleges')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', collegeId)
    .select()
    .single();

  if (error) throw error;
  return data as College;
}

/**
 * Create cutoff data
 */
export async function createCutoffData(
  cutoffData: Omit<CutoffData, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<CutoffData> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('cutoff_data')
    .insert(cutoffData)
    .select()
    .single();

  if (error) throw error;
  return data as CutoffData;
}

/**
 * Update cutoff data
 */
export async function updateCutoffData(
  cutoffId: string,
  updates: Partial<Omit<CutoffData, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<CutoffData> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('cutoff_data')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', cutoffId)
    .select()
    .single();

  if (error) throw error;
  return data as CutoffData;
}
