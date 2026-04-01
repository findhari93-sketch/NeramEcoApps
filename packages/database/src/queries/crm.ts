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
 * Get pipeline stage counts excluding specific stages (for Leads view)
 */
export async function getLeadPipelineStageCounts(
  excludeStages: PipelineStage[] = ['enrolled', 'payment_complete'],
  client?: TypedSupabaseClient
): Promise<PipelineStageCounts> {
  const supabase = client || getSupabaseAdminClient();

  const { data: rows, error } = await supabase
    .from('user_journey_view')
    .select('pipeline_stage');

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
