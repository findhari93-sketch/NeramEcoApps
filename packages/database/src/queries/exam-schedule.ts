// @ts-nocheck - Database type needs regeneration for Supabase v2 compat
/**
 * Neram Classes - Exam Schedule Queries
 *
 * Admin-managed exam schedules (from CoA brochure).
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { ExamSchedule, ExamScheduleInput } from '../types';

/**
 * Get active exam schedule for a given exam type and year.
 */
export async function getActiveExamSchedule(
  examType: string,
  year: number,
  client?: TypedSupabaseClient
): Promise<ExamSchedule | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('exam_schedules')
    .select('*')
    .eq('exam_type', examType)
    .eq('exam_year', year)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('Error fetching exam schedule:', error);
    return null;
  }

  return data as ExamSchedule | null;
}

/**
 * Get the most recent active schedule for an exam type (any year).
 */
export async function getLatestExamSchedule(
  examType: string,
  client?: TypedSupabaseClient
): Promise<ExamSchedule | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('exam_schedules')
    .select('*')
    .eq('exam_type', examType)
    .eq('is_active', true)
    .order('exam_year', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching latest exam schedule:', error);
    return null;
  }

  return data as ExamSchedule | null;
}

/**
 * List all exam schedules (admin).
 */
export async function listExamSchedules(
  client?: TypedSupabaseClient
): Promise<ExamSchedule[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('exam_schedules')
    .select('*')
    .order('exam_year', { ascending: false })
    .order('exam_type');

  if (error) {
    console.error('Error listing exam schedules:', error);
    return [];
  }

  return (data || []) as ExamSchedule[];
}

/**
 * Create or update an exam schedule (admin).
 */
export async function upsertExamSchedule(
  input: ExamScheduleInput,
  userId: string,
  client?: TypedSupabaseClient
): Promise<ExamSchedule> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('exam_schedules')
    .upsert(
      {
        exam_type: input.exam_type,
        exam_year: input.exam_year,
        is_active: input.is_active ?? true,
        registration_open_date: input.registration_open_date || null,
        registration_close_date: input.registration_close_date || null,
        late_registration_close_date: input.late_registration_close_date || null,
        sessions: input.sessions,
        brochure_url: input.brochure_url || null,
        notes: input.notes || null,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'exam_type,exam_year' }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert exam schedule: ${error.message}`);
  }

  return data as ExamSchedule;
}
