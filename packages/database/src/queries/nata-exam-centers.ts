// @ts-nocheck - Database type needs regeneration for Supabase v2 compat
/**
 * Neram Classes - NATA Exam Centers Queries
 *
 * Rich NATA-specific exam center data with confidence levels,
 * evidence sources, year tracking, and bulk operations.
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  NataExamCenter,
  NataExamCenterWithDistance,
  NataStateSummary,
  NataExamCenterStats,
  CenterConfidence,
  CityPopulationTier,
} from '../types';

// ============================================
// LIST & FILTER QUERIES
// ============================================

export interface ListNataExamCentersOptions {
  state?: string;
  city?: string;
  confidence?: CenterConfidence;
  tier?: CityPopulationTier;
  tcsIonOnly?: boolean;
  barchOnly?: boolean;
  newOnly?: boolean;
  year?: number;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function listNataExamCenters(
  options: ListNataExamCentersOptions = {},
  client?: TypedSupabaseClient
): Promise<{ centers: NataExamCenter[]; count: number }> {
  const supabase = client || getSupabaseBrowserClient();

  const {
    state,
    city,
    confidence,
    tier,
    tcsIonOnly,
    barchOnly,
    newOnly,
    year,
    search,
    limit = 500,
    offset = 0,
  } = options;

  let query = supabase
    .from('nata_exam_centers')
    .select('*', { count: 'exact' });

  if (year) {
    query = query.eq('year', year);
  }

  if (state) {
    query = query.eq('state', state);
  }

  if (city) {
    query = query.eq('city_brochure', city);
  }

  if (confidence) {
    query = query.eq('confidence', confidence);
  }

  if (tier) {
    query = query.eq('city_population_tier', tier);
  }

  if (tcsIonOnly) {
    query = query.eq('tcs_ion_confirmed', true);
  }

  if (barchOnly) {
    query = query.eq('has_barch_college', true);
  }

  if (newOnly) {
    query = query.eq('is_new_2025', true);
  }

  if (search) {
    query = query.or(
      `city_brochure.ilike.%${search}%,state.ilike.%${search}%,probable_center_1.ilike.%${search}%,center_1_address.ilike.%${search}%,notes.ilike.%${search}%`
    );
  }

  query = query
    .order('state', { ascending: true })
    .order('city_brochure', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    centers: data || [],
    count: count || 0,
  };
}

// ============================================
// SINGLE RECORD QUERIES
// ============================================

export async function getNataExamCenterById(
  id: string,
  client?: TypedSupabaseClient
): Promise<NataExamCenter | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('nata_exam_centers')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

// ============================================
// DISTINCT VALUES (for dropdowns)
// ============================================

export async function getNataExamCenterStates(
  year?: number,
  client?: TypedSupabaseClient
): Promise<string[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('nata_exam_centers')
    .select('state');

  if (year) {
    query = query.eq('year', year);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as { state: string }[];
  return [...new Set(rows.map(d => d.state))].sort();
}

export async function getNataExamCenterCities(
  state?: string,
  year?: number,
  client?: TypedSupabaseClient
): Promise<string[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('nata_exam_centers')
    .select('city_brochure');

  if (year) {
    query = query.eq('year', year);
  }

  if (state) {
    query = query.eq('state', state);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as { city_brochure: string }[];
  return [...new Set(rows.map(d => d.city_brochure))].sort();
}

export async function getDistinctYears(
  client?: TypedSupabaseClient
): Promise<number[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('nata_exam_centers')
    .select('year');

  if (error) throw error;

  const rows = (data || []) as { year: number }[];
  return [...new Set(rows.map(d => d.year))].sort((a, b) => b - a);
}

// ============================================
// DISTANCE CALCULATION
// ============================================

function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function findNearestNataExamCenters(
  latitude: number,
  longitude: number,
  options: {
    year?: number;
    maxDistance?: number;
    limit?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<NataExamCenterWithDistance[]> {
  const { year, maxDistance = 500, limit = 20 } = options;
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('nata_exam_centers')
    .select('*');

  if (year) {
    query = query.eq('year', year);
  }

  const { data, error } = await query;
  if (error) throw error;

  const centersWithDistance: NataExamCenterWithDistance[] = (data || [])
    .map((center: NataExamCenter) => ({
      ...center,
      distance: calculateDistance(latitude, longitude, center.latitude, center.longitude),
    }))
    .filter((c: NataExamCenterWithDistance) => c.distance <= maxDistance)
    .sort((a: NataExamCenterWithDistance, b: NataExamCenterWithDistance) => a.distance - b.distance)
    .slice(0, limit);

  return centersWithDistance;
}

// ============================================
// STATS & SUMMARIES
// ============================================

export async function getNataStateSummary(
  year?: number,
  client?: TypedSupabaseClient
): Promise<NataStateSummary[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('nata_state_summary')
    .select('*');

  if (error) throw error;

  let results = (data || []) as NataStateSummary[];
  if (year) {
    results = results.filter(r => r.year === year);
  }
  return results;
}

export async function getNataExamCentersStats(
  year: number,
  client?: TypedSupabaseClient
): Promise<NataExamCenterStats> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('nata_exam_centers')
    .select('confidence, tcs_ion_confirmed, has_barch_college, is_new_2025, state')
    .eq('year', year);

  if (error) throw error;

  const rows = data || [];
  const states = new Set(rows.map((r: any) => r.state));

  return {
    total: rows.length,
    high_confidence: rows.filter((r: any) => r.confidence === 'HIGH').length,
    medium_confidence: rows.filter((r: any) => r.confidence === 'MEDIUM').length,
    low_confidence: rows.filter((r: any) => r.confidence === 'LOW').length,
    tcs_confirmed: rows.filter((r: any) => r.tcs_ion_confirmed).length,
    with_barch: rows.filter((r: any) => r.has_barch_college).length,
    states_count: states.size,
    new_this_year: rows.filter((r: any) => r.is_new_2025).length,
  };
}

// ============================================
// ADMIN CRUD OPERATIONS
// ============================================

export type CreateNataExamCenterInput = Omit<NataExamCenter, 'id' | 'created_at' | 'updated_at'>;
export type UpdateNataExamCenterInput = Partial<Omit<NataExamCenter, 'id' | 'created_at' | 'updated_at'>>;

export async function createNataExamCenter(
  data: CreateNataExamCenterInput,
  client?: TypedSupabaseClient
): Promise<NataExamCenter> {
  const supabase = client || getSupabaseAdminClient();

  const { data: created, error } = await supabase
    .from('nata_exam_centers')
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return created;
}

export async function updateNataExamCenter(
  id: string,
  updates: UpdateNataExamCenterInput,
  client?: TypedSupabaseClient
): Promise<NataExamCenter> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('nata_exam_centers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteNataExamCenter(
  id: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('nata_exam_centers')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// BULK OPERATIONS
// ============================================

export interface BulkUpsertResult {
  total: number;
  successful: number;
  errors: { row: number; message: string }[];
}

export async function bulkUpsertNataExamCenters(
  centers: Record<string, any>[],
  client?: TypedSupabaseClient
): Promise<BulkUpsertResult> {
  const supabase = client || getSupabaseAdminClient();

  const result: BulkUpsertResult = {
    total: centers.length,
    successful: 0,
    errors: [],
  };

  // Process in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < centers.length; i += BATCH_SIZE) {
    const chunk = centers.slice(i, i + BATCH_SIZE);

    // Clean up boolean fields from CSV (papaparse may parse "True"/"False" as strings)
    const cleanedChunk = chunk.map(row => ({
      ...row,
      is_new_2025: parseBool(row.is_new_2025),
      was_in_2024: parseBool(row.was_in_2024),
      tcs_ion_confirmed: parseBool(row.tcs_ion_confirmed),
      has_barch_college: parseBool(row.has_barch_college),
      latitude: parseFloat(row.latitude),
      longitude: parseFloat(row.longitude),
      year: parseInt(row.year, 10),
    }));

    const { data, error } = await supabase
      .from('nata_exam_centers')
      .upsert(cleanedChunk, {
        onConflict: 'city_brochure,state,year',
        ignoreDuplicates: false,
      })
      .select();

    if (error) {
      // Mark all rows in this chunk as errors
      for (let j = 0; j < chunk.length; j++) {
        result.errors.push({ row: i + j + 2, message: error.message });
      }
    } else {
      result.successful += data?.length || 0;
    }
  }

  return result;
}

function parseBool(value: any): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return !!value;
}

// ============================================
// YEAR MANAGEMENT
// ============================================

export async function cloneCentersToNewYear(
  sourceYear: number,
  targetYear: number,
  client?: TypedSupabaseClient
): Promise<number> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase.rpc('clone_centers_to_new_year', {
    source_year: sourceYear,
    target_year: targetYear,
  });

  if (error) throw error;
  return data as number;
}
