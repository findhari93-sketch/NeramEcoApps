// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Onboarding Queries
 *
 * Database queries for onboarding questions, responses, and sessions
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  OnboardingQuestion,
  OnboardingResponse,
  OnboardingResponseValue,
  OnboardingSession,
  OnboardingSessionStatus,
  SaveOnboardingResponsesInput,
} from '../types';

// ============================================
// ONBOARDING QUESTION QUERIES
// ============================================

/**
 * Get active onboarding questions ordered by display_order
 */
export async function getActiveOnboardingQuestions(
  client?: TypedSupabaseClient
): Promise<OnboardingQuestion[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('onboarding_questions')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get all onboarding questions (admin - includes inactive)
 */
export async function listOnboardingQuestions(
  options: { isActive?: boolean } = {},
  client?: TypedSupabaseClient
): Promise<OnboardingQuestion[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('onboarding_questions')
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
 * Get onboarding question by ID
 */
export async function getOnboardingQuestionById(
  questionId: string,
  client?: TypedSupabaseClient
): Promise<OnboardingQuestion | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('onboarding_questions')
    .select('*')
    .eq('id', questionId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Create onboarding question (admin)
 */
export async function createOnboardingQuestion(
  questionData: Omit<OnboardingQuestion, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<OnboardingQuestion> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('onboarding_questions')
    .insert(questionData)
    .select()
    .single();

  if (error) throw error;
  return data as OnboardingQuestion;
}

/**
 * Update onboarding question (admin)
 */
export async function updateOnboardingQuestion(
  questionId: string,
  updates: Partial<Omit<OnboardingQuestion, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<OnboardingQuestion> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('onboarding_questions')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', questionId)
    .select()
    .single();

  if (error) throw error;
  return data as OnboardingQuestion;
}

/**
 * Delete onboarding question (admin)
 */
export async function deleteOnboardingQuestion(
  questionId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await supabase
    .from('onboarding_questions')
    .delete()
    .eq('id', questionId);

  if (error) throw error;
}

/**
 * Reorder onboarding questions (admin)
 * Accepts an array of { id, display_order } pairs
 */
export async function reorderOnboardingQuestions(
  orders: { id: string; display_order: number }[],
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  for (const order of orders) {
    const { error } = await (supabase as any)
      .from('onboarding_questions')
      .update({ display_order: order.display_order })
      .eq('id', order.id);

    if (error) throw error;
  }
}

// ============================================
// ONBOARDING RESPONSE QUERIES
// ============================================

/**
 * Get user's onboarding responses
 */
export async function getUserOnboardingResponses(
  userId: string,
  client?: TypedSupabaseClient
): Promise<OnboardingResponse[]> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('onboarding_responses')
    .select('*')
    .eq('user_id', userId);

  if (error) throw error;
  return data || [];
}

/**
 * Save batch onboarding responses and update session
 */
export async function saveOnboardingResponses(
  input: SaveOnboardingResponsesInput,
  client?: TypedSupabaseClient
): Promise<{ session: OnboardingSession; responses: OnboardingResponse[] }> {
  const supabase = client || getSupabaseAdminClient();

  // Upsert responses (one per user+question)
  const responseRows = input.responses.map(r => ({
    user_id: input.user_id,
    question_id: r.question_id,
    response: r.response,
    responded_at: new Date().toISOString(),
  }));

  const { data: savedResponses, error: respError } = await (supabase as any)
    .from('onboarding_responses')
    .upsert(responseRows, { onConflict: 'user_id,question_id' })
    .select();

  if (respError) throw respError;

  // Get total active questions count
  const { count: totalQuestions } = await supabase
    .from('onboarding_questions')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  // Upsert onboarding session
  const { data: session, error: sessionError } = await (supabase as any)
    .from('onboarding_sessions')
    .upsert({
      user_id: input.user_id,
      status: 'completed',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      source_app: input.source_app,
      questions_answered: input.responses.length,
      total_questions: totalQuestions || 0,
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (sessionError) throw sessionError;

  // Mark user's onboarding as completed
  await (supabase as any)
    .from('users')
    .update({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', input.user_id);

  return {
    session: session as OnboardingSession,
    responses: (savedResponses || []) as OnboardingResponse[],
  };
}

/**
 * Skip onboarding for a user
 */
export async function skipOnboarding(
  userId: string,
  sourceApp: 'marketing' | 'app',
  client?: TypedSupabaseClient
): Promise<OnboardingSession> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('onboarding_sessions')
    .upsert({
      user_id: userId,
      status: 'skipped',
      skipped_at: new Date().toISOString(),
      source_app: sourceApp,
      questions_answered: 0,
      total_questions: 0,
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) throw error;

  // Mark onboarding as completed (skipped counts as completed for flow purposes)
  await (supabase as any)
    .from('users')
    .update({
      onboarding_completed: true,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq('id', userId);

  return data as OnboardingSession;
}

// ============================================
// ONBOARDING SESSION QUERIES
// ============================================

/**
 * Get user's onboarding session
 */
export async function getOnboardingSession(
  userId: string,
  client?: TypedSupabaseClient
): Promise<OnboardingSession | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('onboarding_sessions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * List onboarding sessions (admin)
 */
export async function listOnboardingSessions(
  options: {
    status?: OnboardingSessionStatus;
    limit?: number;
    offset?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<{ sessions: OnboardingSession[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { status, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('onboarding_sessions')
    .select('*', { count: 'exact' });

  if (status) {
    query = query.eq('status', status);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    sessions: data || [],
    count: count || 0,
  };
}

/**
 * Mark onboarding session as notified (admin/telegram)
 */
export async function markOnboardingNotified(
  userId: string,
  channel: 'admin' | 'telegram',
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const updateData: Record<string, boolean> = {};
  if (channel === 'admin') updateData.admin_notified = true;
  if (channel === 'telegram') updateData.telegram_notified = true;

  const { error } = await (supabase as any)
    .from('onboarding_sessions')
    .update(updateData)
    .eq('user_id', userId);

  if (error) throw error;
}

// ============================================
// ONBOARDING ANALYTICS (Admin)
// ============================================

export interface OnboardingAnalytics {
  total_completed: number;
  total_skipped: number;
  total_pending: number;
  completion_rate: number;
  response_distribution: Record<string, Record<string, number>>;
}

/**
 * Get onboarding analytics (admin)
 */
export async function getOnboardingAnalytics(
  options: { startDate?: string; endDate?: string } = {},
  client?: TypedSupabaseClient
): Promise<OnboardingAnalytics> {
  const supabase = client || getSupabaseAdminClient();
  const { startDate, endDate } = options;

  // Get session status counts
  let sessionQuery = supabase
    .from('onboarding_sessions')
    .select('status');

  if (startDate) sessionQuery = sessionQuery.gte('created_at', startDate);
  if (endDate) sessionQuery = sessionQuery.lte('created_at', endDate);

  const { data: sessions, error: sessionError } = await sessionQuery;
  if (sessionError) throw sessionError;

  const statusCounts = { completed: 0, skipped: 0, pending: 0, in_progress: 0 };
  (sessions || []).forEach(s => {
    if (s.status in statusCounts) {
      statusCounts[s.status as keyof typeof statusCounts]++;
    }
  });

  const total = sessions?.length || 0;

  // Get response distributions per question
  let responseQuery = supabase
    .from('onboarding_responses')
    .select('question_id, response');

  if (startDate) responseQuery = responseQuery.gte('responded_at', startDate);
  if (endDate) responseQuery = responseQuery.lte('responded_at', endDate);

  const { data: responses, error: respError } = await responseQuery;
  if (respError) throw respError;

  const distribution: Record<string, Record<string, number>> = {};
  (responses || []).forEach(r => {
    if (!distribution[r.question_id]) {
      distribution[r.question_id] = {};
    }
    const resp = r.response as OnboardingResponseValue;
    if ('value' in resp) {
      distribution[r.question_id][resp.value] = (distribution[r.question_id][resp.value] || 0) + 1;
    } else if ('values' in resp) {
      resp.values.forEach(v => {
        distribution[r.question_id][v] = (distribution[r.question_id][v] || 0) + 1;
      });
    } else if ('scale' in resp) {
      const key = String(resp.scale);
      distribution[r.question_id][key] = (distribution[r.question_id][key] || 0) + 1;
    }
  });

  return {
    total_completed: statusCounts.completed,
    total_skipped: statusCounts.skipped,
    total_pending: statusCounts.pending + statusCounts.in_progress,
    completion_rate: total > 0 ? statusCounts.completed / total : 0,
    response_distribution: distribution,
  };
}

/**
 * Get pre-fill data from onboarding responses mapped to application form fields
 */
export async function getOnboardingPrefillData(
  userId: string,
  client?: TypedSupabaseClient
): Promise<Record<string, string | string[]>> {
  const supabase = client || getSupabaseBrowserClient();

  // Get questions with maps_to_field set
  const { data: questions, error: qError } = await supabase
    .from('onboarding_questions')
    .select('id, maps_to_field')
    .not('maps_to_field', 'is', null);

  if (qError) throw qError;
  if (!questions || questions.length === 0) return {};

  // Get user's responses for those questions
  const questionIds = questions.map(q => q.id);
  const { data: responses, error: rError } = await supabase
    .from('onboarding_responses')
    .select('question_id, response')
    .eq('user_id', userId)
    .in('question_id', questionIds);

  if (rError) throw rError;
  if (!responses || responses.length === 0) return {};

  // Build the pre-fill map
  const prefill: Record<string, string | string[]> = {};
  const questionFieldMap = new Map(questions.map(q => [q.id, q.maps_to_field]));

  responses.forEach(r => {
    const field = questionFieldMap.get(r.question_id);
    if (!field) return;

    const resp = r.response as OnboardingResponseValue;
    if ('value' in resp) {
      prefill[field] = resp.value;
    } else if ('values' in resp) {
      prefill[field] = resp.values;
    } else if ('scale' in resp) {
      prefill[field] = String(resp.scale);
    }
  });

  return prefill;
}
