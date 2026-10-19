/**
 * Neram Classes - Direct Enrollment Link Queries
 *
 * Database operations for admin-generated direct enrollment links
 */

import { SupabaseClient } from '@supabase/supabase-js';
import type {
  DirectEnrollmentLink,
  DirectEnrollmentLinkEvent,
  DirectEnrollmentLinkEventKind,
  DirectEnrollmentLinkStatus,
  DirectEnrollmentPaymentScheme,
  CourseType,
  LearningMode,
} from '../types';

// ============================================
// TYPES
// ============================================

export interface CreateDirectEnrollmentLinkInput {
  token: string;
  created_by: string;
  student_name: string;
  student_phone?: string;
  student_email?: string;
  course_id?: string;
  batch_id?: string;
  center_id?: string;
  interest_course: CourseType;
  learning_mode?: LearningMode;
  total_fee: number;
  discount_amount?: number;
  final_fee: number;
  amount_paid: number;
  payment_method: string;
  transaction_reference?: string;
  payment_date?: string;
  admin_notes?: string;
  payment_proof_url?: string;
  expires_at?: string;
  user_id?: string;
  demo_registration_id?: string;
  payment_scheme?: DirectEnrollmentPaymentScheme;
  installment_2_amount?: number | null;
  installment_2_due_date?: string | null;
  payment_mode?: 'recorded' | 'student_pays';
  fee_structure_id?: string | null;
  offer_full_amount?: number | null;
  offer_installment_1?: number | null;
  offer_installment_2?: number | null;
  offer_balance_due_days?: number | null;
}

export interface UpdateDirectEnrollmentLinkInput {
  status?: DirectEnrollmentLinkStatus;
  used_by?: string;
  used_at?: string;
  lead_profile_id?: string;
  student_profile_id?: string;
  admin_notes?: string;
  regenerated_from?: string;
  regenerated_to?: string;
  // Payment fields (student-provided during enrollment)
  payment_method?: string;
  payment_date?: string;
  transaction_reference?: string;
  payment_proof_url?: string;
  verified_by?: string;
  verified_at?: string;
}

/** What staff can change on a link that has not been used yet. */
export type EditDirectEnrollmentLinkInput = Partial<
  Omit<CreateDirectEnrollmentLinkInput, 'token' | 'created_by' | 'user_id' | 'demo_registration_id' | 'expires_at'>
>;

export interface ListDirectEnrollmentLinksFilters {
  status?: DirectEnrollmentLinkStatus;
  created_by?: string;
  user_id?: string;
  demo_registration_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

// ============================================
// QUERIES
// ============================================

/**
 * Create a new direct enrollment link
 */
export async function createDirectEnrollmentLink(
  data: CreateDirectEnrollmentLinkInput,
  supabase: SupabaseClient
): Promise<DirectEnrollmentLink> {
  const { data: link, error } = await supabase
    .from('direct_enrollment_links')
    .insert({
      token: data.token,
      created_by: data.created_by,
      student_name: data.student_name,
      student_phone: data.student_phone || null,
      student_email: data.student_email || null,
      course_id: data.course_id || null,
      batch_id: data.batch_id || null,
      center_id: data.center_id || null,
      interest_course: data.interest_course,
      learning_mode: data.learning_mode || 'hybrid',
      total_fee: data.total_fee,
      discount_amount: data.discount_amount || 0,
      final_fee: data.final_fee,
      amount_paid: data.amount_paid,
      payment_method: data.payment_method,
      transaction_reference: data.transaction_reference || null,
      payment_date: data.payment_date || null,
      admin_notes: data.admin_notes || null,
      payment_proof_url: data.payment_proof_url || null,
      user_id: data.user_id || null,
      demo_registration_id: data.demo_registration_id || null,
      payment_scheme: data.payment_scheme || 'full',
      installment_2_amount: data.installment_2_amount ?? null,
      installment_2_due_date: data.installment_2_due_date || null,
      // Student pays (migration 20261213090000); a recorded link leaves these empty.
      payment_mode: data.payment_mode || 'recorded',
      fee_structure_id: data.fee_structure_id || null,
      offer_full_amount: data.offer_full_amount ?? null,
      offer_installment_1: data.offer_installment_1 ?? null,
      offer_installment_2: data.offer_installment_2 ?? null,
      offer_balance_due_days: data.offer_balance_due_days ?? null,
      expires_at: data.expires_at || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return link;
}

/**
 * Get a direct enrollment link by its unique token
 */
export async function getDirectEnrollmentLinkByToken(
  token: string,
  supabase: SupabaseClient
): Promise<DirectEnrollmentLink | null> {
  const { data, error } = await supabase
    .from('direct_enrollment_links')
    .select('*')
    .eq('token', token)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw error;
  }
  return data;
}

/**
 * Get a direct enrollment link by ID
 */
export async function getDirectEnrollmentLinkById(
  id: string,
  supabase: SupabaseClient
): Promise<DirectEnrollmentLink | null> {
  const { data, error } = await supabase
    .from('direct_enrollment_links')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data;
}

/**
 * List direct enrollment links with filtering and pagination
 */
export async function listDirectEnrollmentLinks(
  filters: ListDirectEnrollmentLinksFilters,
  supabase: SupabaseClient
): Promise<{ data: DirectEnrollmentLink[]; total: number }> {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;

  let query = supabase
    .from('direct_enrollment_links')
    .select('*', { count: 'exact' });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.created_by) {
    query = query.eq('created_by', filters.created_by);
  }

  if (filters.user_id) {
    query = query.eq('user_id', filters.user_id);
  }

  if (filters.demo_registration_id) {
    query = query.eq('demo_registration_id', filters.demo_registration_id);
  }

  if (filters.search) {
    query = query.or(
      `student_name.ilike.%${filters.search}%,student_phone.ilike.%${filters.search}%,student_email.ilike.%${filters.search}%,token.ilike.%${filters.search}%`
    );
  }

  // When no status filter, sort by status (active first, used last) then by date
  // Alphabetical ascending: active < cancelled < expired < used — gives desired priority
  if (!filters.status) {
    query = query
      .order('status', { ascending: true })
      .order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const { data, error, count } = await query
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return { data: data || [], total: count || 0 };
}

/**
 * Update a direct enrollment link
 */
export async function updateDirectEnrollmentLink(
  id: string,
  data: UpdateDirectEnrollmentLinkInput,
  supabase: SupabaseClient
): Promise<DirectEnrollmentLink> {
  const { data: link, error } = await supabase
    .from('direct_enrollment_links')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return link;
}

/**
 * Expire links that have passed their expires_at timestamp
 */
export async function expireOldDirectEnrollmentLinks(
  supabase: SupabaseClient
): Promise<number> {
  const { data, error } = await supabase
    .from('direct_enrollment_links')
    .update({ status: 'expired' as DirectEnrollmentLinkStatus })
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) throw error;
  return data?.length || 0;
}

/**
 * Delete a direct enrollment link permanently.
 * Clears self-referencing FK columns (regenerated_from/regenerated_to) first.
 */
export async function deleteDirectEnrollmentLink(
  id: string,
  supabase: SupabaseClient
): Promise<void> {
  // Clear regenerated_from on any link that was regenerated FROM this one
  await supabase
    .from('direct_enrollment_links')
    .update({ regenerated_from: null })
    .eq('regenerated_from', id);

  // Clear regenerated_to on any link that was regenerated TO this one
  await supabase
    .from('direct_enrollment_links')
    .update({ regenerated_to: null })
    .eq('regenerated_to', id);

  const { error } = await supabase
    .from('direct_enrollment_links')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Regenerate a direct enrollment link: cancel old, create new with same data
 */
export async function regenerateDirectEnrollmentLink(
  oldLinkId: string,
  newToken: string,
  adminId: string,
  supabase: SupabaseClient
): Promise<DirectEnrollmentLink> {
  // 1. Fetch old link
  const oldLink = await getDirectEnrollmentLinkById(oldLinkId, supabase);
  if (!oldLink) throw new Error('Link not found');
  if (oldLink.status === 'used') throw new Error('Cannot regenerate a used link');

  // 2. Cancel old link and set regenerated_to (will be updated after new link is created)
  const cancelNotes = oldLink.admin_notes
    ? `${oldLink.admin_notes}\n[System] Regenerated by admin`
    : '[System] Regenerated by admin';

  await supabase
    .from('direct_enrollment_links')
    .update({ status: 'cancelled', admin_notes: cancelNotes })
    .eq('id', oldLinkId);

  // 3. Create new link with same data
  const { data: newLink, error } = await supabase
    .from('direct_enrollment_links')
    .insert({
      token: newToken,
      created_by: adminId,
      student_name: oldLink.student_name,
      student_phone: oldLink.student_phone,
      student_email: oldLink.student_email,
      course_id: oldLink.course_id,
      batch_id: oldLink.batch_id,
      center_id: oldLink.center_id,
      interest_course: oldLink.interest_course,
      learning_mode: oldLink.learning_mode,
      total_fee: oldLink.total_fee,
      discount_amount: oldLink.discount_amount,
      final_fee: oldLink.final_fee,
      amount_paid: oldLink.amount_paid,
      payment_method: oldLink.payment_method,
      transaction_reference: oldLink.transaction_reference,
      payment_date: oldLink.payment_date,
      admin_notes: oldLink.admin_notes,
      payment_proof_url: oldLink.payment_proof_url,
      user_id: oldLink.user_id,
      demo_registration_id: oldLink.demo_registration_id,
      parent_phone: oldLink.parent_phone,
      payment_scheme: oldLink.payment_scheme || 'full',
      installment_2_amount: oldLink.installment_2_amount,
      installment_2_due_date: oldLink.installment_2_due_date,
      regenerated_from: oldLinkId,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  // 4. Update old link to point to new one
  await supabase
    .from('direct_enrollment_links')
    .update({ regenerated_to: newLink.id })
    .eq('id', oldLinkId);

  return newLink;
}

/**
 * Get an active enrollment link matching a user's email
 */
export async function getActiveEnrollmentLinkForUser(
  email: string,
  supabase: SupabaseClient
): Promise<DirectEnrollmentLink | null> {
  const { data, error } = await supabase
    .from('direct_enrollment_links')
    .select('*')
    .eq('status', 'active')
    .eq('student_email', email)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// ============================================
// ONE LINK PER STUDENT, EDITS AND SHARING
// ============================================

/** The last 10 digits of a phone number, for matching "+91 96560 77577" to "9656077577". */
export function phoneTail(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/**
 * The student's active, unexpired link, if staff already made one: matched by
 * account first, then by phone (links made on Direct Enroll carry no account).
 */
export async function findActiveLinkForStudent(
  who: { userId?: string | null; phone?: string | null; excludeId?: string | null },
  supabase: SupabaseClient
): Promise<DirectEnrollmentLink | null> {
  const now = new Date().toISOString();
  const pick = async (column: 'user_id' | 'student_phone', value: string, like: boolean) => {
    let q = supabase
      .from('direct_enrollment_links')
      .select('*')
      .eq('status', 'active')
      .gt('expires_at', now);
    q = like ? q.ilike(column, `%${value}`) : q.eq(column, value);
    if (who.excludeId) q = q.neq('id', who.excludeId);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data as DirectEnrollmentLink | null;
  };

  if (who.userId) {
    const byUser = await pick('user_id', who.userId, false);
    if (byUser) return byUser;
  }
  const tail = phoneTail(who.phone);
  return tail ? pick('student_phone', tail, true) : null;
}

/** Change an unused link in place. The token, and so the URL already sent, stays. */
export async function editDirectEnrollmentLink(
  id: string,
  data: EditDirectEnrollmentLinkInput,
  supabase: SupabaseClient
): Promise<DirectEnrollmentLink> {
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) patch[key] = value === '' ? null : value;
  }
  // An edit is a fresh start for the student: a full week from now.
  patch.expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: link, error } = await supabase
    .from('direct_enrollment_links')
    .update(patch)
    .eq('id', id)
    .eq('status', 'active')
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!link) throw new Error('This link is no longer active, so it cannot be changed.');
  return link;
}

export async function logDirectEnrollmentLinkEvent(
  linkId: string,
  kind: DirectEnrollmentLinkEventKind,
  actorId: string | null,
  meta: Record<string, unknown>,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('direct_enrollment_link_events')
    .insert({ link_id: linkId, kind, actor_id: actorId, meta });
  if (error) console.error('direct_enrollment_link_events insert failed', error.message);
}

export interface DirectEnrollmentLinkEventWithActor extends DirectEnrollmentLinkEvent {
  actor_name: string | null;
}

export async function listDirectEnrollmentLinkEvents(
  linkId: string,
  supabase: SupabaseClient
): Promise<DirectEnrollmentLinkEventWithActor[]> {
  const { data, error } = await supabase
    .from('direct_enrollment_link_events')
    .select('*, actor:users!direct_enrollment_link_events_actor_id_fkey(name)')
    .eq('link_id', linkId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data || []).map((row: any) => {
    const { actor, ...rest } = row;
    return { ...rest, actor_name: actor?.name ?? null };
  });
}

/** Count a share and remember when it happened. */
export async function markDirectEnrollmentLinkShared(
  link: Pick<DirectEnrollmentLink, 'id' | 'share_count'>,
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .from('direct_enrollment_links')
    .update({ share_count: (link.share_count || 0) + 1, last_shared_at: new Date().toISOString() })
    .eq('id', link.id);
  if (error) throw error;
}
