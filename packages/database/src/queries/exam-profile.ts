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
  ExamYearSource,
} from '../types';
import { examSeasonYear, isPlausibleStatedExamYear, startYearOf } from '../utils/academic-year';
import {
  readExamYearPromptState,
  snoozeExamYearPrompt,
  isExamYearPromptDue,
  type ExamYearPromptState,
  type ExamYearSnoozeAction,
} from '../utils/exam-year-prompt';

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
        // The season, not the calendar year: from July the next exam is next year's.
        planning_year: input.planning_year || examSeasonYear(),
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

  // Say where the year came from. Best effort: a database without the
  // 20261209090200 columns must not fail the save.
  await (supabase as any)
    .from('user_exam_profiles')
    .update({ planning_year_source: 'exam_setup', planning_year_set_at: new Date().toISOString() })
    .eq('user_id', userId)
    .then(() => undefined, () => undefined);

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

// ─── Stated exam year: one write path ────────────────────────────────────────
//
// About 1,600 of 1,900 accounts only have an exam year the CRM estimates from
// the sign-up date. Every surface that asks the student (Tools App sheet,
// Aintra, demo booking, apply forms, staff, exam setup) records the answer
// here, so the rules live in one place:
//   - a year from a batch (users.academic_year) is never overwritten,
//   - the year must be plausible (examYearChoices, plus or minus one),
//   - an inferred answer (Aintra parsing a chat message) never replaces a year
//     the student already stated somewhere more deliberate.

export type RecordStatedExamYearResult =
  | { saved: true; year: number; source: ExamYearSource }
  | {
      saved: false;
      reason: 'invalid_year' | 'no_user' | 'batch' | 'kept_existing' | 'error';
      error?: string;
    };

/** Sources that only infer a year and so never replace an existing one. */
const INFERRED_SOURCES: ReadonlySet<ExamYearSource> = new Set<ExamYearSource>(['aintra']);

/** PostgREST / Postgres "that column does not exist" (migration not applied yet). */
function isMissingColumnError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    /planning_year_(source|set_at)/.test(error.message || '')
  );
}

export async function recordStatedExamYear(
  client: TypedSupabaseClient | null | undefined,
  userId: string | null | undefined,
  year: unknown,
  source: ExamYearSource,
  now: Date = new Date(),
): Promise<RecordStatedExamYearResult> {
  const examYear = typeof year === 'string' && /^\d{4}$/.test(year.trim()) ? Number(year) : year;
  if (!isPlausibleStatedExamYear(examYear, now)) return { saved: false, reason: 'invalid_year' };
  if (!userId) return { saved: false, reason: 'no_user' };

  const supabase = (client || getSupabaseAdminClient()) as any;

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, academic_year')
      .eq('id', userId)
      .maybeSingle();
    if (userError) return { saved: false, reason: 'error', error: userError.message };
    if (!user) return { saved: false, reason: 'no_user' };
    // A batch year is staff-assigned and authoritative.
    if (startYearOf(user.academic_year) !== null) return { saved: false, reason: 'batch' };

    const { data: existing, error: readError } = await supabase
      .from('user_exam_profiles')
      .select('id, planning_year')
      .eq('user_id', userId)
      .maybeSingle();
    if (readError) return { saved: false, reason: 'error', error: readError.message };

    if (existing && existing.planning_year != null && INFERRED_SOURCES.has(source)) {
      return { saved: false, reason: 'kept_existing' };
    }

    const stamp = new Date(now).toISOString();
    const full = {
      planning_year: examYear,
      planning_year_source: source,
      planning_year_set_at: stamp,
      updated_at: stamp,
    };
    const bare = { planning_year: examYear, updated_at: stamp };

    const write = async (fields: Record<string, unknown>) => {
      if (existing) {
        return supabase.from('user_exam_profiles').update(fields).eq('user_id', userId);
      }
      // A new row only records the year. It must not mark the Question Bank
      // onboarding done (that column defaults to true), and nata_status is NOT
      // NULL: someone naming a future exam year is planning to apply.
      return supabase.from('user_exam_profiles').insert({
        user_id: userId,
        nata_status: 'planning_to_apply',
        attempt_count: 0,
        qb_onboarding_completed: false,
        ...fields,
      });
    };

    let { error } = await write(full);
    if (error && isMissingColumnError(error)) ({ error } = await write(bare));
    if (error && error.code === '23505') {
      // Lost a race with another insert for the same user: update instead.
      ({ error } = await supabase.from('user_exam_profiles').update(full).eq('user_id', userId));
      if (error && isMissingColumnError(error)) {
        ({ error } = await supabase.from('user_exam_profiles').update(bare).eq('user_id', userId));
      }
    }
    if (error) return { saved: false, reason: 'error', error: error.message };

    return { saved: true, year: examYear as number, source };
  } catch (err) {
    return { saved: false, reason: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

export interface ExamYearStatus {
  /** The year the student (or a batch) gave us, or null when we only have an estimate. */
  year: number | null;
  source: 'batch' | 'stated' | null;
  prompt: ExamYearPromptState;
  /** True when the Tools App sheet should ask now. */
  promptDue: boolean;
}

/**
 * Whether a user has stated an exam year, using the same priority as
 * user_lifecycle_view: batch, then the latest application form, then
 * user_exam_profiles.planning_year.
 */
export async function getExamYearStatus(
  client: TypedSupabaseClient | null | undefined,
  userId: string,
  now: Date = new Date(),
): Promise<ExamYearStatus> {
  const supabase = (client || getSupabaseAdminClient()) as any;

  const [userRes, leadRes, profileRes] = await Promise.all([
    supabase.from('users').select('academic_year, metadata').eq('id', userId).maybeSingle(),
    supabase
      .from('lead_profiles')
      .select('target_exam_year')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('user_exam_profiles').select('planning_year').eq('user_id', userId).maybeSingle(),
  ]);
  if (userRes.error) throw new Error(userRes.error.message);

  const prompt = readExamYearPromptState(userRes.data?.metadata?.exam_year_prompt);
  const batchStart = startYearOf(userRes.data?.academic_year);
  if (batchStart !== null) {
    return { year: batchStart + 1, source: 'batch', prompt, promptDue: false };
  }
  const stated = leadRes.data?.target_exam_year ?? profileRes.data?.planning_year ?? null;
  if (stated != null) {
    return { year: Number(stated), source: 'stated', prompt, promptDue: false };
  }
  return { year: null, source: null, prompt, promptDue: isExamYearPromptDue(prompt, now) };
}

/**
 * Remember a "Later" or "Not sure yet" in users.metadata.exam_year_prompt,
 * merging into whatever else metadata holds.
 */
export async function snoozeExamYearPromptForUser(
  client: TypedSupabaseClient | null | undefined,
  userId: string,
  action: ExamYearSnoozeAction,
  now: Date = new Date(),
): Promise<ExamYearPromptState> {
  const supabase = (client || getSupabaseAdminClient()) as any;
  const { data, error } = await supabase.from('users').select('metadata').eq('id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('User not found');

  const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const next = snoozeExamYearPrompt(readExamYearPromptState(metadata.exam_year_prompt), action, now);
  const { error: writeError } = await supabase
    .from('users')
    .update({ metadata: { ...metadata, exam_year_prompt: next } })
    .eq('id', userId);
  if (writeError) throw new Error(writeError.message);
  return next;
}
