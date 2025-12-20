// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Tools Queries
 *
 * Database queries for exam centers and tool usage logging
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { ExamCenter, ToolUsageLog, ExamType } from '../types';

// ============================================
// EXAM CENTER QUERIES
// ============================================

/**
 * Get exam center by ID
 */
export async function getExamCenterById(
  centerId: string,
  client?: TypedSupabaseClient
): Promise<ExamCenter | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('exam_centers')
    .select('*')
    .eq('id', centerId)
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

export interface ListExamCentersOptions {
  state?: string;
  city?: string;
  examType?: ExamType;
  isActive?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * List exam centers with filters
 */
export async function listExamCenters(
  options: ListExamCentersOptions = {},
  client?: TypedSupabaseClient
): Promise<{ centers: ExamCenter[]; count: number }> {
  const supabase = client || getSupabaseBrowserClient();

  const {
    state,
    city,
    examType,
    isActive = true,
    search,
    limit = 100,
    offset = 0,
  } = options;

  let query = supabase
    .from('exam_centers')
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

  if (examType) {
    query = query.contains('exam_types', [examType]);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,city.ilike.%${search}%,address.ilike.%${search}%`);
  }

  query = query
    .order('state', { ascending: true })
    .order('city', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    centers: data || [],
    count: count || 0,
  };
}

/**
 * Filter exam centers by state
 */
export async function filterExamCentersByState(
  state: string,
  client?: TypedSupabaseClient
): Promise<ExamCenter[]> {
  const { centers } = await listExamCenters({ state }, client);
  return centers;
}

/**
 * Filter exam centers by city
 */
export async function filterExamCentersByCity(
  city: string,
  client?: TypedSupabaseClient
): Promise<ExamCenter[]> {
  const { centers } = await listExamCenters({ city }, client);
  return centers;
}

/**
 * Filter exam centers by exam type
 */
export async function filterExamCentersByExamType(
  examType: ExamType,
  client?: TypedSupabaseClient
): Promise<ExamCenter[]> {
  const { centers } = await listExamCenters({ examType }, client);
  return centers;
}

/**
 * Search exam centers
 */
export async function searchExamCenters(
  searchQuery: string,
  options: Omit<ListExamCentersOptions, 'search'> = {},
  client?: TypedSupabaseClient
): Promise<ExamCenter[]> {
  const { centers } = await listExamCenters({ ...options, search: searchQuery }, client);
  return centers;
}

// ============================================
// DISTINCT VALUES (for dropdowns)
// ============================================

/**
 * Get distinct states with exam centers
 */
export async function getExamCenterStates(
  client?: TypedSupabaseClient
): Promise<string[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('exam_centers')
    .select('state')
    .eq('is_active', true);

  if (error) throw error;

  const rows = (data || []) as { state: string }[];
  const states = [...new Set(rows.map(d => d.state))].sort();
  return states;
}

/**
 * Get distinct cities with exam centers (optionally filtered by state)
 */
export async function getExamCenterCities(
  state?: string,
  client?: TypedSupabaseClient
): Promise<string[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('exam_centers')
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
// DISTANCE CALCULATION
// ============================================

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
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

export interface ExamCenterWithDistance extends ExamCenter {
  distance: number;
}

/**
 * Find nearest exam centers
 */
export async function findNearestExamCenters(
  latitude: number,
  longitude: number,
  options: {
    examType?: ExamType;
    maxDistance?: number;
    limit?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<ExamCenterWithDistance[]> {
  const { examType, maxDistance = 500, limit = 10 } = options;

  const { centers } = await listExamCenters({ examType }, client);

  // Calculate distance for each center
  const centersWithDistance: ExamCenterWithDistance[] = centers
    .filter(c => c.latitude !== null && c.longitude !== null)
    .map(center => ({
      ...center,
      distance: calculateDistance(
        latitude,
        longitude,
        center.latitude!,
        center.longitude!
      ),
    }))
    .filter(c => c.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);

  return centersWithDistance;
}

// ============================================
// TOOL USAGE LOGGING
// ============================================

export interface LogToolUsageInput {
  userId?: string;
  sessionId?: string;
  toolName: 'cutoff_calculator' | 'college_predictor' | 'exam_center_locator';
  inputData: Record<string, unknown>;
  resultData?: Record<string, unknown>;
  executionTimeMs?: number;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
}

/**
 * Log tool usage
 */
export async function logToolUsage(
  data: LogToolUsageInput,
  client?: TypedSupabaseClient
): Promise<ToolUsageLog> {
  const supabase = client || getSupabaseAdminClient();

  const { data: log, error } = await supabase
    .from('tool_usage_logs')
    .insert({
      user_id: data.userId || null,
      session_id: data.sessionId || null,
      tool_name: data.toolName,
      input_data: data.inputData,
      result_data: data.resultData || null,
      execution_time_ms: data.executionTimeMs || null,
      ip_address: data.ipAddress || null,
      user_agent: data.userAgent || null,
      referrer: data.referrer || null,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return log as ToolUsageLog;
}

// ============================================
// TOOL USAGE STATISTICS (Admin)
// ============================================

export interface ToolUsageStats {
  totalUsage: number;
  uniqueUsers: number;
  uniqueSessions: number;
  avgExecutionTime: number;
}

/**
 * Get tool usage statistics
 */
export async function getToolUsageStats(
  toolName: string,
  options: { startDate?: string; endDate?: string } = {},
  client?: TypedSupabaseClient
): Promise<ToolUsageStats> {
  const supabase = client || getSupabaseAdminClient();

  const { startDate, endDate } = options;

  let query = supabase
    .from('tool_usage_logs')
    .select('user_id, session_id, execution_time_ms')
    .eq('tool_name', toolName);

  if (startDate) {
    query = query.gte('created_at', startDate);
  }

  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  const { data, error } = await query;

  if (error) throw error;

  const logs = (data || []) as { user_id: string | null; session_id: string | null; execution_time_ms: number | null }[];

  const userIds = new Set(logs.map(l => l.user_id).filter(Boolean));
  const sessionIds = new Set(logs.map(l => l.session_id).filter(Boolean));
  const executionTimes = logs
    .map(l => l.execution_time_ms)
    .filter((t): t is number => t !== null);

  return {
    totalUsage: logs.length,
    uniqueUsers: userIds.size,
    uniqueSessions: sessionIds.size,
    avgExecutionTime: executionTimes.length > 0
      ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
      : 0,
  };
}

/**
 * Get all tools usage summary
 */
export async function getAllToolsUsageSummary(
  options: { startDate?: string; endDate?: string } = {},
  client?: TypedSupabaseClient
): Promise<Record<string, ToolUsageStats>> {
  const tools = ['cutoff_calculator', 'college_predictor', 'exam_center_locator'];

  const results: Record<string, ToolUsageStats> = {};

  for (const tool of tools) {
    results[tool] = await getToolUsageStats(tool, options, client);
  }

  return results;
}

// ============================================
// WRITE OPERATIONS (Admin only)
// ============================================

/**
 * Create a new exam center
 */
export async function createExamCenter(
  centerData: Omit<ExamCenter, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<ExamCenter> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('exam_centers')
    .insert(centerData)
    .select()
    .single();

  if (error) throw error;
  return data as ExamCenter;
}

/**
 * Update exam center
 */
export async function updateExamCenter(
  centerId: string,
  updates: Partial<Omit<ExamCenter, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<ExamCenter> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('exam_centers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', centerId)
    .select()
    .single();

  if (error) throw error;
  return data as ExamCenter;
}
