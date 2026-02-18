// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Scholarship Queries
 *
 * Database queries for scholarship application workflow
 * (government school students)
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  ScholarshipApplication,
  ScholarshipApplicationStatus,
} from '../types';

// ============================================
// PUBLIC / USER QUERIES
// ============================================

/**
 * Get scholarship application by user ID
 */
export async function getScholarshipByUserId(
  userId: string,
  client?: TypedSupabaseClient
): Promise<ScholarshipApplication | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('scholarship_applications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Get scholarship application by lead profile ID
 */
export async function getScholarshipByLeadProfile(
  leadProfileId: string,
  client?: TypedSupabaseClient
): Promise<ScholarshipApplication | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('scholarship_applications')
    .select('*')
    .eq('lead_profile_id', leadProfileId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Create scholarship application (student submits documents)
 */
export async function createScholarshipApplication(
  input: {
    lead_profile_id: string;
    user_id: string;
    school_name?: string;
    school_id_card_url?: string;
    income_certificate_url?: string;
    aadhar_card_url?: string;
    mark_sheet_url?: string;
    annual_income_range?: string;
  },
  client?: TypedSupabaseClient
): Promise<ScholarshipApplication> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('scholarship_applications')
    .insert({
      lead_profile_id: input.lead_profile_id,
      user_id: input.user_id,
      is_government_school: true,
      school_name: input.school_name || null,
      school_id_card_url: input.school_id_card_url || null,
      income_certificate_url: input.income_certificate_url || null,
      aadhar_card_url: input.aadhar_card_url || null,
      mark_sheet_url: input.mark_sheet_url || null,
      annual_income_range: input.annual_income_range || null,
      is_low_income: true,
      scholarship_status: 'documents_submitted',
      submitted_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as ScholarshipApplication;
}

/**
 * Update scholarship application (student resubmits after revision request)
 */
export async function updateScholarshipDocuments(
  scholarshipId: string,
  updates: {
    school_id_card_url?: string;
    income_certificate_url?: string;
    aadhar_card_url?: string;
    mark_sheet_url?: string;
    school_name?: string;
    annual_income_range?: string;
  },
  client?: TypedSupabaseClient
): Promise<ScholarshipApplication> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('scholarship_applications')
    .update({
      ...updates,
      scholarship_status: 'documents_submitted',
      submitted_at: new Date().toISOString(),
      revision_notes: null, // Clear previous revision notes
      updated_at: new Date().toISOString(),
    })
    .eq('id', scholarshipId)
    .select()
    .single();

  if (error) throw error;
  return data as ScholarshipApplication;
}

// ============================================
// ADMIN QUERIES
// ============================================

/**
 * Open scholarship for a specific user (admin action)
 * Sets lead_profile.scholarship_eligible = true and creates initial scholarship record
 */
export async function openScholarshipForUser(
  leadProfileId: string,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<{ leadProfile: any; scholarship: ScholarshipApplication }> {
  const supabase = client || getSupabaseAdminClient();

  // 1. Update lead profile to mark scholarship eligible
  const { data: leadProfile, error: lpError } = await (supabase as any)
    .from('lead_profiles')
    .update({
      scholarship_eligible: true,
      scholarship_opened_at: new Date().toISOString(),
      scholarship_opened_by: adminId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadProfileId)
    .select('*, users!inner(id, name, email, phone)')
    .single();

  if (lpError) throw lpError;

  // 2. Get user_id from lead profile
  const userId = leadProfile.user_id;

  // 3. Check if scholarship application already exists
  const { data: existing } = await supabase
    .from('scholarship_applications')
    .select('id')
    .eq('lead_profile_id', leadProfileId)
    .limit(1)
    .single();

  let scholarship;
  if (existing) {
    // Update existing
    const { data, error } = await (supabase as any)
      .from('scholarship_applications')
      .update({
        scholarship_status: 'eligible_pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) throw error;
    scholarship = data;
  } else {
    // Create new
    const { data, error } = await (supabase as any)
      .from('scholarship_applications')
      .insert({
        lead_profile_id: leadProfileId,
        user_id: userId,
        is_government_school: true,
        scholarship_status: 'eligible_pending',
      })
      .select()
      .single();

    if (error) throw error;
    scholarship = data;
  }

  return { leadProfile, scholarship: scholarship as ScholarshipApplication };
}

/**
 * Admin reviews scholarship application
 */
export async function adminReviewScholarship(
  scholarshipId: string,
  action: 'approve' | 'reject' | 'request_revision',
  data: {
    adminId: string;
    approved_fee?: number;
    admin_notes?: string;
    rejection_reason?: string;
    revision_notes?: string;
  },
  client?: TypedSupabaseClient
): Promise<ScholarshipApplication> {
  const supabase = client || getSupabaseAdminClient();

  let updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  switch (action) {
    case 'approve':
      updates = {
        ...updates,
        scholarship_status: 'approved',
        approved_fee: data.approved_fee ?? 5000, // Default ₹5,000
        admin_notes: data.admin_notes || null,
        verified_by: data.adminId,
        verified_at: new Date().toISOString(),
        verification_status: 'verified',
      };
      break;

    case 'reject':
      updates = {
        ...updates,
        scholarship_status: 'rejected',
        rejection_reason: data.rejection_reason || null,
        admin_notes: data.admin_notes || null,
        verified_by: data.adminId,
        verified_at: new Date().toISOString(),
        verification_status: 'rejected',
      };
      break;

    case 'request_revision':
      updates = {
        ...updates,
        scholarship_status: 'revision_requested',
        revision_notes: data.revision_notes || null,
        revision_requested_at: new Date().toISOString(),
        revision_requested_by: data.adminId,
      };
      break;
  }

  const { data: result, error } = await (supabase as any)
    .from('scholarship_applications')
    .update(updates)
    .eq('id', scholarshipId)
    .select()
    .single();

  if (error) throw error;
  return result as ScholarshipApplication;
}

/**
 * List scholarship applications for admin review
 */
export async function listScholarshipsForReview(
  options: {
    status?: ScholarshipApplicationStatus;
    search?: string;
    limit?: number;
    offset?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<{ data: (ScholarshipApplication & { user?: any; lead_profile?: any })[]; total: number }> {
  const supabase = client || getSupabaseAdminClient();
  const limit = options.limit || 20;
  const offset = options.offset || 0;

  let query = supabase
    .from('scholarship_applications')
    .select('*, users!scholarship_applications_user_id_fkey(id, name, email, phone), lead_profiles!inner(id, application_number, school_type, interest_course)', { count: 'exact' });

  if (options.status) {
    query = query.eq('scholarship_status', options.status);
  } else {
    // Exclude not_eligible by default
    query = query.neq('scholarship_status', 'not_eligible');
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;
  return { data: (data || []) as any, total: count || 0 };
}

/**
 * Get scholarship application by ID (admin)
 */
export async function getScholarshipById(
  scholarshipId: string,
  client?: TypedSupabaseClient
): Promise<ScholarshipApplication | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('scholarship_applications')
    .select('*')
    .eq('id', scholarshipId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}
