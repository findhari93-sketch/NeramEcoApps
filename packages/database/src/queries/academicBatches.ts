// @ts-nocheck - Supabase types not generated for academic_batches
/**
 * Neram Classes - Academic Batch (exam-year cohort) registry queries.
 *
 * ================================ IMPORTANT ================================
 * This is the EXAM-YEAR COHORT (users.academic_year, e.g. '2026-27'). It is NOT
 * `batches` (course-class schedule) and NOT `nexus_batches` (classroom section).
 * The 'YYYY-YY' string is the sole join key; there is deliberately no batch_id FK.
 * ==========================================================================
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { AcademicBatch, AcademicBatchStatus, BatchNeedsAssignmentCounts } from '../types';
import { currentAcademicYear } from './crm';

const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;
const VALID_STATUS: AcademicBatchStatus[] = ['open', 'active', 'closed'];

/** All registered batches, newest code first. */
export async function listAcademicBatches(client?: TypedSupabaseClient): Promise<AcademicBatch[]> {
  const supabase = client || getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('academic_batches')
    .select('*')
    .order('code', { ascending: false });
  if (error) throw error;
  return (data || []) as AcademicBatch[];
}

/**
 * The single current batch. Fallback chain so the UI is never currentless:
 *   1. the row flagged is_current
 *   2. else the newest open/active batch
 *   3. else a synthetic batch from the April-March helper (never persisted)
 * The registry (not the calendar helper) is the source of truth for "current".
 */
export async function getCurrentBatch(client?: TypedSupabaseClient): Promise<AcademicBatch> {
  const supabase = client || getSupabaseAdminClient();

  const { data: flagged } = await supabase
    .from('academic_batches')
    .select('*')
    .eq('is_current', true)
    .maybeSingle();
  if (flagged) return flagged as AcademicBatch;

  const { data: newestOpen } = await supabase
    .from('academic_batches')
    .select('*')
    .in('status', ['open', 'active'])
    .order('code', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (newestOpen) return newestOpen as AcademicBatch;

  // Last resort: a synthetic, non-persisted batch so callers always get a code.
  const code = currentAcademicYear();
  return {
    id: '',
    code,
    label: null,
    start_date: null,
    end_date: null,
    status: 'open',
    is_current: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: null,
    updated_by: null,
  };
}

/** Create a batch. `code` must be 'YYYY-YY'. Does not touch is_current. */
export async function createAcademicBatch(
  input: { code: string; label?: string | null; start_date?: string | null; end_date?: string | null; status?: AcademicBatchStatus },
  adminId: string | null,
  client?: TypedSupabaseClient
): Promise<AcademicBatch> {
  const supabase = client || getSupabaseAdminClient();
  const code = (input.code || '').trim();
  if (!ACADEMIC_YEAR_REGEX.test(code)) {
    throw new Error(`Invalid batch code "${code}". Expected format YYYY-YY, e.g. 2026-27.`);
  }
  if (input.status && !VALID_STATUS.includes(input.status)) {
    throw new Error(`Invalid batch status "${input.status}".`);
  }
  const { data, error } = await supabase
    .from('academic_batches')
    .insert({
      code,
      label: input.label ?? null,
      start_date: input.start_date ?? null,
      end_date: input.end_date ?? null,
      status: input.status ?? 'open',
      created_by: adminId,
      updated_by: adminId,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as AcademicBatch;
}

/**
 * Edit a batch's label / dates / status. The closing date (end_date) is editable
 * anytime and does not auto-flip is_current or auto-change status. Does not change
 * is_current (use setCurrentBatch for that).
 */
export async function updateAcademicBatch(
  code: string,
  patch: { label?: string | null; start_date?: string | null; end_date?: string | null; status?: AcademicBatchStatus },
  adminId: string | null,
  client?: TypedSupabaseClient
): Promise<AcademicBatch> {
  const supabase = client || getSupabaseAdminClient();
  if (patch.status && !VALID_STATUS.includes(patch.status)) {
    throw new Error(`Invalid batch status "${patch.status}".`);
  }
  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: adminId };
  if ('label' in patch) update.label = patch.label ?? null;
  if ('start_date' in patch) update.start_date = patch.start_date ?? null;
  if ('end_date' in patch) update.end_date = patch.end_date ?? null;
  if ('status' in patch && patch.status) update.status = patch.status;

  const { data, error } = await supabase
    .from('academic_batches')
    .update(update)
    .eq('code', code)
    .select('*')
    .single();
  if (error) throw error;
  return data as AcademicBatch;
}

/**
 * Make `code` the single current batch. Unsets every other current first so the
 * partial-unique index never sees two trues (two steps; getCurrentBatch tolerates
 * the momentary gap via its fallback chain).
 */
export async function setCurrentBatch(
  code: string,
  adminId: string | null,
  client?: TypedSupabaseClient
): Promise<AcademicBatch> {
  const supabase = client || getSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  // Step 1: clear any existing current (skip the target so we don't churn it).
  const { error: clearErr } = await supabase
    .from('academic_batches')
    .update({ is_current: false, updated_at: nowIso, updated_by: adminId })
    .eq('is_current', true)
    .neq('code', code);
  if (clearErr) throw clearErr;

  // Step 2: set the target current.
  const { data, error } = await supabase
    .from('academic_batches')
    .update({ is_current: true, updated_at: nowIso, updated_by: adminId })
    .eq('code', code)
    .select('*')
    .single();
  if (error) throw error;
  return data as AcademicBatch;
}

/**
 * Counts of users with no batch set (academic_year IS NULL), keyed by user_type.
 * Powers the "needs batch" worklist badge. Students exclude alumni (graduation
 * stamps a year, so a null-year alumnus is noise).
 */
export async function getBatchNeedsAssignmentCounts(
  client?: TypedSupabaseClient
): Promise<BatchNeedsAssignmentCounts> {
  const supabase = client || getSupabaseAdminClient();

  const { count: leadCount, error: leadErr } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('user_type', 'lead')
    .is('academic_year', null);
  if (leadErr) throw leadErr;

  const { count: studentCount, error: studentErr } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .eq('user_type', 'student')
    .eq('is_alumni', false)
    .is('academic_year', null);
  if (studentErr) throw studentErr;

  return { lead: leadCount || 0, student: studentCount || 0 };
}
