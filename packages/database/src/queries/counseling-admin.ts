// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Counseling Admin Queries
 *
 * Admin-only queries for importing, managing, and auditing
 * counseling data (rank lists, allotment lists, cutoffs, colleges).
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import { getRankListYearSummary, getAllotmentYearSummary } from './counseling';
import type {
  RankListEntry,
  AllotmentListEntry,
  HistoricalCutoff,
  CollegeCounselingParticipation,
  CounselingAuditLog,
  CounselingSystem,
} from '../types';

// ============================================
// BULK IMPORT OPERATIONS
// ============================================

/**
 * Bulk import rank list entries from CSV data.
 * Deletes existing entries for the same system+year before inserting.
 */
export async function importRankListEntries(
  systemId: string,
  year: number,
  entries: Omit<RankListEntry, 'id' | 'created_at' | 'counseling_system_id' | 'year'>[],
  createdBy: string,
  client?: TypedSupabaseClient
): Promise<{ inserted: number; deleted: number }> {
  const supabase = client || getSupabaseAdminClient();

  // Count existing entries before deletion (for audit and user info)
  const { count: existingCount } = await supabase
    .from('rank_list_entries')
    .select('*', { count: 'exact', head: true })
    .eq('counseling_system_id', systemId)
    .eq('year', year);

  // Delete existing entries for this system+year
  const { error: deleteError } = await supabase
    .from('rank_list_entries')
    .delete()
    .eq('counseling_system_id', systemId)
    .eq('year', year);

  if (deleteError) throw deleteError;

  // Prepare rows with system ID, year, and created_by
  const rows = entries.map((entry) => ({
    ...entry,
    counseling_system_id: systemId,
    year,
    created_by: createdBy,
  }));

  // Insert in batches of 500 to avoid payload limits
  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('rank_list_entries')
      .insert(batch as any);

    if (error) {
      throw new Error(
        `Insert failed at batch ${Math.floor(i / batchSize) + 1} ` +
        `(rows ${i + 1}-${Math.min(i + batchSize, rows.length)}): ${error.message}. ` +
        `${inserted} rows were inserted before failure. ` +
        `${existingCount || 0} previously existing rows were deleted.`
      );
    }
    inserted += batch.length;
  }

  // Log audit
  await logAuditChange({
    table_name: 'rank_list_entries',
    record_id: systemId,
    change_type: 'CREATE',
    changed_by: createdBy,
    context: {
      action: 'bulk_import',
      year,
      count: inserted,
      previousCount: existingCount || 0,
    },
  }, supabase);

  return { inserted, deleted: existingCount || 0 };
}

/**
 * Bulk import allotment list entries from CSV data.
 * Deletes existing entries for the same system+year before inserting.
 */
export async function importAllotmentListEntries(
  systemId: string,
  year: number,
  entries: Omit<AllotmentListEntry, 'id' | 'created_at' | 'counseling_system_id' | 'year'>[],
  createdBy: string,
  client?: TypedSupabaseClient
): Promise<{ inserted: number; deleted: number }> {
  const supabase = client || getSupabaseAdminClient();

  // Count existing entries before deletion
  const { count: existingCount } = await supabase
    .from('allotment_list_entries')
    .select('*', { count: 'exact', head: true })
    .eq('counseling_system_id', systemId)
    .eq('year', year);

  // Delete existing entries for this system+year
  const { error: deleteError } = await supabase
    .from('allotment_list_entries')
    .delete()
    .eq('counseling_system_id', systemId)
    .eq('year', year);

  if (deleteError) throw deleteError;

  const rows = entries.map((entry) => ({
    ...entry,
    counseling_system_id: systemId,
    year,
    created_by: createdBy,
  }));

  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('allotment_list_entries')
      .insert(batch as any);

    if (error) {
      throw new Error(
        `Insert failed at batch ${Math.floor(i / batchSize) + 1} ` +
        `(rows ${i + 1}-${Math.min(i + batchSize, rows.length)}): ${error.message}. ` +
        `${inserted} rows were inserted before failure. ` +
        `${existingCount || 0} previously existing rows were deleted.`
      );
    }
    inserted += batch.length;
  }

  await logAuditChange({
    table_name: 'allotment_list_entries',
    record_id: systemId,
    change_type: 'CREATE',
    changed_by: createdBy,
    context: { action: 'bulk_import', year, count: inserted, previousCount: existingCount || 0 },
  }, supabase);

  return { inserted, deleted: existingCount || 0 };
}

/**
 * Bulk import historical cutoffs from CSV data.
 * Uses upsert to handle updates to existing entries.
 */
export async function importHistoricalCutoffs(
  systemId: string,
  year: number,
  cutoffs: Omit<HistoricalCutoff, 'id' | 'created_at' | 'updated_at' | 'counseling_system_id' | 'year'>[],
  createdBy: string,
  client?: TypedSupabaseClient
): Promise<{ upserted: number }> {
  const supabase = client || getSupabaseAdminClient();

  const rows = cutoffs.map((cutoff) => ({
    ...cutoff,
    counseling_system_id: systemId,
    year,
    created_by: createdBy,
    updated_by: createdBy,
  }));

  const batchSize = 500;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase
      .from('historical_cutoffs')
      .upsert(batch as any, {
        onConflict: 'counseling_system_id,college_id,year,round,branch_code,category',
      });

    if (error) throw error;
    upserted += batch.length;
  }

  await logAuditChange({
    table_name: 'historical_cutoffs',
    record_id: systemId,
    change_type: 'CREATE',
    changed_by: createdBy,
    context: { action: 'bulk_import', year, count: upserted },
  }, supabase);

  return { upserted };
}

// ============================================
// COUNSELING SYSTEM MANAGEMENT
// ============================================

/**
 * Create or update a counseling system
 */
export async function upsertCounselingSystem(
  data: Omit<CounselingSystem, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<CounselingSystem> {
  const supabase = client || getSupabaseAdminClient();

  const { data: result, error } = await (supabase as any)
    .from('counseling_systems')
    .upsert(data, { onConflict: 'code' })
    .select()
    .single();

  if (error) throw error;
  return result as CounselingSystem;
}

// ============================================
// COLLEGE PARTICIPATION MANAGEMENT
// ============================================

/**
 * Upsert college counseling participation
 */
export async function upsertCollegeCounselingParticipation(
  data: Omit<CollegeCounselingParticipation, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<CollegeCounselingParticipation> {
  const supabase = client || getSupabaseAdminClient();

  const { data: result, error } = await (supabase as any)
    .from('college_counseling_participation')
    .upsert(data, { onConflict: 'college_id,counseling_system_id,year' })
    .select()
    .single();

  if (error) throw error;
  return result as CollegeCounselingParticipation;
}

// ============================================
// INDIVIDUAL CRUD OPERATIONS
// ============================================

/**
 * Create a single historical cutoff entry
 */
export async function createHistoricalCutoff(
  data: Omit<HistoricalCutoff, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<HistoricalCutoff> {
  const supabase = client || getSupabaseAdminClient();

  const { data: result, error } = await (supabase as any)
    .from('historical_cutoffs')
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return result as HistoricalCutoff;
}

/**
 * Update a single historical cutoff entry
 */
export async function updateHistoricalCutoff(
  id: string,
  updates: Partial<Omit<HistoricalCutoff, 'id' | 'created_at' | 'updated_at'>>,
  changedBy: string,
  client?: TypedSupabaseClient
): Promise<HistoricalCutoff> {
  const supabase = client || getSupabaseAdminClient();

  const { data: result, error } = await (supabase as any)
    .from('historical_cutoffs')
    .update({ ...updates, updated_by: changedBy })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return result as HistoricalCutoff;
}

// ============================================
// AUDIT LOG
// ============================================

/**
 * Log an audit change
 */
export async function logAuditChange(
  data: Omit<CounselingAuditLog, 'id' | 'changed_at'>,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('counseling_audit_log')
    .insert(data as any);

  if (error) {
    console.error('Failed to log audit change:', error);
    // Don't throw — audit logging failure shouldn't break the operation
  }
}

/**
 * Get audit log entries with filtering
 */
export async function getAuditLog(
  options: {
    tableName?: string;
    recordId?: string;
    changedBy?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<{ entries: CounselingAuditLog[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('counseling_audit_log')
    .select('*', { count: 'exact' });

  if (options.tableName) {
    query = query.eq('table_name', options.tableName);
  }
  if (options.recordId) {
    query = query.eq('record_id', options.recordId);
  }
  if (options.changedBy) {
    query = query.eq('changed_by', options.changedBy);
  }
  if (options.startDate) {
    query = query.gte('changed_at', options.startDate);
  }
  if (options.endDate) {
    query = query.lte('changed_at', options.endDate);
  }

  query = query.order('changed_at', { ascending: false });

  const limit = options.limit || 50;
  const offset = options.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  return { entries: (data || []) as CounselingAuditLog[], count: count || 0 };
}

// ============================================
// STATISTICS
// ============================================

/**
 * Get counseling data statistics for admin dashboard.
 * Uses server-side RPCs for rank list counts (proven reliable)
 * and count queries with error logging for other tables.
 */
export async function getCounselingStats(
  systemId?: string,
  client?: TypedSupabaseClient
): Promise<{
  totalColleges: number;
  totalCutoffRecords: number;
  totalRankListEntries: number;
  totalAllotmentEntries: number;
  availableYears: number[];
}> {
  const supabase = client || getSupabaseAdminClient();

  // Use RPCs for rank list and allotment counts (bypasses PostgREST row limits and proxy issues)
  let totalRankListEntries = 0;
  let totalAllotmentEntries = 0;
  if (systemId) {
    try {
      const [rankSummary, allotmentSummary] = await Promise.all([
        getRankListYearSummary(systemId, supabase),
        getAllotmentYearSummary(systemId, supabase),
      ]);
      totalRankListEntries = rankSummary.reduce((sum, y) => sum + y.totalEntries, 0);
      totalAllotmentEntries = allotmentSummary.reduce((sum, y) => sum + y.totalEntries, 0);
    } catch (err) {
      console.error('[getCounselingStats] RPC year summary error:', err);
    }
  }

  // Count queries for other tables
  const countQuery = async (table: string): Promise<number> => {
    let query = supabase.from(table).select('*', { count: 'exact', head: true });
    if (systemId) query = query.eq('counseling_system_id', systemId);
    const { count, error } = await query;
    if (error) {
      console.error(`[getCounselingStats] ${table} count error:`, error.message);
      return 0;
    }
    return count || 0;
  };

  const [totalColleges, totalCutoffRecords] = await Promise.all([
    countQuery('college_counseling_participation'),
    countQuery('historical_cutoffs'),
  ]);

  // Get available years from cutoffs
  let yearsQuery = supabase
    .from('historical_cutoffs')
    .select('year')
    .limit(1000);
  if (systemId) yearsQuery = yearsQuery.eq('counseling_system_id', systemId);
  const { data: yearsData } = await yearsQuery;
  const availableYears = [...new Set((yearsData || []).map((d: any) => d.year))].sort((a, b) => b - a);

  return {
    totalColleges,
    totalCutoffRecords,
    totalRankListEntries,
    totalAllotmentEntries,
    availableYears,
  };
}
