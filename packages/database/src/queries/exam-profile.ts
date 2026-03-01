// @ts-nocheck - Database type needs regeneration for Supabase v2 compat
/**
 * Neram Classes - Exam Profile Queries
 *
 * Manages user exam profiles for Question Bank onboarding gate.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  UserExamProfile,
  UserExamAttempt,
  CreateExamProfileInput,
} from '../types';

/**
 * Get user's exam profile (null if not onboarded).
 */
export async function getUserExamProfile(
  userId: string,
  client?: TypedSupabaseClient
): Promise<UserExamProfile | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('user_exam_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching exam profile:', error);
    return null;
  }

  return data as UserExamProfile | null;
}

/**
 * Check if user has completed QB onboarding (fast check).
 */
export async function hasCompletedQBOnboarding(
  userId: string,
  client?: TypedSupabaseClient
): Promise<boolean> {
  const supabase = client || getSupabaseAdminClient();

  const { data } = await supabase
    .from('user_exam_profiles')
    .select('qb_onboarding_completed')
    .eq('user_id', userId)
    .maybeSingle();

  return !!(data as Record<string, unknown>)?.qb_onboarding_completed;
}

/**
 * Create or update exam profile with optional attempts.
 */
export async function createExamProfile(
  userId: string,
  input: CreateExamProfileInput,
  client?: TypedSupabaseClient
): Promise<UserExamProfile> {
  const supabase = client || getSupabaseAdminClient();

  // Upsert exam profile
  const { data, error } = await (supabase as any)
    .from('user_exam_profiles')
    .upsert({
      user_id: userId,
      nata_status: input.nata_status,
      attempt_count: input.attempt_count || 0,
      next_exam_date: input.next_exam_date || null,
      planning_year: input.planning_year || null,
      qb_onboarding_completed: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create exam profile: ${error.message}`);
  }

  // Insert attempts if provided
  if (input.attempts && input.attempts.length > 0) {
    const attempts = input.attempts.map((a) => ({
      user_id: userId,
      exam_year: a.exam_year,
      exam_date: a.exam_date || null,
      session_label: a.session_label || null,
    }));

    await (supabase as any)
      .from('user_exam_attempts')
      .insert(attempts);
  }

  return data as UserExamProfile;
}

/**
 * Get user's exam attempts.
 */
export async function getUserExamAttempts(
  userId: string,
  client?: TypedSupabaseClient
): Promise<UserExamAttempt[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('user_exam_attempts')
    .select('*')
    .eq('user_id', userId)
    .order('exam_year', { ascending: false });

  if (error) {
    console.error('Error fetching exam attempts:', error);
    return [];
  }

  return (data || []) as UserExamAttempt[];
}
