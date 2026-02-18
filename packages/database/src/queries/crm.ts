// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - CRM Queries
 *
 * Database queries for the unified admin CRM user journey view
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  UserJourney,
  UserJourneyListOptions,
  UserJourneyDetail,
  PipelineStageCounts,
  PipelineStage,
  AdminUserNote,
  User,
  LeadProfile,
  ProfileChangeSource,
} from '../types';

// ============================================
// LIST USER JOURNEYS (CRM main table)
// ============================================

/**
 * List user journeys from the unified view with filters and pagination
 */
export async function listUserJourneys(
  options: UserJourneyListOptions = {},
  client?: TypedSupabaseClient
): Promise<{ users: UserJourney[]; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  const {
    pipelineStage,
    search,
    status,
    userType,
    applicationStatus,
    interestCourse,
    hasDemoRegistration,
    dateFrom,
    dateTo,
    limit = 25,
    offset = 0,
    orderBy = 'created_at',
    orderDirection = 'desc',
  } = options;

  let query = supabase
    .from('user_journey_view')
    .select('*', { count: 'exact' });

  // Apply filters
  if (pipelineStage) {
    query = query.eq('pipeline_stage', pipelineStage);
  }

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,application_number.ilike.%${search}%`
    );
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (userType) {
    query = query.eq('user_type', userType);
  }

  if (applicationStatus) {
    query = query.eq('application_status', applicationStatus);
  }

  if (interestCourse) {
    query = query.eq('interest_course', interestCourse);
  }

  if (hasDemoRegistration !== undefined) {
    query = query.eq('has_demo_registration', hasDemoRegistration);
  }

  if (dateFrom) {
    query = query.gte('created_at', dateFrom);
  }

  if (dateTo) {
    query = query.lte('created_at', dateTo);
  }

  // Ordering
  const ascending = orderDirection === 'asc';
  query = query.order(orderBy, { ascending });

  // Pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    throw error;
  }

  return {
    users: (data || []) as UserJourney[],
    total: count || 0,
  };
}

// ============================================
// PIPELINE STAGE COUNTS
// ============================================

/**
 * Get counts of users in each pipeline stage
 */
export async function getPipelineStageCounts(
  client?: TypedSupabaseClient
): Promise<PipelineStageCounts> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('user_journey_view')
    .select('pipeline_stage');

  if (error) {
    throw error;
  }

  const counts: PipelineStageCounts = {
    new_lead: 0,
    demo_requested: 0,
    demo_attended: 0,
    phone_verified: 0,
    application_submitted: 0,
    admin_approved: 0,
    payment_complete: 0,
    enrolled: 0,
    total: 0,
  };

  if (data) {
    for (const row of data) {
      const stage = row.pipeline_stage as PipelineStage;
      if (stage in counts) {
        counts[stage]++;
      }
      counts.total++;
    }
  }

  return counts;
}

// ============================================
// USER JOURNEY DETAIL
// ============================================

/**
 * Get full user journey detail for the CRM detail page.
 * Fetches all related data in parallel for performance.
 */
export async function getUserJourneyDetail(
  userId: string,
  client?: TypedSupabaseClient
): Promise<UserJourneyDetail | null> {
  const supabase = client || getSupabaseAdminClient();

  // Fetch user first
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (userError) {
    if (userError.code === 'PGRST116') return null;
    throw userError;
  }

  // Fetch all related data in parallel
  const [
    leadProfileResult,
    studentProfileResult,
    demoRegsResult,
    paymentsResult,
    installmentsResult,
    onboardingSessionResult,
    onboardingResponsesResult,
    documentsResult,
    scholarshipResult,
    cashbackResult,
    historyResult,
    notesResult,
  ] = await Promise.all([
    // Lead profile (most recent non-deleted)
    supabase
      .from('lead_profiles')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Student profile
    supabase
      .from('student_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),

    // Demo registrations with slot and survey info
    supabase
      .from('demo_class_registrations')
      .select('*, slot:demo_class_slots(*), survey:demo_class_surveys(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),

    // Payments
    supabase
      .from('payments')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),

    // Payment installments (need lead_profile_id, fetch all and filter)
    supabase
      .from('payment_installments')
      .select('*')
      .order('installment_number', { ascending: true }),

    // Onboarding session
    supabase
      .from('onboarding_sessions')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),

    // Onboarding responses with question details
    supabase
      .from('onboarding_responses')
      .select('*, question:onboarding_questions(*)')
      .eq('user_id', userId)
      .order('responded_at', { ascending: true }),

    // Application documents
    supabase
      .from('application_documents')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),

    // Scholarship application (via lead profile, fetched below)
    supabase
      .from('scholarship_applications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10),

    // Cashback claims
    supabase
      .from('cashback_claims')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),

    // Profile history
    supabase
      .from('user_profile_history')
      .select('*, changed_by_user:users!changed_by(id, name, email)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),

    // Admin notes
    supabase
      .from('admin_user_notes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  const leadProfile = leadProfileResult.data as LeadProfile | null;

  // Filter installments by lead_profile_id
  const installments = leadProfile
    ? (installmentsResult.data || []).filter(
        (i: any) => i.lead_profile_id === leadProfile.id
      )
    : [];

  // Filter scholarship by lead_profile_id
  const scholarshipApplication = leadProfile
    ? (scholarshipResult.data || []).find(
        (s: any) => s.lead_profile_id === leadProfile.id
      ) || null
    : null;

  // Compute pipeline stage
  const pipelineStage = computePipelineStage(
    user,
    leadProfile,
    demoRegsResult.data || [],
    paymentsResult.data || [],
    studentProfileResult.data
  );

  return {
    user,
    leadProfile,
    studentProfile: studentProfileResult.data || null,
    demoRegistrations: (demoRegsResult.data || []) as any[],
    payments: (paymentsResult.data || []) as any[],
    installments: installments as any[],
    onboardingSession: onboardingSessionResult.data || null,
    onboardingResponses: (onboardingResponsesResult.data || []) as any[],
    documents: (documentsResult.data || []) as any[],
    scholarshipApplication: scholarshipApplication as any,
    cashbackClaims: (cashbackResult.data || []) as any[],
    profileHistory: (historyResult.data || []) as any[],
    adminNotes: (notesResult.data || []) as AdminUserNote[],
    pipelineStage,
  };
}

// ============================================
// PIPELINE STAGE COMPUTATION (client-side)
// ============================================

/**
 * Pure function to compute pipeline stage from related data.
 * Must match the SQL CASE in the user_journey_view.
 */
export function computePipelineStage(
  user: User,
  leadProfile: LeadProfile | null,
  demoRegistrations: any[],
  payments: any[],
  studentProfile: any | null
): PipelineStage {
  if (studentProfile) return 'enrolled';

  const hasPaidPayment = payments.some(
    (p: any) => p.status === 'paid' && p.amount > 0
  );
  if (hasPaidPayment) return 'payment_complete';

  if (leadProfile?.status === 'approved') return 'admin_approved';

  if (
    leadProfile &&
    ['submitted', 'under_review', 'pending_verification'].includes(leadProfile.status)
  ) {
    return 'application_submitted';
  }

  const hasAttended = demoRegistrations.some((r: any) => r.attended === true);
  if (hasAttended) return 'demo_attended';

  if (demoRegistrations.length > 0) return 'demo_requested';

  if (user.phone_verified) return 'phone_verified';

  return 'new_lead';
}

// ============================================
// ADMIN EDIT USER PROFILE
// ============================================

/**
 * Admin updates user profile fields with history tracking.
 */
export async function adminUpdateUserProfile(
  userId: string,
  updates: Partial<User>,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<User> {
  const supabase = client || getSupabaseAdminClient();

  // Get current user for change comparison
  const { data: currentUser, error: fetchError } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (fetchError) throw fetchError;

  // Record changes in history
  const historyInserts: any[] = [];
  for (const [key, newValue] of Object.entries(updates)) {
    const oldValue = (currentUser as any)[key];
    const oldStr = oldValue != null ? JSON.stringify(oldValue) : null;
    const newStr = newValue != null ? JSON.stringify(newValue) : null;

    if (oldStr !== newStr) {
      historyInserts.push({
        user_id: userId,
        field_name: key,
        old_value: oldStr,
        new_value: newStr,
        changed_by: adminId,
        change_source: 'admin' as ProfileChangeSource,
      });
    }
  }

  if (historyInserts.length > 0) {
    await supabase.from('user_profile_history').insert(historyInserts);
  }

  // Apply update
  const { data: updatedUser, error: updateError } = await supabase
    .from('users')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select()
    .single();

  if (updateError) throw updateError;

  return updatedUser;
}

/**
 * Admin updates lead profile fields with history tracking.
 */
export async function adminUpdateLeadProfile(
  profileId: string,
  updates: Partial<LeadProfile>,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<LeadProfile> {
  const supabase = client || getSupabaseAdminClient();

  // Get current profile for comparison
  const { data: current, error: fetchError } = await supabase
    .from('lead_profiles')
    .select('*')
    .eq('id', profileId)
    .single();

  if (fetchError) throw fetchError;

  // Record changes in user_profile_history (linked to the user)
  const historyInserts: any[] = [];
  for (const [key, newValue] of Object.entries(updates)) {
    const oldValue = (current as any)[key];
    const oldStr = oldValue != null ? JSON.stringify(oldValue) : null;
    const newStr = newValue != null ? JSON.stringify(newValue) : null;

    if (oldStr !== newStr) {
      historyInserts.push({
        user_id: current.user_id,
        field_name: `lead_profile.${key}`,
        old_value: oldStr,
        new_value: newStr,
        changed_by: adminId,
        change_source: 'admin' as ProfileChangeSource,
      });
    }
  }

  if (historyInserts.length > 0) {
    await supabase.from('user_profile_history').insert(historyInserts);
  }

  // Apply update
  const { data: updated, error: updateError } = await supabase
    .from('lead_profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profileId)
    .select()
    .single();

  if (updateError) throw updateError;

  return updated;
}

// ============================================
// ADMIN NOTES
// ============================================

/**
 * Add an admin note to a user
 */
export async function addAdminNote(
  userId: string,
  adminId: string,
  adminName: string,
  note: string,
  client?: TypedSupabaseClient
): Promise<AdminUserNote> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('admin_user_notes')
    .insert({
      user_id: userId,
      admin_id: adminId,
      admin_name: adminName,
      note,
    })
    .select()
    .single();

  if (error) throw error;

  return data as AdminUserNote;
}

/**
 * Get admin notes for a user
 */
export async function getAdminNotes(
  userId: string,
  client?: TypedSupabaseClient
): Promise<AdminUserNote[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('admin_user_notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []) as AdminUserNote[];
}
