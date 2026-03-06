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
  SaveExamDetailsInput,
  ExamDetailAuditLog,
  NataExamStatus,
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

/**
 * Get user's full exam details (profile + attempts).
 * Used by dashboard card to determine which state to show.
 */
export async function getUserExamDetails(
  userId: string,
  client?: TypedSupabaseClient
): Promise<{ profile: UserExamProfile | null; attempts: UserExamAttempt[] }> {
  const [profile, attempts] = await Promise.all([
    getUserExamProfile(userId, client),
    getUserExamAttempts(userId, client),
  ]);
  return { profile, attempts };
}

/**
 * Save exam details (intent + sessions + city) with audit trail.
 * Handles both first-time creation and edits.
 */
export async function saveExamDetails(
  userId: string,
  input: SaveExamDetailsInput,
  client?: TypedSupabaseClient
): Promise<UserExamProfile> {
  const supabase = client || getSupabaseAdminClient();

  // 1. Get current state for audit diff
  const oldProfile = await getUserExamProfile(userId, supabase);
  const oldAttempts = await getUserExamAttempts(userId, supabase);
  const isUpdate = !!oldProfile?.exam_details_completed;

  // 2. Compute next exam date from sessions
  let nextExamDate: string | null = null;
  if (input.sessions && input.sessions.length > 0) {
    const now = new Date();
    const futureSessions = input.sessions
      .filter((s) => new Date(s.exam_date) > now)
      .sort((a, b) => new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime());
    if (futureSessions.length > 0) {
      nextExamDate = futureSessions[0].exam_date;
    }
  }

  // 3. Upsert profile
  const { data: profile, error: profileError } = await (supabase as any)
    .from('user_exam_profiles')
    .upsert(
      {
        user_id: userId,
        nata_status: input.nata_status,
        attempt_count: input.sessions?.length || 0,
        next_exam_date: nextExamDate,
        planning_year: input.planning_year || new Date().getFullYear(),
        exam_details_completed: true,
        exam_details_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (profileError) {
    throw new Error(`Failed to save exam profile: ${profileError.message}`);
  }

  // 4. Handle attempts — delete old, insert new (for the current year)
  if (input.sessions && input.sessions.length > 0) {
    const currentYear = new Date().getFullYear();

    // Delete existing attempts for current year
    await (supabase as any)
      .from('user_exam_attempts')
      .delete()
      .eq('user_id', userId)
      .eq('exam_year', currentYear);

    // Insert new attempts
    const attempts = input.sessions.map((s) => ({
      user_id: userId,
      exam_year: currentYear,
      exam_date: s.exam_date,
      session_label: s.session_label,
      exam_city: s.exam_city || null,
      exam_state: s.exam_state || null,
      exam_center_id: s.exam_center_id || null,
      user_reported_city: s.user_reported_city || null,
      status: 'registered',
    }));

    await (supabase as any).from('user_exam_attempts').insert(attempts);

    // 5. Handle reported cities
    const reportedCities = input.sessions.filter((s) => s.user_reported_city);
    if (reportedCities.length > 0) {
      const reports = reportedCities.map((s) => ({
        user_id: userId,
        exam_year: currentYear,
        session_label: s.session_label,
        reported_city: s.user_reported_city!,
        reported_state: s.exam_state || null,
      }));

      await (supabase as any).from('user_reported_exam_centers').insert(reports);
    }
  }

  // 6. Write audit log
  const changes: Record<string, { old?: unknown; new?: unknown }> = {};

  if (!isUpdate) {
    changes.nata_status = { new: input.nata_status };
    if (input.sessions) {
      changes.sessions = { new: input.sessions.map((s) => s.session_label) };
    }
    if (input.sessions?.[0]?.exam_city) {
      changes.exam_city = { new: input.sessions[0].exam_city };
    }
  } else {
    // Compute diff
    if (oldProfile?.nata_status !== input.nata_status) {
      changes.nata_status = { old: oldProfile?.nata_status, new: input.nata_status };
    }
    const oldSessionLabels = oldAttempts.map((a) => a.session_label).sort();
    const newSessionLabels = (input.sessions || []).map((s) => s.session_label).sort();
    if (JSON.stringify(oldSessionLabels) !== JSON.stringify(newSessionLabels)) {
      changes.sessions = { old: oldSessionLabels, new: newSessionLabels };
    }
    const oldCity = oldAttempts[0]?.exam_city;
    const newCity = input.sessions?.[0]?.exam_city;
    if (oldCity !== newCity && (oldCity || newCity)) {
      changes.city = { old: oldCity, new: newCity };
    }
    const oldState = oldAttempts[0]?.exam_state;
    const newState = input.sessions?.[0]?.exam_state;
    if (oldState !== newState && (oldState || newState)) {
      changes.state = { old: oldState, new: newState };
    }
  }

  const newAttempts = await getUserExamAttempts(userId, supabase);

  await (supabase as any).from('exam_detail_audit_logs').insert({
    user_id: userId,
    action: isUpdate ? 'updated' : 'created',
    changes,
    snapshot: {
      profile: profile,
      attempts: newAttempts,
    },
  });

  return profile as UserExamProfile;
}

/**
 * Update a single attempt's status (e.g., after exam date passes).
 */
export async function updateAttemptStatus(
  attemptId: string,
  userId: string,
  status: 'registered' | 'completed' | 'skipped',
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await (supabase as any)
    .from('user_exam_attempts')
    .update({ status })
    .eq('id', attemptId)
    .eq('user_id', userId);

  if (error) {
    throw new Error(`Failed to update attempt status: ${error.message}`);
  }

  // Update next_exam_date on profile
  const attempts = await getUserExamAttempts(userId, supabase);
  const now = new Date();
  const nextAttempt = attempts
    .filter((a) => a.status === 'registered' && a.exam_date && new Date(a.exam_date) > now)
    .sort((a, b) => new Date(a.exam_date!).getTime() - new Date(b.exam_date!).getTime())[0];

  await (supabase as any)
    .from('user_exam_profiles')
    .update({
      next_exam_date: nextAttempt?.exam_date || null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

/**
 * Get audit logs for a user (admin panel).
 */
export async function getUserExamAuditLogs(
  userId: string,
  client?: TypedSupabaseClient
): Promise<ExamDetailAuditLog[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('exam_detail_audit_logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching exam audit logs:', error);
    return [];
  }

  return (data || []) as ExamDetailAuditLog[];
}
