// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Score Calculations Queries
 *
 * Database queries for storing and retrieving cutoff calculator score runs.
 * Separate from tool_usage_logs (analytics-only) — this table is user-owned data
 * with purpose tagging and admin audit visibility.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { ScoreCalculation, CalculationPurpose } from '../types';

// ============================================
// INPUT TYPES
// ============================================

export interface SaveScoreCalculationInput {
  userId: string;
  toolName: string;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown>;
  academicYear?: string;
}

export interface UpdateCalculationPurposeInput {
  id: string;
  userId: string; // ownership guard at query level
  purpose: CalculationPurpose;
  label?: string;
}

export interface GetScoreCalculationsOptions {
  toolName?: string;
  limit?: number;
  offset?: number;
}

// ============================================
// WRITE OPERATIONS
// ============================================

/**
 * Save a new score calculation.
 * Uses admin client — auth is verified at the API layer before calling this.
 */
export async function saveScoreCalculation(
  data: SaveScoreCalculationInput,
  client?: TypedSupabaseClient
): Promise<ScoreCalculation> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data: calc, error } = await supabase
    .from('score_calculations')
    .insert({
      user_id: data.userId,
      tool_name: data.toolName,
      input_data: data.inputData,
      result_data: data.resultData,
      academic_year: data.academicYear ?? null,
      purpose: null,
      label: null,
    })
    .select()
    .single();

  if (error) throw error;
  return calc as ScoreCalculation;
}

/**
 * Update the purpose (and optional label) on an existing calculation.
 * Scoped to user_id as a secondary ownership guard (API layer also validates auth).
 */
export async function updateCalculationPurpose(
  data: UpdateCalculationPurposeInput,
  client?: TypedSupabaseClient
): Promise<ScoreCalculation> {
  const supabase = client ?? getSupabaseAdminClient();

  const { data: calc, error } = await supabase
    .from('score_calculations')
    .update({
      purpose: data.purpose,
      label: data.label ?? null,
    })
    .eq('id', data.id)
    .eq('user_id', data.userId)
    .select()
    .single();

  if (error) throw error;
  if (!calc) throw new Error('Calculation not found or unauthorized');
  return calc as ScoreCalculation;
}

// ============================================
// READ OPERATIONS (app — user-facing)
// ============================================

/**
 * Get a user's own calculation history.
 * Uses admin client — auth verified at API layer.
 */
export async function getUserScoreCalculations(
  userId: string,
  options: GetScoreCalculationsOptions = {},
  client?: TypedSupabaseClient
): Promise<{ calculations: ScoreCalculation[]; count: number }> {
  const supabase = client ?? getSupabaseAdminClient();
  const { toolName, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('score_calculations')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (toolName) {
    query = query.eq('tool_name', toolName);
  }

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    calculations: (data ?? []) as ScoreCalculation[],
    count: count ?? 0,
  };
}

// ============================================
// READ OPERATIONS (admin — service role)
// ============================================

/**
 * Get all calculations for a user — admin read via service role client.
 * Always uses admin client regardless of the optional param.
 */
export async function getScoreCalculationsForAdmin(
  userId: string,
  options: GetScoreCalculationsOptions = {}
): Promise<{ calculations: ScoreCalculation[]; count: number }> {
  // Always force admin client for admin reads
  return getUserScoreCalculations(userId, options, getSupabaseAdminClient());
}
