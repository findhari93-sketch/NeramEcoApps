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
  CallbackRequest,
  CallbackAttempt,
  CallbackOutcome,
  LifecycleStatus,
  ExamStatus,
  StudentProgram,
} from '../types';

// ============================================
// ACADEMIC YEAR HELPERS
// ============================================

/**
 * Academic year runs April -> March in India. Returns the cohort string
 * 'YYYY-YY' for a given date (defaults to now). April 2026 -> '2026-27',
 * March 2026 -> '2025-26'.
 */
export function currentAcademicYear(date: Date = new Date()): string {
  const month = date.getMonth(); // 0 = Jan
  const year = date.getFullYear();
  const startYear = month >= 3 ? year : year - 1; // April (index 3) starts the year
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/**
 * Map a target exam year (e.g. 2026, the year the exam is written) to the
 * academic-year cohort that prepares for it. Exam in 2026 -> '2025-26'.
 * Returns null for invalid input.
 */
export function deriveAcademicYearFromExamYear(examYear?: number | null): string | null {
  if (!examYear || !Number.isInteger(examYear) || examYear < 2000 || examYear > 2100) {
    return null;
  }
  const startYear = examYear - 1;
  return `${startYear}-${String(examYear % 100).padStart(2, '0')}`;
}

const ACADEMIC_YEAR_REGEX = /^[0-9]{4}-[0-9]{2}$/;

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
    excludeStages,
    search,
    status,
    userType,
    applicationStatus,
    interestCourse,
    hasDemoRegistration,
    contactedStatus,
    isDeadLead,
    isIrrelevant,
    excludeLinkedToClassroom,
    lifecycleStatus,
    excludeArchived = true,
    academicYear,
    currentBatchCode,
    candidateSegment,
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

  if (excludeStages && excludeStages.length > 0) {
    for (const stage of excludeStages) {
      query = query.neq('pipeline_stage', stage);
    }
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

  if (contactedStatus) {
    query = query.eq('contacted_status', contactedStatus);
  }

  if (isDeadLead) {
    query = query.eq('contacted_status', 'dead_lead');
  }

  if (isIrrelevant) {
    query = query.eq('contacted_status', 'irrelevant');
  }

  if (excludeLinkedToClassroom) {
    query = query.is('linked_classroom_email', null);
  }

  // Lifecycle focus: an explicit lifecycleStatus wins; otherwise the default
  // CRM list shows active users only so the focus stays on current cohorts.
  if (lifecycleStatus) {
    query = query.eq('lifecycle_status', lifecycleStatus);
  } else if (excludeArchived) {
    query = query.eq('lifecycle_status', 'active');
  }

  // Batch (exam-year cohort) axis. 'current' shows the current batch OR untagged
  // users, so the many null-batch leads still surface for triage; 'none' shows
  // only untagged; a 'YYYY-YY' code shows exactly that batch; 'all' skips the filter.
  // currentBatchCode is the registry current (not the April-March helper) when provided.
  if (academicYear === 'none') {
    query = query.is('academic_year', null);
  } else if (academicYear === 'current') {
    const cy = currentBatchCode || currentAcademicYear();
    query = query.or(`academic_year.eq.${cy},academic_year.is.null`);
  } else if (academicYear && academicYear !== 'all') {
    query = query.eq('academic_year', academicYear);
  }

  // Suggestion-only candidate segments (admin reviews, never auto-acts)
  if (candidateSegment === 'no_phone_dormant') {
    query = query.or('phone.is.null,phone.eq.');
  } else if (candidateSegment === 'old_cohort') {
    query = query
      .not('academic_year', 'is', null)
      .neq('academic_year', currentBatchCode || currentAcademicYear());
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

  // Enrich with is_disabled from the users table (not in view yet)
  const rows = data || [];
  let disableMap: Record<string, boolean> = {};
  if (rows.length > 0) {
    const ids = rows.map((r: any) => r.id).filter(Boolean);
    const { data: disableData } = await supabase
      .from('users')
      .select('id, is_disabled')
      .in('id', ids);
    if (disableData) {
      for (const u of disableData) {
        disableMap[u.id] = (u as any).is_disabled ?? false;
      }
    }
  }

  const users = rows.map((r: any) => ({
    ...r,
    is_disabled: disableMap[r.id] ?? false,
  })) as UserJourney[];

  return {
    users,
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
  options: { excludeArchived?: boolean } = {},
  client?: TypedSupabaseClient
): Promise<PipelineStageCounts> {
  const supabase = client || getSupabaseAdminClient();
  const { excludeArchived = true } = options;

  // When excluding archived (the default), the RPC (which counts every row)
  // would be wrong, so count client-side over the active subset. The dataset
  // is small enough (~thousands) for this to be fine.
  if (excludeArchived) {
    const { data: rows, error } = await supabase
      .from('user_journey_view')
      .select('pipeline_stage')
      .eq('lifecycle_status', 'active');

    if (error) throw error;

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

    if (rows) {
      for (const row of rows) {
        const stage = row.pipeline_stage as PipelineStage;
        if (stage in counts) counts[stage]++;
        counts.total++;
      }
    }

    return counts;
  }

  // Use SQL aggregation instead of fetching all rows
  const { data, error } = await (supabase as any).rpc('get_pipeline_stage_counts');

  // Fallback to client-side counting if RPC doesn't exist
  if (error) {
    const { data: rows, error: fallbackError } = await supabase
      .from('user_journey_view')
      .select('pipeline_stage');

    if (fallbackError) throw fallbackError;

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

    if (rows) {
      for (const row of rows) {
        const stage = row.pipeline_stage as PipelineStage;
        if (stage in counts) {
          counts[stage]++;
        }
        counts.total++;
      }
    }

    return counts;
  }

  // Build counts from RPC result
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
        counts[stage] = Number(row.cnt);
      }
      counts.total += Number(row.cnt);
    }
  }

  return counts;
}

/**
 * Get pipeline stage counts excluding specific stages and linked-to-classroom users (for Leads view)
 */
export async function getLeadPipelineStageCounts(
  excludeStages: PipelineStage[] = ['enrolled', 'payment_complete'],
  client?: TypedSupabaseClient
): Promise<PipelineStageCounts> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('user_journey_view')
    .select('pipeline_stage');

  // Exclude users already linked to a classroom (they're identified students)
  query = query.is('linked_classroom_email', null);

  const { data: rows, error } = await query;

  if (error) throw error;

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

  if (rows) {
    for (const row of rows) {
      const stage = row.pipeline_stage as PipelineStage;
      if (excludeStages.includes(stage)) continue;
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
    callbackRequestsResult,
    callbackAttemptsResult,
    nexusEnrollmentsResult,
    nexusDocumentsResult,
    nexusOnboardingResult,
    nexusExamPlansResult,
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

    // Callback requests
    supabase
      .from('callback_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),

    // Callback attempts
    supabase
      .from('callback_attempts')
      .select('*')
      .eq('user_id', userId)
      .order('attempted_at', { ascending: false }),

    // Nexus classroom enrollments
    supabase
      .from('nexus_enrollments')
      .select('*, classroom:nexus_classrooms(*)')
      .eq('user_id', userId)
      .eq('role', 'student')
      .eq('is_active', true)
      .order('enrolled_at', { ascending: false }),

    // Nexus student documents (identity, academic, exam docs from Nexus onboarding)
    supabase
      .from('nexus_student_documents')
      .select('*')
      .eq('student_id', userId)
      .order('uploaded_at', { ascending: false }),

    // Nexus onboarding status (most recent)
    supabase
      .from('nexus_student_onboarding')
      .select('*')
      .eq('student_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // Nexus student exam plans
    supabase
      .from('nexus_student_exam_plans')
      .select('*')
      .eq('student_id', userId)
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
    callbackRequests: (callbackRequestsResult.data || []) as CallbackRequest[],
    callbackAttempts: (callbackAttemptsResult.data || []) as CallbackAttempt[],
    nexusEnrollments: (nexusEnrollmentsResult.data || []) as any[],
    nexusDocuments: (nexusDocumentsResult.data || []) as any[],
    nexusOnboarding: (nexusOnboardingResult.data || null) as any,
    nexusExamPlans: (nexusExamPlansResult.data || []) as any[],
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

// ============================================
// ADMIN BULK DELETE USERS
// ============================================

export interface BulkDeleteResult {
  deletedUsers: number;
  deletedLeadProfiles: number;
  deletedStudentProfiles: number;
  deletedDemoRegistrations: number;
  deletedPayments: number;
  deletedOnboardingSessions: number;
  deletedOnboardingResponses: number;
  deletedDocuments: number;
  deletedScholarships: number;
  deletedInstallments: number;
  deletedCashbackClaims: number;
  deletedAdminNotes: number;
  deletedProfileHistory: number;
}

/**
 * Bulk delete users with all related data using the database function.
 * Atomic - all or nothing.
 */
export async function adminBulkDeleteUsers(
  userIds: string[],
  adminId: string,
  client?: TypedSupabaseClient
): Promise<BulkDeleteResult> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase.rpc('admin_bulk_delete_users', {
    user_ids: userIds,
    admin_id: adminId,
  });

  if (error) throw error;

  if (!data || data.length === 0) {
    throw new Error('Delete function returned no data');
  }

  const result = data[0];

  return {
    deletedUsers: result.deleted_users,
    deletedLeadProfiles: result.deleted_lead_profiles,
    deletedStudentProfiles: result.deleted_student_profiles,
    deletedDemoRegistrations: result.deleted_demo_registrations,
    deletedPayments: result.deleted_payments,
    deletedOnboardingSessions: result.deleted_onboarding_sessions,
    deletedOnboardingResponses: result.deleted_onboarding_responses,
    deletedDocuments: result.deleted_documents,
    deletedScholarships: result.deleted_scholarships,
    deletedInstallments: result.deleted_installments,
    deletedCashbackClaims: result.deleted_cashback_claims,
    deletedAdminNotes: result.deleted_admin_notes,
    deletedProfileHistory: result.deleted_profile_history,
  };
}

// ============================================
// CALLBACK MANAGEMENT (migration 20260307)
// ============================================

/**
 * Schedule a callback for a user at a specific date/time.
 */
export async function scheduleCallback(
  userId: string,
  adminId: string,
  scheduledAt: string,
  notes?: string,
  client?: TypedSupabaseClient
): Promise<CallbackRequest> {
  const supabase = client || getSupabaseAdminClient();

  // Get user info for the callback
  const { data: user } = await supabase
    .from('users')
    .select('name, phone, email')
    .eq('id', userId)
    .single();

  if (!user) throw new Error('User not found');

  // Create or update callback request
  const { data, error } = await (supabase as any)
    .from('callback_requests')
    .insert({
      user_id: userId,
      name: user.name || 'Unknown',
      phone: user.phone || '',
      email: user.email,
      status: 'scheduled',
      assigned_to: adminId,
      scheduled_at: scheduledAt,
      scheduled_callback_at: scheduledAt,
      notes: notes || null,
      timezone: 'Asia/Kolkata',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to schedule callback: ${error.message}`);

  // Update lead profile contacted_status
  await (supabase as any)
    .from('lead_profiles')
    .update({
      contacted_status: 'callback_scheduled',
      contacted_at: new Date().toISOString(),
      contacted_by: adminId,
    })
    .eq('user_id', userId)
    .is('deleted_at', null);

  return data as CallbackRequest;
}

/**
 * Record a callback attempt with outcome.
 */
export async function recordCallbackAttempt(
  callbackRequestId: string,
  adminId: string,
  adminName: string,
  outcome: CallbackOutcome,
  comments?: string,
  rescheduledTo?: string,
  client?: TypedSupabaseClient
): Promise<CallbackAttempt> {
  const supabase = client || getSupabaseAdminClient();

  // Get the callback request to find user_id
  const { data: cbReq, error: cbErr } = await supabase
    .from('callback_requests')
    .select('id, user_id')
    .eq('id', callbackRequestId)
    .single();

  if (cbErr || !cbReq) throw new Error('Callback request not found');

  // Insert the attempt
  const { data: attempt, error: attemptErr } = await (supabase as any)
    .from('callback_attempts')
    .insert({
      callback_request_id: callbackRequestId,
      user_id: cbReq.user_id,
      admin_id: adminId,
      admin_name: adminName,
      outcome,
      comments: comments || null,
      rescheduled_to: rescheduledTo || null,
    })
    .select()
    .single();

  if (attemptErr) throw new Error(`Failed to record attempt: ${attemptErr.message}`);

  // Update callback_request based on outcome
  const updates: Record<string, unknown> = {
    attempt_count: undefined, // Will use RPC or raw increment
    last_attempt_at: new Date().toISOString(),
  };

  if (outcome === 'talked') {
    updates.status = 'completed';
    updates.completed_at = new Date().toISOString();
    updates.call_outcome = 'talked';
  } else if (outcome === 'rescheduled' && rescheduledTo) {
    updates.status = 'scheduled';
    updates.scheduled_callback_at = rescheduledTo;
    updates.call_outcome = 'rescheduled';
  } else if (outcome === 'dead_lead') {
    updates.status = 'dead_lead';
    updates.is_dead_lead = true;
    updates.call_outcome = 'dead_lead';
  } else {
    updates.status = 'attempted';
    updates.call_outcome = outcome;
  }

  if (comments) {
    updates.call_notes = comments;
  }

  // Remove undefined attempt_count and increment manually
  delete updates.attempt_count;
  const { error: updateErr } = await (supabase as any)
    .from('callback_requests')
    .update(updates)
    .eq('id', callbackRequestId);

  if (updateErr) console.error('Error updating callback request:', updateErr);

  // Increment attempt_count via raw query
  await supabase.rpc('increment_callback_attempt_count' as any, { req_id: callbackRequestId }).catch(() => {
    // Fallback: just log, not critical
    console.warn('Could not increment attempt_count, RPC may not exist');
  });

  // Update lead_profiles contacted_status
  const contactedStatus = outcome === 'talked' ? 'talked'
    : outcome === 'dead_lead' ? 'dead_lead'
    : outcome === 'rescheduled' ? 'callback_scheduled'
    : 'unreachable';

  await (supabase as any)
    .from('lead_profiles')
    .update({
      contacted_status: contactedStatus,
      contacted_at: new Date().toISOString(),
      contacted_by: adminId,
    })
    .eq('user_id', cbReq.user_id)
    .is('deleted_at', null);

  return attempt as CallbackAttempt;
}

/**
 * Get callback attempts for a user (timeline history).
 */
export async function getCallbackAttempts(
  userId: string,
  client?: TypedSupabaseClient
): Promise<CallbackAttempt[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('callback_attempts')
    .select('*')
    .eq('user_id', userId)
    .order('attempted_at', { ascending: false });

  if (error) {
    console.error('Error fetching callback attempts:', error);
    return [];
  }
  return (data || []) as CallbackAttempt[];
}

/**
 * Mark user as dead lead.
 */
export async function markUserAsDeadLead(
  userId: string,
  adminId: string,
  reason: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // Update lead_profiles
  await (supabase as any)
    .from('lead_profiles')
    .update({
      contacted_status: 'dead_lead',
      contacted_at: new Date().toISOString(),
      contacted_by: adminId,
    })
    .eq('user_id', userId)
    .is('deleted_at', null);

  // Update all open callback_requests for this user
  await (supabase as any)
    .from('callback_requests')
    .update({
      status: 'dead_lead',
      is_dead_lead: true,
      call_notes: reason,
    })
    .eq('user_id', userId)
    .in('status', ['pending', 'scheduled', 'attempted']);
}

/**
 * Mark a user as irrelevant (casual browser, not in pipeline).
 */
export async function markUserAsIrrelevant(
  userId: string,
  adminId: string,
  reason: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // Update lead_profiles
  await (supabase as any)
    .from('lead_profiles')
    .update({
      contacted_status: 'irrelevant',
      contacted_at: new Date().toISOString(),
      contacted_by: adminId,
    })
    .eq('user_id', userId)
    .is('deleted_at', null);

  // Close any open callback_requests
  await (supabase as any)
    .from('callback_requests')
    .update({
      status: 'cancelled',
      call_notes: `Marked irrelevant: ${reason}`,
    })
    .eq('user_id', userId)
    .in('status', ['pending', 'scheduled', 'attempted']);
}

// ============================================
// LIFECYCLE: REVERSIBLE ARCHIVE + COHORT + EXAM STATUS (migration 20260622)
// ============================================

/**
 * Append a user_profile_history row (best-effort audit, mirrors adminUpdateUserProfile).
 */
async function recordUserHistory(
  supabase: any,
  userId: string,
  fieldName: string,
  oldValue: unknown,
  newValue: unknown,
  adminId: string
): Promise<void> {
  try {
    await supabase.from('user_profile_history').insert({
      user_id: userId,
      field_name: fieldName,
      old_value: oldValue != null ? JSON.stringify(oldValue) : null,
      new_value: newValue != null ? JSON.stringify(newValue) : null,
      changed_by: adminId,
      change_source: 'admin' as ProfileChangeSource,
    });
  } catch {
    // History is non-critical; never block the primary action on it.
  }
}

/**
 * Archive a user: de-prioritize them in the CRM (hidden from the default view)
 * WITHOUT deleting them and WITHOUT disabling their login. Fully reversible.
 * Never touches is_disabled, so a returning old-batch student can still sign in.
 */
export async function archiveUser(
  userId: string,
  adminId: string,
  reason?: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await (supabase as any)
    .from('users')
    .update({
      lifecycle_status: 'archived',
      archived_at: new Date().toISOString(),
      archived_by: adminId,
      archived_reason: reason || 'Archived from CRM',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;

  await recordUserHistory(supabase, userId, 'lifecycle_status', 'active', 'archived', adminId);
}

/**
 * Restore an archived user back to the active focus view. Reversible.
 */
export async function restoreUser(
  userId: string,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const { error } = await (supabase as any)
    .from('users')
    .update({
      lifecycle_status: 'active',
      archived_at: null,
      archived_by: null,
      archived_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) throw error;

  await recordUserHistory(supabase, userId, 'lifecycle_status', 'archived', 'active', adminId);
}

/**
 * Archive many users in one statement. Returns the number archived.
 */
export async function bulkArchiveUsers(
  userIds: string[],
  adminId: string,
  reason?: string,
  client?: TypedSupabaseClient
): Promise<{ archived: number }> {
  const supabase = client || getSupabaseAdminClient();
  if (!userIds.length) return { archived: 0 };

  const { data, error } = await (supabase as any)
    .from('users')
    .update({
      lifecycle_status: 'archived',
      archived_at: new Date().toISOString(),
      archived_by: adminId,
      archived_reason: reason || 'Archived from CRM (bulk)',
      updated_at: new Date().toISOString(),
    })
    .in('id', userIds)
    .select('id');

  if (error) throw error;
  return { archived: (data || []).length };
}

/**
 * Set / update a user's academic-year cohort. Validates the 'YYYY-YY' format.
 * Updatable so a returning student can move from e.g. '2025-26' to '2026-27'.
 */
export async function setUserAcademicYear(
  userId: string,
  academicYear: string,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  if (!ACADEMIC_YEAR_REGEX.test(academicYear)) {
    throw new Error(`Invalid academic year "${academicYear}". Expected format YYYY-YY, e.g. 2026-27.`);
  }

  // Fetch current value for the history record
  const { data: current } = await (supabase as any)
    .from('users')
    .select('academic_year')
    .eq('id', userId)
    .single();

  const { error } = await (supabase as any)
    .from('users')
    .update({ academic_year: academicYear, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;

  await recordUserHistory(
    supabase,
    userId,
    'academic_year',
    current?.academic_year ?? null,
    academicYear,
    adminId
  );
}

/**
 * Record the student's answer to the "are you writing the exam?" outreach.
 * Optionally update their cohort and/or archive them in the same call.
 */
export async function recordExamStatus(
  userId: string,
  examStatus: ExamStatus,
  adminId: string,
  opts: { academicYear?: string; archive?: boolean; reason?: string } = {},
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();
  const { academicYear, archive, reason } = opts;

  if (academicYear && !ACADEMIC_YEAR_REGEX.test(academicYear)) {
    throw new Error(`Invalid academic year "${academicYear}". Expected format YYYY-YY, e.g. 2026-27.`);
  }

  const update: Record<string, unknown> = {
    exam_status: examStatus,
    updated_at: new Date().toISOString(),
  };
  if (academicYear) update.academic_year = academicYear;
  if (archive) {
    update.lifecycle_status = 'archived';
    update.archived_at = new Date().toISOString();
    update.archived_by = adminId;
    update.archived_reason = reason || `Verified exam status: ${examStatus}`;
  }

  const { error } = await (supabase as any)
    .from('users')
    .update(update)
    .eq('id', userId);

  if (error) throw error;

  await recordUserHistory(supabase, userId, 'exam_status', null, examStatus, adminId);
  if (archive) {
    await recordUserHistory(supabase, userId, 'lifecycle_status', 'active', 'archived', adminId);
  }
}

/**
 * Link a tools app user to their Nexus classroom email.
 */
export async function linkUserToClassroom(
  userId: string,
  classroomEmail: string,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  await (supabase as any)
    .from('users')
    .update({
      linked_classroom_email: classroomEmail,
      linked_classroom_at: new Date().toISOString(),
      linked_classroom_by: adminId,
    })
    .eq('id', userId);
}

/**
 * Unlink a user from their Nexus classroom email.
 */
export async function unlinkUserFromClassroom(
  userId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  await (supabase as any)
    .from('users')
    .update({
      linked_classroom_email: null,
      linked_classroom_at: null,
      linked_classroom_by: null,
    })
    .eq('id', userId);
}

/**
 * Get callbacks due for reminder (scheduled_callback_at within next N minutes).
 * Used by cron endpoint.
 */
export async function getDueCallbackReminders(
  withinMinutes: number = 5,
  client?: TypedSupabaseClient
): Promise<(CallbackRequest & { user_name: string; user_phone: string })[]> {
  const supabase = client || getSupabaseAdminClient();
  const now = new Date();
  const windowEnd = new Date(now.getTime() + withinMinutes * 60 * 1000);

  const { data, error } = await supabase
    .from('callback_requests')
    .select('*, users!callback_requests_user_id_fkey(name, phone)')
    .eq('status', 'scheduled')
    .eq('is_dead_lead', false)
    .not('scheduled_callback_at', 'is', null)
    .lte('scheduled_callback_at', windowEnd.toISOString())
    .gte('scheduled_callback_at', now.toISOString());

  if (error) {
    console.error('Error fetching due callback reminders:', error);
    return [];
  }

  return (data || []).map((cb: any) => ({
    ...cb,
    user_name: cb.users?.name || cb.name || 'Unknown',
    user_phone: cb.users?.phone || cb.phone || '',
  })) as (CallbackRequest & { user_name: string; user_phone: string })[];
}

/**
 * Generate a shareable payment link token for a lead profile.
 * Used when the student has no email or Google account.
 * Token expires in 7 days. Calling again overwrites the previous token.
 */
export async function generatePaymentLinkToken(
  leadProfileId: string,
  client?: TypedSupabaseClient
): Promise<{ token: string; expiresAt: string }> {
  const supabase = client || getSupabaseAdminClient();
  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from('lead_profiles')
    .update({
      payment_link_token: token,
      payment_link_expires_at: expiresAt,
    })
    .eq('id', leadProfileId);

  if (error) throw error;
  return { token, expiresAt };
}

/**
 * Look up a lead profile by its shareable payment link token.
 * Returns null if the token does not exist.
 * Caller is responsible for checking expiry and status.
 */
export async function getLeadProfileByPaymentToken(
  token: string,
  client?: TypedSupabaseClient
) {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('lead_profiles')
    .select('id, application_number, status, payment_link_expires_at, user_id, users!inner(phone, email, name, firebase_uid)')
    .eq('payment_link_token', token)
    .single();

  if (error) return null;
  return data as {
    id: string;
    application_number: string | null;
    status: string;
    payment_link_expires_at: string | null;
    user_id: string;
    users: { phone: string | null; email: string | null; name: string | null; firebase_uid: string | null };
  };
}

// ============================================
// ALUMNI GRADUATION (migration 20260622100000)
// ============================================

/**
 * Graduate a batch of students to "alumni". Unlike CRM archive, this REVOKES
 * Nexus access (is_alumni gates /api/auth/me) and deactivates their Nexus
 * enrollments. It also archives them in the CRM (lifecycle_status) for tidiness
 * and stamps the cohort year. Their data and drawing submissions are preserved.
 * Fully reversible via restoreAlumniToActive.
 *
 * @returns counts of graduated users and deactivated enrollments.
 */
export async function graduateStudentsToAlumni(
  userIds: string[],
  adminId: string,
  opts: { academicYear: string; reason?: string },
  client?: TypedSupabaseClient
): Promise<{ graduated: number; enrollmentsDeactivated: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { academicYear, reason } = opts;

  if (!ACADEMIC_YEAR_REGEX.test(academicYear)) {
    throw new Error(`Invalid academic year "${academicYear}". Expected format YYYY-YY, e.g. 2025-26.`);
  }
  if (!userIds.length) return { graduated: 0, enrollmentsDeactivated: 0 };

  const now = new Date().toISOString();

  // 1. Deactivate their Nexus enrollments FIRST, so a failure here (e.g. a
  // constraint) can't leave a user flipped to alumni but still enrolled.
  // removal_reason_category is constrained to a fixed set; 'course_completed' is
  // the closest fit for graduation (the descriptive text goes in removal_notes).
  const { data: deactivated, error: enrErr } = await supabase
    .from('nexus_enrollments')
    .update({
      is_active: false,
      removed_at: now,
      removal_reason_category: 'course_completed',
      removal_notes: reason || `Graduated to alumni (${academicYear})`,
      removed_by: adminId,
    })
    .in('user_id', userIds)
    .eq('is_active', true)
    .select('id');

  if (enrErr) throw enrErr;

  // 2. Flip users to alumni (gate) + archive in CRM + stamp cohort.
  const { data: graduatedRows, error: userErr } = await supabase
    .from('users')
    .update({
      is_alumni: true,
      alumni_since: now,
      academic_year: academicYear,
      lifecycle_status: 'archived',
      archived_at: now,
      archived_by: adminId,
      archived_reason: reason || `Graduated to alumni (${academicYear})`,
      updated_at: now,
    })
    .in('id', userIds)
    .select('id');

  if (userErr) throw userErr;

  // 3. Best-effort audit trail per user.
  for (const row of graduatedRows || []) {
    await recordUserHistory(supabase, row.id, 'is_alumni', false, true, adminId);
  }

  return {
    graduated: (graduatedRows || []).length,
    enrollmentsDeactivated: (deactivated || []).length,
  };
}

/**
 * Reverse graduation: bring alumni back to active (clears the Nexus gate and the
 * CRM archive). Re-enrolling them into classrooms stays a deliberate manual step.
 */
export async function restoreAlumniToActive(
  userIds: string[],
  adminId: string,
  client?: TypedSupabaseClient
): Promise<{ restored: number }> {
  const supabase = client || getSupabaseAdminClient();
  if (!userIds.length) return { restored: 0 };

  const { data, error } = await supabase
    .from('users')
    .update({
      is_alumni: false,
      alumni_since: null,
      lifecycle_status: 'active',
      archived_at: null,
      archived_by: null,
      archived_reason: null,
      updated_at: new Date().toISOString(),
    })
    .in('id', userIds)
    .select('id');

  if (error) throw error;

  for (const row of data || []) {
    await recordUserHistory(supabase, row.id, 'is_alumni', true, false, adminId);
  }

  return { restored: (data || []).length };
}

/**
 * List alumni directly from the users table (NOT user_journey_view, which filters
 * firebase_uid IS NOT NULL and would miss MS-only Nexus students). Grouped/sorted
 * by cohort year then name.
 */
export async function listAlumni(
  options: { academicYear?: string; search?: string; limit?: number; offset?: number } = {},
  client?: TypedSupabaseClient
): Promise<{ alumni: Array<Pick<User, 'id' | 'name' | 'email' | 'avatar_url' | 'academic_year' | 'alumni_since'>>; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { academicYear, search, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('users')
    .select('id, name, email, avatar_url, academic_year, alumni_since', { count: 'exact' })
    .eq('is_alumni', true);

  // Hide synthetic E2E test accounts (e2e-<purpose>@…, incl. timestamped leftovers)
  // from the human admin views. Anchored on the dash so the canonical e2etesting*
  // Microsoft accounts (asserted on by alumni-graduate-admin.spec.ts) stay visible.
  query = query.or('email.is.null,email.not.ilike.e2e-*');

  if (academicYear) query = query.eq('academic_year', academicYear);
  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  query = query
    .order('academic_year', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  return { alumni: (data || []) as any, total: count || 0 };
}

/**
 * One active (non-alumni) Nexus student in the admin graduation workspace, with
 * their cohort year and an activity signal (drawing-submission count).
 */
export interface ActiveNexusStudent {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  ms_oid: string | null;
  academic_year: string | null;
  last_login_at: string | null;
  submission_count: number;
}

/**
 * List active (non-alumni) Nexus students for the admin "Students" tab: a flat,
 * searchable list NOT scoped to a classroom (students belong to many classrooms,
 * so the organising concept is the academic year, not the room).
 *
 * Filters:
 * - search: name / email (ilike)
 * - academicYear: a 'YYYY-YY' year, 'none' for students with no year set, or
 *   undefined / 'all' for everyone. (Backfilling the year is the point of the
 *   "no year" filter + bulkSetAcademicYear.)
 * - activity: 'inactive' keeps only students with zero drawing submissions.
 *
 * The full filtered set is returned (capped) and paginated client-side in the
 * admin DataGrid; the student population is small (a few hundred) so this avoids
 * the aggregate/pagination mismatch of filtering activity after a DB page.
 */
export async function listActiveNexusStudents(
  options: {
    search?: string;
    academicYear?: string;
    activity?: 'all' | 'inactive';
    /**
     * Which program list to return. Defaults to 'architecture' so the core admin
     * Students tab never shows software-course students; the /software page passes
     * 'software' to get the separated list.
     */
    program?: StudentProgram;
  } = {},
  client?: TypedSupabaseClient
): Promise<{ students: ActiveNexusStudent[]; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { search, academicYear, activity = 'all', program = 'architecture' } = options;

  let query = supabase
    .from('users')
    .select('id, name, email, avatar_url, ms_oid, academic_year, last_login_at')
    .eq('is_alumni', false)
    .eq('user_type', 'student')
    .eq('student_program', program);

  // Hide synthetic E2E test accounts (e2e-<purpose>@…, incl. timestamped leftovers)
  // from the human admin views. Anchored on the dash so the canonical e2etesting*
  // Microsoft accounts (asserted on by alumni-graduate-admin.spec.ts) stay visible.
  query = query.or('email.is.null,email.not.ilike.e2e-*');

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
  }
  if (academicYear === 'none') {
    query = query.is('academic_year', null);
  } else if (academicYear && academicYear !== 'all') {
    query = query.eq('academic_year', academicYear);
  }

  query = query.order('name', { ascending: true }).limit(5000);

  const { data: rows, error } = await query;
  if (error) throw error;

  const students = rows || [];
  const ids = students.map((s: any) => s.id);

  // Submission counts from the pre-aggregated activity view (LEFT-join semantics:
  // a student with no submissions simply has no row -> 0).
  const countsById: Record<string, number> = {};
  if (ids.length) {
    const { data: activityRows } = await supabase
      .from('admin_student_activity')
      .select('student_id, submission_count')
      .in('student_id', ids);
    for (const a of activityRows || []) {
      countsById[(a as any).student_id] = Number((a as any).submission_count) || 0;
    }
  }

  let result: ActiveNexusStudent[] = students.map((s: any) => ({
    ...s,
    submission_count: countsById[s.id] || 0,
  }));

  if (activity === 'inactive') {
    result = result.filter((s) => s.submission_count === 0);
  }

  return { students: result, total: result.length };
}

// ============================================
// STUDENTS-BY-YEAR HUB (admin /students working hub)
// ============================================

/**
 * A row in the /students working hub: the enrolled student (a users row) with
 * their fee snapshot left-joined from student_profiles. Unlike the legacy
 * /students query this is users-based, so it includes active students who have
 * no student_profiles row yet AND past-year graduated students (is_alumni=true),
 * which the year buckets need.
 */
export interface HubStudent {
  id: string; // users.id (also the user_id the per-student routes key off)
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  personal_email: string | null; // personal Gmail (kept separate from the classroom account)
  linked_classroom_email: string | null; // admin-linked @neramclasses.com classroom account
  phone: string | null;
  avatar_url: string | null;
  academic_year: string | null;
  is_alumni: boolean;
  last_login_at: string | null;
  ms_oid: string | null;
  // Fees (0 / null when the student has no profile row yet)
  student_profile_id: string | null;
  student_id: string | null;
  enrollment_date: string | null;
  total_fee: number;
  fee_paid: number;
  fee_due: number;
  payment_status: string | null;
  ms_teams_email: string | null;
}

export type StudentLifecycle = 'active' | 'graduated' | 'all';

/**
 * List students for the admin /students hub, organised by academic year.
 *
 * year:
 *   'current' -> the current cohort: active students whose academic_year is the
 *                current year OR not set yet. New enrolments are not auto-stamped,
 *                so untagged-but-active students are current and must stay in the
 *                daily view (the admin then "Set year" to bucket the older ones).
 *   'none'    -> only students with no academic_year set.
 *   'all'     -> every year.
 *   'YYYY-YY' -> that cohort (active + graduated, so a finished batch shows whole).
 * status: optionally narrow to active (is_alumni=false) or graduated (is_alumni=true).
 */
export async function listStudentsByYear(
  options: {
    search?: string;
    year?: 'current' | 'none' | 'all' | string;
    status?: StudentLifecycle;
    program?: StudentProgram;
    paymentStatus?: string;
    currentBatchCode?: string; // registry current-batch code; falls back to the April-March helper
  } = {},
  client?: TypedSupabaseClient
): Promise<{ students: HubStudent[]; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { search, year = 'current', status, program = 'architecture', paymentStatus, currentBatchCode } = options;

  let query = supabase
    .from('users')
    .select(
      `
      id, name, first_name, last_name, email, personal_email, linked_classroom_email,
      phone, avatar_url, academic_year, is_alumni, last_login_at, ms_oid,
      student_profiles!student_profiles_user_id_fkey (
        id, student_id, enrollment_date, total_fee, fee_paid, fee_due,
        payment_status, ms_teams_email
      )
    `
    )
    .eq('user_type', 'student')
    .eq('student_program', program);

  // Hide synthetic E2E accounts (same guard as listActiveNexusStudents).
  query = query.or('email.is.null,email.not.ilike.e2e-*');

  // Lifecycle filter (an explicit status wins over the year-derived default).
  if (status === 'active') query = query.eq('is_alumni', false);
  else if (status === 'graduated') query = query.eq('is_alumni', true);

  // Year axis. Multiple .or() calls are AND-combined by PostgREST, which is what
  // we want (e.g. the e2e guard AND the year group AND the search group).
  if (year === 'current') {
    if (status === undefined) query = query.eq('is_alumni', false);
    const cy = currentBatchCode || currentAcademicYear();
    query = query.or(`academic_year.eq.${cy},academic_year.is.null`);
  } else if (year === 'none') {
    query = query.is('academic_year', null);
  } else if (year && year !== 'all') {
    query = query.eq('academic_year', year);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
  }

  query = query.order('name', { ascending: true }).limit(5000);

  const { data: rows, error } = await query;
  if (error) throw error;

  let students: HubStudent[] = (rows || []).map((u: any) => {
    const sp = Array.isArray(u.student_profiles) ? u.student_profiles[0] : u.student_profiles;
    return {
      id: u.id,
      name: u.name || [u.first_name, u.last_name].filter(Boolean).join(' ') || null,
      first_name: u.first_name || null,
      last_name: u.last_name || null,
      email: u.email || null,
      personal_email: u.personal_email || null,
      linked_classroom_email: u.linked_classroom_email || null,
      phone: u.phone || null,
      avatar_url: u.avatar_url || null,
      academic_year: u.academic_year || null,
      is_alumni: !!u.is_alumni,
      last_login_at: u.last_login_at || null,
      ms_oid: u.ms_oid || null,
      student_profile_id: sp?.id || null,
      student_id: sp?.student_id || null,
      enrollment_date: sp?.enrollment_date || null,
      total_fee: Number(sp?.total_fee) || 0,
      fee_paid: Number(sp?.fee_paid) || 0,
      fee_due: Number(sp?.fee_due) || 0,
      payment_status: sp?.payment_status || null,
      ms_teams_email: sp?.ms_teams_email || null,
    };
  });

  // The payment-status filter lives on the joined child; apply it in JS (the
  // dataset is a few hundred rows, matching the page's existing client filtering).
  if (paymentStatus) {
    students = students.filter((s) => s.payment_status === paymentStatus);
  }

  return { students, total: students.length };
}

export interface YearRevenue {
  year: string | null; // null bucket = students with no academic_year set
  studentCount: number;
  totalFee: number;
  collected: number; // Σ fee_paid
  pending: number; // Σ fee_due
  fullyPaidCount: number;
  partialCount: number;
}

/**
 * Per-academic-year revenue rollup for the /students hub. Sums the denormalised
 * fee snapshot on student_profiles, grouped by users.academic_year. This reflects
 * the enrolment records, not a live payments-table sum (payments carry no year).
 * Sorted with the unstamped (null) bucket first, then years descending.
 */
export async function getRevenueByYear(
  options: { program?: StudentProgram } = {},
  client?: TypedSupabaseClient
): Promise<YearRevenue[]> {
  const supabase = client || getSupabaseAdminClient();
  const { program = 'architecture' } = options;

  const { data, error } = await supabase
    .from('student_profiles')
    .select(
      `
      total_fee, fee_paid, fee_due, payment_status,
      users!inner ( academic_year, user_type, student_program )
    `
    )
    .eq('users.user_type', 'student')
    .eq('users.student_program', program);
  if (error) throw error;

  const buckets = new Map<string | null, YearRevenue>();
  for (const sp of (data as any[]) || []) {
    const u = Array.isArray(sp.users) ? sp.users[0] : sp.users;
    const year: string | null = u?.academic_year ?? null;
    const b =
      buckets.get(year) ??
      ({ year, studentCount: 0, totalFee: 0, collected: 0, pending: 0, fullyPaidCount: 0, partialCount: 0 } as YearRevenue);
    b.studentCount++;
    b.totalFee += Number(sp.total_fee) || 0;
    b.collected += Number(sp.fee_paid) || 0;
    b.pending += Number(sp.fee_due) || 0;
    if (sp.payment_status === 'paid') b.fullyPaidCount++;
    else if (sp.payment_status === 'pending' && (Number(sp.fee_paid) || 0) > 0) b.partialCount++;
    buckets.set(year, b);
  }

  return [...buckets.values()].sort((a, b) => {
    if (a.year === null) return -1;
    if (b.year === null) return 1;
    return b.year.localeCompare(a.year);
  });
}

/**
 * Backfill / bulk-set the academic-year cohort on a set of students. Validates
 * the 'YYYY-YY' format. Used by the admin "Set academic year" action so every
 * student ends up year-tagged and can then be selected by year for graduation.
 */
export async function bulkSetAcademicYear(
  userIds: string[],
  academicYear: string,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<{ updated: number }> {
  const supabase = client || getSupabaseAdminClient();

  if (!ACADEMIC_YEAR_REGEX.test(academicYear)) {
    throw new Error(`Invalid academic year "${academicYear}". Expected format YYYY-YY, e.g. 2025-26.`);
  }
  if (!userIds.length) return { updated: 0 };

  const { data, error } = await supabase
    .from('users')
    .update({ academic_year: academicYear, updated_at: new Date().toISOString() })
    .in('id', userIds)
    .select('id');

  if (error) throw error;

  for (const row of data || []) {
    await recordUserHistory(supabase, row.id, 'academic_year', null, academicYear, adminId);
  }

  return { updated: (data || []).length };
}

/**
 * Move a set of students between the architecture and software programs. This is
 * what the admin "Move to Software course" / "Move back to architecture students"
 * actions call: it just retags users.student_program so the student appears on the
 * right list (/alumni vs /software).
 *
 * Moving to 'software' also tries to re-assert nexus_access_enabled = false so the
 * student is locked out of Nexus (they are already closed by the rebuild gate by
 * default; this guarantees it even if they had been admitted). That access flip is
 * best-effort: the nexus_access_enabled column ships with the separate "Nexus rebuild
 * gate" feature and may not exist in every environment yet, so a failure there must
 * not block the re-tag. Reversible: moving back to 'architecture' leaves the access
 * flag alone (architecture students are still admitted one-by-one via the existing
 * student-access tool).
 */
export async function bulkSetStudentProgram(
  userIds: string[],
  program: StudentProgram,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<{ updated: number }> {
  const supabase = client || getSupabaseAdminClient();

  if (program !== 'architecture' && program !== 'software') {
    throw new Error(`Invalid student program "${program}". Expected 'architecture' or 'software'.`);
  }
  if (!userIds.length) return { updated: 0 };

  const { data, error } = await supabase
    .from('users')
    .update({ student_program: program, updated_at: new Date().toISOString() })
    .in('id', userIds)
    .select('id');

  if (error) throw error;

  // Software students stay out of Nexus during the rebuild. Best-effort: the column
  // is owned by the separate rebuild-gate feature and may not be applied on this env.
  if (program === 'software') {
    const { error: accessError } = await supabase
      .from('users')
      .update({ nexus_access_enabled: false })
      .in('id', userIds);
    if (accessError) {
      console.warn('bulkSetStudentProgram: could not set nexus_access_enabled (column may not exist yet):', accessError.message);
    }
  }

  for (const row of data || []) {
    await recordUserHistory(supabase, row.id, 'student_program', null, program, adminId);
  }

  return { updated: (data || []).length };
}

/** A staff role a user can be reclassified to via "Mark as staff". */
export type StaffRole = 'teacher' | 'admin';

/**
 * Reclassify users to a staff role. Used by the admin "Mark as staff" action when
 * someone who is actually a staff member was created/imported as a student, e.g. the
 * Entra sync (apps/admin/.../students/sync-entra) defaults every tenant account it
 * imports to user_type='student', so teachers/admins can land in the Students list.
 *
 * Flipping user_type to 'teacher'/'admin' removes them from the Students list (which
 * filters user_type='student') AND gives the correct Nexus role: the Nexus auth route
 * derives nexusRole from user_type ('admin'->admin, 'teacher'->teacher) and only gates
 * user_type='student', so staff are never caught by the "closed for renovation" gate.
 * 'admin' additionally unlocks the admin dashboard (AdminGuard requires user_type='admin').
 * Mirrors bulkSetStudentProgram, incl. recordUserHistory audit.
 */
export async function bulkSetUserRole(
  userIds: string[],
  role: StaffRole,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<{ updated: number }> {
  const supabase = client || getSupabaseAdminClient();

  if (role !== 'teacher' && role !== 'admin') {
    throw new Error(`Invalid staff role "${role}". Expected 'teacher' or 'admin'.`);
  }
  if (!userIds.length) return { updated: 0 };

  const { data, error } = await supabase
    .from('users')
    .update({ user_type: role, updated_at: new Date().toISOString() })
    .in('id', userIds)
    .select('id');

  if (error) throw error;

  for (const row of data || []) {
    await recordUserHistory(supabase, row.id, 'user_type', null, role, adminId);
  }

  return { updated: (data || []).length };
}
