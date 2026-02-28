// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Demo Class Queries
 *
 * Database queries for demo class management
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  DemoClassSlot,
  DemoClassRegistration,
  DemoClassSurvey,
  DemoSlotStatus,
  DemoRegistrationStatus,
  CreateDemoSlotInput,
  CreateDemoRegistrationInput,
  CreateDemoSurveyInput,
  DemoSlotDisplay,
  DemoSlotStats,
} from '../types';

// ============================================
// DEMO SLOT QUERIES
// ============================================

/**
 * Get demo slot by ID
 */
export async function getDemoSlotById(
  slotId: string,
  client?: TypedSupabaseClient
): Promise<DemoClassSlot | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('demo_class_slots')
    .select('*')
    .eq('id', slotId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Get upcoming demo slots for public display (scheduled or confirmed)
 */
export async function getUpcomingDemoSlots(
  options: {
    limit?: number;
    status?: DemoSlotStatus[];
  } = {},
  client?: TypedSupabaseClient
): Promise<DemoSlotDisplay[]> {
  const supabase = client || getSupabaseBrowserClient();
  const { limit = 10, status = ['scheduled', 'confirmed'] } = options;

  let query = supabase
    .from('demo_class_slots')
    .select('*')
    .in('status', status)
    .gte('slot_date', new Date().toLocaleDateString('en-CA'))
    .order('slot_date', { ascending: true })
    .order('slot_time', { ascending: true });

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) throw error;

  // Transform to display format
  return (data || []).map(slot => transformToDisplaySlot(slot));
}

/**
 * Get demo slots by date range (for admin)
 */
export async function getDemoSlotsByDateRange(
  startDate: string,
  endDate: string,
  options: {
    status?: DemoSlotStatus[];
  } = {},
  client?: TypedSupabaseClient
): Promise<DemoClassSlot[]> {
  const supabase = client || getSupabaseAdminClient();

  let query = supabase
    .from('demo_class_slots')
    .select('*')
    .gte('slot_date', startDate)
    .lte('slot_date', endDate)
    .order('slot_date', { ascending: true })
    .order('slot_time', { ascending: true });

  if (options.status && options.status.length > 0) {
    query = query.in('status', options.status);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

/**
 * List all demo slots (for admin)
 */
export async function listDemoSlots(
  options: {
    limit?: number;
    offset?: number;
    status?: DemoSlotStatus[];
    includeCount?: boolean;
  } = {},
  client?: TypedSupabaseClient
): Promise<{ slots: DemoClassSlot[]; count: number | null }> {
  const supabase = client || getSupabaseAdminClient();
  const { limit = 20, offset = 0, status, includeCount = true } = options;

  let query = supabase
    .from('demo_class_slots')
    .select('*', { count: includeCount ? 'exact' : undefined })
    .order('slot_date', { ascending: false })
    .order('slot_time', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && status.length > 0) {
    query = query.in('status', status);
  }

  const { data, error, count } = await query;

  if (error) throw error;
  return { slots: data || [], count };
}

/**
 * Create a new demo slot
 */
export async function createDemoSlot(
  slotData: CreateDemoSlotInput,
  client?: TypedSupabaseClient
): Promise<DemoClassSlot> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('demo_class_slots')
    .insert({
      title: slotData.title || 'Free Demo Class',
      description: slotData.description || null,
      slot_date: slotData.slot_date,
      slot_time: slotData.slot_time,
      duration_minutes: slotData.duration_minutes || 60,
      min_registrations: slotData.min_registrations || 10,
      max_registrations: slotData.max_registrations || 50,
      demo_mode: slotData.demo_mode || 'online',
      instructor_name: slotData.instructor_name || null,
      instructor_id: slotData.instructor_id || null,
      course_id: slotData.course_id || null,
      created_by: slotData.created_by || null,
      status: 'scheduled',
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data as DemoClassSlot;
}

/**
 * Update a demo slot
 */
export async function updateDemoSlot(
  slotId: string,
  updates: Partial<DemoClassSlot>,
  client?: TypedSupabaseClient
): Promise<DemoClassSlot> {
  const supabase = client || getSupabaseAdminClient();

  // Remove fields that shouldn't be updated
  const { id, created_at, updated_at, current_registrations, ...updateData } = updates as any;

  const { data, error } = await supabase
    .from('demo_class_slots')
    .update(updateData)
    .eq('id', slotId)
    .select()
    .single();

  if (error) throw error;
  return data as DemoClassSlot;
}

/**
 * Confirm a demo slot (set meeting link and change status)
 */
export async function confirmDemoSlot(
  slotId: string,
  meetingDetails: {
    meeting_link?: string;
    meeting_password?: string;
    venue_address?: string;
  },
  client?: TypedSupabaseClient
): Promise<DemoClassSlot> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('demo_class_slots')
    .update({
      status: 'confirmed',
      meeting_link: meetingDetails.meeting_link || null,
      meeting_password: meetingDetails.meeting_password || null,
      venue_address: meetingDetails.venue_address || null,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', slotId)
    .select()
    .single();

  if (error) throw error;
  return data as DemoClassSlot;
}

/**
 * Cancel a demo slot
 */
export async function cancelDemoSlot(
  slotId: string,
  reason: string,
  client?: TypedSupabaseClient
): Promise<DemoClassSlot> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('demo_class_slots')
    .update({
      status: 'cancelled',
      cancellation_reason: reason,
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', slotId)
    .select()
    .single();

  if (error) throw error;
  return data as DemoClassSlot;
}

/**
 * Mark a demo slot as conducted
 */
export async function markDemoSlotConducted(
  slotId: string,
  client?: TypedSupabaseClient
): Promise<DemoClassSlot> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('demo_class_slots')
    .update({ status: 'conducted' })
    .eq('id', slotId)
    .select()
    .single();

  if (error) throw error;
  return data as DemoClassSlot;
}

/**
 * Delete a demo slot (only if no registrations)
 */
export async function deleteDemoSlot(
  slotId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  // Check for existing registrations
  const { count } = await supabase
    .from('demo_class_registrations')
    .select('*', { count: 'exact', head: true })
    .eq('slot_id', slotId);

  if (count && count > 0) {
    throw new Error('Cannot delete slot with existing registrations');
  }

  const { error } = await supabase
    .from('demo_class_slots')
    .delete()
    .eq('id', slotId);

  if (error) throw error;
}

// ============================================
// DEMO REGISTRATION QUERIES
// ============================================

/**
 * Get registration by ID
 */
export async function getRegistrationById(
  registrationId: string,
  client?: TypedSupabaseClient
): Promise<DemoClassRegistration | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('demo_class_registrations')
    .select('*')
    .eq('id', registrationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Get registration by phone for a specific slot
 */
export async function getRegistrationByPhone(
  slotId: string,
  phone: string,
  client?: TypedSupabaseClient
): Promise<DemoClassRegistration | null> {
  const supabase = client || getSupabaseBrowserClient();
  const normalizedPhone = phone.replace(/\D/g, '');

  const { data, error } = await supabase
    .from('demo_class_registrations')
    .select('*')
    .eq('slot_id', slotId)
    .eq('phone', normalizedPhone)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Check if a phone number has an active demo registration (pending or approved).
 * Returns the registration with slot details if found, null otherwise.
 */
export async function getActiveRegistrationByPhone(
  phone: string,
  client?: TypedSupabaseClient
): Promise<(DemoClassRegistration & { slot?: DemoClassSlot }) | null> {
  const supabase = client || getSupabaseAdminClient();
  const normalizedPhone = phone.replace(/\D/g, '');

  const { data, error } = await supabase
    .from('demo_class_registrations')
    .select('*, slot:demo_class_slots(*)')
    .eq('phone', normalizedPhone)
    .in('status', ['pending', 'approved'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return data;
}

/**
 * Get all registrations for a slot
 */
export async function getRegistrationsBySlot(
  slotId: string,
  options: {
    status?: DemoRegistrationStatus[];
    limit?: number;
    offset?: number;
  } = {},
  client?: TypedSupabaseClient
): Promise<{ registrations: DemoClassRegistration[]; count: number | null }> {
  const supabase = client || getSupabaseAdminClient();
  const { status, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('demo_class_registrations')
    .select('*', { count: 'exact' })
    .eq('slot_id', slotId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status && status.length > 0) {
    query = query.in('status', status);
  }

  const { data, error, count } = await query;

  if (error) throw error;
  return { registrations: data || [], count };
}

/**
 * Create a new registration
 */
export async function createDemoRegistration(
  registrationData: CreateDemoRegistrationInput,
  client?: TypedSupabaseClient
): Promise<DemoClassRegistration> {
  const supabase = client || getSupabaseAdminClient();

  // Normalize phone number
  const normalizedPhone = registrationData.phone.replace(/\D/g, '');

  const { data, error } = await supabase
    .from('demo_class_registrations')
    .insert({
      slot_id: registrationData.slot_id,
      user_id: registrationData.user_id || null,
      name: registrationData.name,
      email: registrationData.email || null,
      phone: normalizedPhone,
      current_class: registrationData.current_class || null,
      interest_course: registrationData.interest_course || null,
      city: registrationData.city || null,
      utm_source: registrationData.utm_source || null,
      utm_medium: registrationData.utm_medium || null,
      utm_campaign: registrationData.utm_campaign || null,
      referral_code: registrationData.referral_code || null,
      status: 'pending',
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data as DemoClassRegistration;
}

/**
 * Approve a registration
 */
export async function approveRegistration(
  registrationId: string,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<DemoClassRegistration> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('demo_class_registrations')
    .update({
      status: 'approved',
      approved_by: adminId,
      approved_at: new Date().toISOString(),
    })
    .eq('id', registrationId)
    .select()
    .single();

  if (error) throw error;
  return data as DemoClassRegistration;
}

/**
 * Reject a registration
 */
export async function rejectRegistration(
  registrationId: string,
  adminId: string,
  reason: string,
  client?: TypedSupabaseClient
): Promise<DemoClassRegistration> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('demo_class_registrations')
    .update({
      status: 'rejected',
      approved_by: adminId,
      approved_at: new Date().toISOString(),
      rejection_reason: reason,
    })
    .eq('id', registrationId)
    .select()
    .single();

  if (error) throw error;
  return data as DemoClassRegistration;
}

/**
 * Mark attendance for a registration
 */
export async function markAttendance(
  registrationId: string,
  attended: boolean,
  adminId: string,
  client?: TypedSupabaseClient
): Promise<DemoClassRegistration> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('demo_class_registrations')
    .update({
      attended,
      status: attended ? 'attended' : 'no_show',
      attendance_marked_at: new Date().toISOString(),
      attendance_marked_by: adminId,
    })
    .eq('id', registrationId)
    .select()
    .single();

  if (error) throw error;
  return data as DemoClassRegistration;
}

/**
 * Bulk approve registrations
 */
export async function bulkApproveRegistrations(
  registrationIds: string[],
  adminId: string,
  client?: TypedSupabaseClient
): Promise<DemoClassRegistration[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('demo_class_registrations')
    .update({
      status: 'approved',
      approved_by: adminId,
      approved_at: new Date().toISOString(),
    })
    .in('id', registrationIds)
    .select();

  if (error) throw error;
  return data as DemoClassRegistration[];
}

/**
 * Update registration notification status
 */
export async function updateRegistrationNotification(
  registrationId: string,
  notificationType: 'confirmation_email' | 'whatsapp' | 'calendar_invite' | 'reminder_24h' | 'reminder_1h' | 'survey_email',
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const updateData: Record<string, unknown> = {};
  const now = new Date().toISOString();

  switch (notificationType) {
    case 'confirmation_email':
      updateData.confirmation_email_sent = true;
      updateData.confirmation_email_sent_at = now;
      break;
    case 'whatsapp':
      updateData.whatsapp_sent = true;
      updateData.whatsapp_sent_at = now;
      break;
    case 'calendar_invite':
      updateData.calendar_invite_sent = true;
      break;
    case 'reminder_24h':
      updateData.reminder_24h_sent = true;
      break;
    case 'reminder_1h':
      updateData.reminder_1h_sent = true;
      break;
    case 'survey_email':
      updateData.survey_email_sent = true;
      updateData.survey_email_sent_at = now;
      break;
  }

  const { error } = await supabase
    .from('demo_class_registrations')
    .update(updateData)
    .eq('id', registrationId);

  if (error) throw error;
}

// ============================================
// DEMO SURVEY QUERIES
// ============================================

/**
 * Get survey by registration ID
 */
export async function getSurveyByRegistrationId(
  registrationId: string,
  client?: TypedSupabaseClient
): Promise<DemoClassSurvey | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('demo_class_surveys')
    .select('*')
    .eq('registration_id', registrationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Create a survey response
 */
export async function createSurveyResponse(
  surveyData: CreateDemoSurveyInput,
  client?: TypedSupabaseClient
): Promise<DemoClassSurvey> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('demo_class_surveys')
    .insert({
      registration_id: surveyData.registration_id,
      overall_rating: surveyData.overall_rating || null,
      teaching_rating: surveyData.teaching_rating || null,
      nps_score: surveyData.nps_score || null,
      liked_most: surveyData.liked_most || null,
      suggestions: surveyData.suggestions || null,
      enrollment_interest: surveyData.enrollment_interest || null,
      additional_comments: surveyData.additional_comments || null,
      contact_for_followup: surveyData.contact_for_followup !== false,
    } as any)
    .select()
    .single();

  if (error) throw error;

  // Mark survey as completed on the registration
  await supabase
    .from('demo_class_registrations')
    .update({ survey_completed: true })
    .eq('id', surveyData.registration_id);

  return data as DemoClassSurvey;
}

/**
 * Get all surveys for a slot
 */
export async function getSurveysBySlot(
  slotId: string,
  client?: TypedSupabaseClient
): Promise<DemoClassSurvey[]> {
  const supabase = client || getSupabaseAdminClient();

  // First get all registration IDs for this slot
  const { data: registrations, error: regError } = await supabase
    .from('demo_class_registrations')
    .select('id')
    .eq('slot_id', slotId);

  if (regError) throw regError;
  if (!registrations || registrations.length === 0) return [];

  const registrationIds = registrations.map(r => r.id);

  const { data, error } = await supabase
    .from('demo_class_surveys')
    .select('*')
    .in('registration_id', registrationIds)
    .order('submitted_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ============================================
// STATS & ANALYTICS
// ============================================

/**
 * Get stats for a demo slot
 */
export async function getDemoSlotStats(
  slotId: string,
  client?: TypedSupabaseClient
): Promise<DemoSlotStats> {
  const supabase = client || getSupabaseAdminClient();

  // Get registrations by status
  const { data: registrations, error: regError } = await supabase
    .from('demo_class_registrations')
    .select('status, attended')
    .eq('slot_id', slotId);

  if (regError) throw regError;

  const statusCounts = {
    pending: 0,
    approved: 0,
    rejected: 0,
    attended: 0,
    no_show: 0,
  };

  (registrations || []).forEach(reg => {
    if (reg.status in statusCounts) {
      statusCounts[reg.status as keyof typeof statusCounts]++;
    }
  });

  // Get surveys with ratings
  const surveys = await getSurveysBySlot(slotId, supabase);

  let totalOverall = 0, countOverall = 0;
  let totalTeaching = 0, countTeaching = 0;
  let totalNps = 0, countNps = 0;
  const enrollmentBreakdown = { yes: 0, maybe: 0, no: 0 };

  surveys.forEach(survey => {
    if (survey.overall_rating) {
      totalOverall += survey.overall_rating;
      countOverall++;
    }
    if (survey.teaching_rating) {
      totalTeaching += survey.teaching_rating;
      countTeaching++;
    }
    if (survey.nps_score) {
      totalNps += survey.nps_score;
      countNps++;
    }
    if (survey.enrollment_interest && survey.enrollment_interest in enrollmentBreakdown) {
      enrollmentBreakdown[survey.enrollment_interest as keyof typeof enrollmentBreakdown]++;
    }
  });

  return {
    total_registrations: registrations?.length || 0,
    pending_count: statusCounts.pending,
    approved_count: statusCounts.approved,
    rejected_count: statusCounts.rejected,
    attended_count: statusCounts.attended,
    no_show_count: statusCounts.no_show,
    survey_count: surveys.length,
    avg_overall_rating: countOverall > 0 ? totalOverall / countOverall : null,
    avg_teaching_rating: countTeaching > 0 ? totalTeaching / countTeaching : null,
    avg_nps_score: countNps > 0 ? totalNps / countNps : null,
    enrollment_interest_breakdown: enrollmentBreakdown,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get next N Sundays for slot selection
 */
export function getNextSundays(count: number = 4): { date: string; displayDate: string }[] {
  const sundays: { date: string; displayDate: string }[] = [];
  const today = new Date();

  // Find next Sunday
  const dayOfWeek = today.getDay();
  const daysUntilSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const nextSunday = new Date(today);
  nextSunday.setDate(today.getDate() + daysUntilSunday);

  for (let i = 0; i < count; i++) {
    const sunday = new Date(nextSunday);
    sunday.setDate(nextSunday.getDate() + i * 7);

    const dateStr = sunday.toISOString().split('T')[0];
    const displayDate = sunday.toLocaleDateString('en-IN', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });

    sundays.push({ date: dateStr, displayDate });
  }

  return sundays;
}

/**
 * Transform slot to display format
 */
function transformToDisplaySlot(slot: DemoClassSlot): DemoSlotDisplay {
  const date = new Date(`${slot.slot_date}T${slot.slot_time}`);
  const spotsLeft = slot.max_registrations - slot.current_registrations;
  const totalSpots = slot.max_registrations;

  return {
    ...slot,
    display_date: date.toLocaleDateString('en-IN', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    }),
    display_time: date.toLocaleTimeString('en-IN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    spots_left: spotsLeft,
    is_filling: spotsLeft < totalSpots * 0.2, // Less than 20% spots left
    is_full: spotsLeft <= 0,
  };
}

/**
 * Format time for display (24h to 12h)
 */
export function formatTimeForDisplay(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
}
