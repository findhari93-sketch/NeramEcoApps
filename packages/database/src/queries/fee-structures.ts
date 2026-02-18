// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Fee Structure Queries
 *
 * Database queries for admin-managed fee/pricing data
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  FeeStructure,
  CourseType,
  ProgramType,
  CreateFeeStructureInput,
} from '../types';

// ============================================
// PUBLIC QUERIES
// ============================================

/**
 * Get active fee structures for public display
 */
export async function getActiveFeeStructures(
  options: {
    courseType?: CourseType;
    programType?: ProgramType;
    excludeHidden?: boolean;
  } = {},
  client?: TypedSupabaseClient
): Promise<FeeStructure[]> {
  const supabase = client || getSupabaseBrowserClient();

  let query = supabase
    .from('fee_structures')
    .select('*')
    .eq('is_active', true);

  if (options.courseType) {
    query = query.eq('course_type', options.courseType);
  }

  if (options.programType) {
    query = query.eq('program_type', options.programType);
  }

  if (options.excludeHidden) {
    query = query.eq('is_hidden_from_public', false);
  }

  query = query.order('display_order', { ascending: true });

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

/**
 * Get public fee structures (excludes hidden items like crash course)
 * For use on the /fees marketing page
 */
export async function getPublicFeeStructures(
  options: {
    courseType?: CourseType;
  } = {},
  client?: TypedSupabaseClient
): Promise<FeeStructure[]> {
  return getActiveFeeStructures(
    { ...options, excludeHidden: true },
    client
  );
}

/**
 * Get fee structure by ID
 */
export async function getFeeStructureById(
  feeId: string,
  client?: TypedSupabaseClient
): Promise<FeeStructure | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('fee_structures')
    .select('*')
    .eq('id', feeId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

// ============================================
// ADMIN QUERIES
// ============================================

/**
 * List all fee structures (admin - includes inactive)
 */
export async function listFeeStructures(
  options: { isActive?: boolean } = {},
  client?: TypedSupabaseClient
): Promise<FeeStructure[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('fee_structures')
    .select('*');

  if (options.isActive !== undefined) {
    query = query.eq('is_active', options.isActive);
  }

  query = query.order('display_order', { ascending: true });

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

/**
 * Create fee structure (admin)
 */
export async function createFeeStructure(
  input: CreateFeeStructureInput,
  client?: TypedSupabaseClient
): Promise<FeeStructure> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('fee_structures')
    .insert({
      course_type: input.course_type,
      program_type: input.program_type,
      display_name: input.display_name,
      display_name_ta: input.display_name_ta || null,
      fee_amount: input.fee_amount,
      combo_extra_fee: input.combo_extra_fee || 0,
      duration: input.duration,
      schedule_summary: input.schedule_summary || null,
      features: input.features || [],
      display_order: input.display_order || 0,
      is_active: true,
      single_payment_discount: input.single_payment_discount || 0,
      installment_1_amount: input.installment_1_amount || null,
      installment_2_amount: input.installment_2_amount || null,
      is_hidden_from_public: input.is_hidden_from_public || false,
    })
    .select()
    .single();

  if (error) throw error;
  return data as FeeStructure;
}

/**
 * Update fee structure (admin)
 */
export async function updateFeeStructure(
  feeId: string,
  updates: Partial<Omit<FeeStructure, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<FeeStructure> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('fee_structures')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', feeId)
    .select()
    .single();

  if (error) throw error;
  return data as FeeStructure;
}

/**
 * Delete fee structure (admin)
 */
export async function deleteFeeStructure(
  feeId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('fee_structures')
    .delete()
    .eq('id', feeId);

  if (error) throw error;
}
