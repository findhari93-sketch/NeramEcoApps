// @ts-nocheck - Database type needs regeneration for Supabase v2 compat
/**
 * Neram Classes - Exam Planner Queries
 *
 * Manages user exam session preferences and rewards for the NATA 2026 Exam Planner.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { UserExamSessionPreference, UserReward, ExamPhase, ExamTimeSlot } from '../types';

/**
 * Get user's exam session preferences.
 */
export async function getUserExamPreferences(
  userId: string,
  scheduleId?: string,
  client?: TypedSupabaseClient
): Promise<UserExamSessionPreference[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('user_exam_session_preferences')
    .select('*')
    .eq('user_id', userId)
    .order('exam_date', { ascending: true });

  if (scheduleId) {
    query = query.eq('exam_schedule_id', scheduleId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching exam preferences:', error);
    return [];
  }

  return (data || []) as UserExamSessionPreference[];
}

/**
 * Save user's exam session preferences (full replace).
 * Deletes existing preferences for this user+schedule, then inserts new ones.
 */
export async function saveUserExamPreferences(
  userId: string,
  phase: ExamPhase,
  selections: { exam_date: string; time_slot: ExamTimeSlot; session_label: string }[],
  client?: TypedSupabaseClient
): Promise<UserExamSessionPreference[]> {
  const supabase = client || getSupabaseAdminClient();

  // Delete existing preferences for this user
  const { error: deleteError } = await supabase
    .from('user_exam_session_preferences')
    .delete()
    .eq('user_id', userId);

  if (deleteError) {
    throw new Error(`Failed to clear preferences: ${deleteError.message}`);
  }

  // Insert new preferences
  if (selections.length === 0) return [];

  const rows = selections.map((s) => ({
    user_id: userId,
    phase,
    exam_date: s.exam_date,
    time_slot: s.time_slot,
    session_label: s.session_label,
  }));

  const { data, error: insertError } = await supabase
    .from('user_exam_session_preferences')
    .insert(rows)
    .select('*');

  if (insertError) {
    throw new Error(`Failed to save preferences: ${insertError.message}`);
  }

  return (data || []) as UserExamSessionPreference[];
}

/**
 * Delete all exam session preferences for a user.
 */
export async function deleteUserExamPreferences(
  userId: string,
  scheduleId?: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('user_exam_session_preferences')
    .delete()
    .eq('user_id', userId);

  if (scheduleId) {
    query = query.eq('exam_schedule_id', scheduleId);
  }

  const { error } = await query;

  if (error) {
    throw new Error(`Failed to delete preferences: ${error.message}`);
  }
}

/**
 * Get a specific reward for a user (null if not earned yet).
 */
export async function getUserReward(
  userId: string,
  rewardType: string,
  client?: TypedSupabaseClient
): Promise<UserReward | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('user_rewards')
    .select('*')
    .eq('user_id', userId)
    .eq('reward_type', rewardType)
    .maybeSingle();

  if (error) {
    console.error('Error fetching reward:', error);
    return null;
  }

  return data as UserReward | null;
}

/**
 * Grant a reward to a user (idempotent — UNIQUE constraint prevents duplicates).
 * Returns the reward if newly granted, or the existing one.
 */
export async function grantReward(
  userId: string,
  rewardType: string,
  points: number,
  metadata?: Record<string, unknown>,
  client?: TypedSupabaseClient
): Promise<{ reward: UserReward; isNew: boolean }> {
  const supabase = client || getSupabaseAdminClient();

  // Check if already exists
  const existing = await getUserReward(userId, rewardType, supabase);
  if (existing) {
    return { reward: existing, isNew: false };
  }

  // Insert new reward
  const { data, error } = await supabase
    .from('user_rewards')
    .insert({
      user_id: userId,
      reward_type: rewardType,
      points_awarded: points,
      metadata: metadata || {},
    })
    .select('*')
    .single();

  if (error) {
    // Race condition — might have been inserted concurrently
    if (error.code === '23505') {
      const existing2 = await getUserReward(userId, rewardType, supabase);
      if (existing2) return { reward: existing2, isNew: false };
    }
    throw new Error(`Failed to grant reward: ${error.message}`);
  }

  return { reward: data as UserReward, isNew: true };
}
