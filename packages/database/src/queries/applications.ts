/**
 * Neram Classes - Application Queries
 *
 * Database operations for lead profiles (applications), callbacks, and centers
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  LeadProfile,
  CallbackRequest,
  OfflineCenter,
  CenterVisitBooking,
  ApplicationDeletion,
  ApplicantCategory,
  ApplicationStatus,
  AcademicData,
  CasteCategory,
  CourseType,
  LocationSource,
} from '../types';

// ============================================
// APPLICATION (LEAD PROFILE) QUERIES
// ============================================

export interface CreateApplicationInput {
  user_id: string;
  // Personal info
  father_name?: string;
  // Location
  country?: string;
  city?: string;
  state?: string;
  district?: string;
  pincode?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  location_source?: LocationSource;
  // Academic
  applicant_category?: ApplicantCategory;
  academic_data?: AcademicData;
  caste_category?: CasteCategory;
  target_exam_year?: number;
  // Course
  interest_course?: CourseType;
  selected_course_id?: string;
  selected_center_id?: string;
  hybrid_learning_accepted?: boolean;
  // Status
  status?: ApplicationStatus;
  phone_verified?: boolean;
  phone_verified_at?: string;
  // Source tracking
  source?: 'website_form' | 'app' | 'referral' | 'manual';
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referral_code?: string;
}

export interface UpdateApplicationInput extends Partial<CreateApplicationInput> {
  reviewed_by?: string;
  reviewed_at?: string;
  admin_notes?: string;
  rejection_reason?: string;
  assigned_fee?: number;
  discount_amount?: number;
  coupon_code?: string;
  final_fee?: number;
}

/**
 * Create a new application (lead profile)
 */
export async function createApplication(
  supabase: SupabaseClient,
  input: CreateApplicationInput
): Promise<LeadProfile> {
  const { data, error } = await supabase
    .from('lead_profiles')
    .insert({
      ...input,
      status: input.status || 'draft',
      country: input.country || 'IN',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get application by ID
 */
export async function getApplicationById(
  supabase: SupabaseClient,
  id: string
): Promise<LeadProfile | null> {
  const { data, error } = await supabase
    .from('lead_profiles')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get application by application number
 */
export async function getApplicationByNumber(
  supabase: SupabaseClient,
  applicationNumber: string
): Promise<LeadProfile | null> {
  const { data, error } = await supabase
    .from('lead_profiles')
    .select('*')
    .eq('application_number', applicationNumber)
    .is('deleted_at', null)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get all applications for a user
 */
export async function getApplicationsByUserId(
  supabase: SupabaseClient,
  userId: string,
  includeDeleted = false
): Promise<LeadProfile[]> {
  let query = supabase
    .from('lead_profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

/**
 * Update an application
 */
export async function updateApplication(
  supabase: SupabaseClient,
  id: string,
  input: UpdateApplicationInput
): Promise<LeadProfile> {
  const { data, error } = await supabase
    .from('lead_profiles')
    .update(input)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Submit an application (change status to submitted)
 * This will trigger the application_number generation
 */
export async function submitApplication(
  supabase: SupabaseClient,
  id: string
): Promise<LeadProfile> {
  const { data, error } = await supabase
    .from('lead_profiles')
    .update({
      status: 'submitted',
      form_completed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Soft delete an application
 */
export async function deleteApplication(
  supabase: SupabaseClient,
  id: string,
  deletionReason: string,
  deletionType: 'user_requested' | 'admin_deleted' | 'duplicate' | 'spam' | 'test_data' = 'user_requested',
  deletedBy?: string
): Promise<void> {
  // Update the lead profile
  const { error: updateError } = await supabase
    .from('lead_profiles')
    .update({
      status: 'deleted',
      deleted_at: new Date().toISOString(),
      deletion_reason: deletionReason,
    })
    .eq('id', id);

  if (updateError) throw updateError;

  // Create deletion audit record
  const { error: auditError } = await supabase.from('application_deletions').insert({
    lead_profile_id: id,
    deleted_by: deletedBy,
    deletion_type: deletionType,
    deletion_reason: deletionReason,
  });

  if (auditError) throw auditError;
}

/**
 * Restore a soft-deleted application
 */
export async function restoreApplication(
  supabase: SupabaseClient,
  id: string,
  restoredBy: string,
  notes?: string
): Promise<LeadProfile> {
  // Update lead profile
  const { data, error: updateError } = await supabase
    .from('lead_profiles')
    .update({
      status: 'submitted', // Restore to submitted status
      deleted_at: null,
      deletion_reason: null,
    })
    .eq('id', id)
    .select()
    .single();

  if (updateError) throw updateError;

  // Update deletion audit record
  const { error: auditError } = await supabase
    .from('application_deletions')
    .update({
      restored_at: new Date().toISOString(),
      restored_by: restoredBy,
      restoration_notes: notes,
      can_restore: false,
    })
    .eq('lead_profile_id', id)
    .is('restored_at', null);

  if (auditError) throw auditError;

  return data;
}

/**
 * Check if user has an existing application
 */
export async function hasExistingApplication(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { count, error } = await supabase
    .from('lead_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('deleted_at', null);

  if (error) throw error;
  return (count || 0) > 0;
}

// ============================================
// CALLBACK REQUEST QUERIES
// ============================================

export interface CreateCallbackInput {
  user_id?: string;
  name: string;
  phone: string;
  email?: string;
  preferred_date?: string;
  preferred_slot?: 'morning' | 'afternoon' | 'evening';
  course_interest?: CourseType;
  query_type?: string;
  notes?: string;
}

/**
 * Create a callback request
 */
export async function createCallbackRequest(
  supabase: SupabaseClient,
  input: CreateCallbackInput
): Promise<CallbackRequest> {
  const { data, error } = await supabase
    .from('callback_requests')
    .insert({
      ...input,
      status: 'pending',
      timezone: 'Asia/Kolkata',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get callback requests for a user
 */
export async function getCallbackRequestsByUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<CallbackRequest[]> {
  const { data, error } = await supabase
    .from('callback_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Update callback request status
 */
export async function updateCallbackRequest(
  supabase: SupabaseClient,
  id: string,
  updates: Partial<CallbackRequest>
): Promise<CallbackRequest> {
  const { data, error } = await supabase
    .from('callback_requests')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ============================================
// OFFLINE CENTER QUERIES
// ============================================

/**
 * Get all active offline centers
 */
export async function getActiveCenters(
  supabase: SupabaseClient
): Promise<OfflineCenter[]> {
  const { data, error } = await supabase
    .from('offline_centers')
    .select('*')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Get center by ID
 */
export async function getCenterById(
  supabase: SupabaseClient,
  id: string
): Promise<OfflineCenter | null> {
  const { data, error } = await supabase
    .from('offline_centers')
    .select('*')
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

/**
 * Get center by slug
 */
export async function getCenterBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<OfflineCenter | null> {
  const { data, error } = await supabase
    .from('offline_centers')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ============================================
// CENTER VISIT BOOKING QUERIES
// ============================================

export interface CreateVisitBookingInput {
  center_id: string;
  user_id?: string;
  visitor_name: string;
  visitor_phone: string;
  visitor_email?: string;
  visit_date: string;
  visit_time_slot: string;
  purpose?: string;
}

/**
 * Create a center visit booking
 */
export async function createVisitBooking(
  supabase: SupabaseClient,
  input: CreateVisitBookingInput
): Promise<CenterVisitBooking> {
  const { data, error } = await supabase
    .from('center_visit_bookings')
    .insert({
      ...input,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get visit bookings for a user
 */
export async function getVisitBookingsByUserId(
  supabase: SupabaseClient,
  userId: string
): Promise<CenterVisitBooking[]> {
  const { data, error } = await supabase
    .from('center_visit_bookings')
    .select('*, offline_centers(*)')
    .eq('user_id', userId)
    .order('visit_date', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ============================================
// EDUCATION BOARD QUERIES
// ============================================

/**
 * Get all active education boards
 */
export async function getEducationBoards(
  supabase: SupabaseClient
): Promise<Array<{ id: string; code: string; name: string; full_name: string | null }>> {
  const { data, error } = await supabase
    .from('education_boards')
    .select('id, code, name, full_name')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) throw error;
  return data || [];
}

// ============================================
// ADMIN QUERIES
// ============================================

export interface ListApplicationsOptions {
  status?: ApplicationStatus;
  applicant_category?: ApplicantCategory;
  search?: string;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * List applications with filters (admin use)
 */
export async function listApplications(
  supabase: SupabaseClient,
  options: ListApplicationsOptions = {}
): Promise<{ data: LeadProfile[]; count: number }> {
  let query = supabase
    .from('lead_profiles')
    .select('*, users!inner(name, email, phone)', { count: 'exact' });

  if (options.status) {
    query = query.eq('status', options.status);
  }

  if (options.applicant_category) {
    query = query.eq('applicant_category', options.applicant_category);
  }

  if (!options.includeDeleted) {
    query = query.is('deleted_at', null);
  }

  if (options.search) {
    query = query.or(`application_number.ilike.%${options.search}%,users.name.ilike.%${options.search}%,users.phone.ilike.%${options.search}%`);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(options.offset || 0, (options.offset || 0) + (options.limit || 20) - 1);

  const { data, count, error } = await query;

  if (error) throw error;
  return { data: data || [], count: count || 0 };
}

/**
 * Get deleted applications (admin use)
 */
export async function getDeletedApplications(
  supabase: SupabaseClient
): Promise<Array<LeadProfile & { deletion: ApplicationDeletion }>> {
  const { data, error } = await supabase
    .from('lead_profiles')
    .select('*, application_deletions(*)')
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false });

  if (error) throw error;
  return data || [];
}
