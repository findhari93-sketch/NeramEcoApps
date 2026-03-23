// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Device Swap Request Queries
 *
 * Students request to swap a registered device; admins approve/reject.
 * On approval, the old device is deregistered and the slot is freed.
 */

import { getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type {
  DeviceSwapRequest,
  DeviceSwapRequestWithUser,
  DeviceCategory,
} from '../types';
import { deregisterDevice } from './device-registration';
import { createUserNotification } from './user-notifications';

// ============================================
// STUDENT-FACING
// ============================================

/**
 * Create a device swap request.
 * Validates: no duplicate pending request for same category.
 */
export async function createDeviceSwapRequest(
  client: TypedSupabaseClient,
  userId: string,
  deviceCategory: DeviceCategory,
  reason: string
): Promise<{ request: DeviceSwapRequest | null; error: string | null }> {
  // Check for existing pending request for this category
  const { data: existing } = await client
    .from('device_swap_requests')
    .select('id')
    .eq('user_id', userId)
    .eq('device_category', deviceCategory)
    .eq('status', 'pending')
    .single();

  if (existing) {
    return { request: null, error: 'You already have a pending swap request for this device category.' };
  }

  // Verify the user actually has a device in this category
  const { data: device } = await client
    .from('student_registered_devices')
    .select('id')
    .eq('user_id', userId)
    .eq('device_category', deviceCategory)
    .eq('is_active', true)
    .single();

  if (!device) {
    return { request: null, error: 'No registered device found for this category.' };
  }

  const { data: request, error } = await client
    .from('device_swap_requests')
    .insert({
      user_id: userId,
      device_category: deviceCategory,
      reason,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create swap request:', error);
    return { request: null, error: 'Failed to create swap request.' };
  }

  return { request, error: null };
}

/**
 * Get swap requests for a specific user (student view)
 */
export async function getUserSwapRequests(
  client: TypedSupabaseClient,
  userId: string
): Promise<DeviceSwapRequest[]> {
  const { data, error } = await client
    .from('device_swap_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Failed to get user swap requests:', error);
    return [];
  }
  return data || [];
}

// ============================================
// ADMIN-FACING
// ============================================

/**
 * List all swap requests with user details (for admin)
 */
export async function getDeviceSwapRequests(
  options: { status?: string; limit?: number; offset?: number } = {}
): Promise<{ data: DeviceSwapRequestWithUser[]; total: number }> {
  const { status, limit = 50, offset = 0 } = options;
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from('device_swap_requests')
    .select(
      `
      *,
      user:users!device_swap_requests_user_id_fkey(name, email, avatar_url)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (status) {
    query = query.eq('status', status);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error('Failed to get swap requests:', error);
    return { data: [], total: 0 };
  }

  const mapped: DeviceSwapRequestWithUser[] = (data || []).map((r: any) => ({
    id: r.id,
    user_id: r.user_id,
    device_category: r.device_category,
    reason: r.reason,
    status: r.status,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
    admin_notes: r.admin_notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
    user_name: r.user?.name || 'Unknown',
    user_email: r.user?.email || null,
    user_avatar: r.user?.avatar_url || null,
  }));

  return { data: mapped, total: count || 0 };
}

/**
 * Approve a device swap request.
 * Deregisters the old device and notifies the student.
 */
export async function approveDeviceSwapRequest(
  requestId: string,
  adminId: string,
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdminClient();

  // Get the request
  const { data: request, error: fetchErr } = await supabase
    .from('device_swap_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchErr || !request) {
    return { success: false, error: 'Request not found.' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Request has already been processed.' };
  }

  // Find and deregister the old device
  const { data: oldDevice } = await supabase
    .from('student_registered_devices')
    .select('id')
    .eq('user_id', request.user_id)
    .eq('device_category', request.device_category)
    .eq('is_active', true)
    .single();

  if (oldDevice) {
    await deregisterDevice(supabase, oldDevice.id, request.user_id);
  }

  // Update request status
  const { error: updateErr } = await supabase
    .from('device_swap_requests')
    .update({
      status: 'approved',
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      admin_notes: adminNotes || null,
    })
    .eq('id', requestId);

  if (updateErr) {
    console.error('Failed to update swap request:', updateErr);
    return { success: false, error: 'Failed to update request.' };
  }

  // Notify student
  try {
    const categoryLabel = request.device_category === 'desktop' ? 'laptop/desktop' : 'mobile phone';
    await createUserNotification({
      user_id: request.user_id,
      event_type: 'device_swap_approved',
      title: 'Device Change Approved',
      message: `Your ${categoryLabel} change request has been approved. Your new device will be registered when you log in next.`,
      metadata: { request_id: requestId, device_category: request.device_category },
    });
  } catch {
    // Notification failure should not block approval
  }

  return { success: true };
}

/**
 * Reject a device swap request and notify the student.
 */
export async function rejectDeviceSwapRequest(
  requestId: string,
  adminId: string,
  adminNotes?: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdminClient();

  // Get the request
  const { data: request, error: fetchErr } = await supabase
    .from('device_swap_requests')
    .select('*')
    .eq('id', requestId)
    .single();

  if (fetchErr || !request) {
    return { success: false, error: 'Request not found.' };
  }

  if (request.status !== 'pending') {
    return { success: false, error: 'Request has already been processed.' };
  }

  // Update request status
  const { error: updateErr } = await supabase
    .from('device_swap_requests')
    .update({
      status: 'rejected',
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      admin_notes: adminNotes || null,
    })
    .eq('id', requestId);

  if (updateErr) {
    console.error('Failed to update swap request:', updateErr);
    return { success: false, error: 'Failed to update request.' };
  }

  // Notify student
  try {
    const categoryLabel = request.device_category === 'desktop' ? 'laptop/desktop' : 'mobile phone';
    await createUserNotification({
      user_id: request.user_id,
      event_type: 'device_swap_rejected',
      title: 'Device Change Rejected',
      message: `Your ${categoryLabel} change request was not approved.${adminNotes ? ` Reason: ${adminNotes}` : ''}`,
      metadata: { request_id: requestId, device_category: request.device_category },
    });
  } catch {
    // Notification failure should not block rejection
  }

  return { success: true };
}

/**
 * Get count of pending swap requests (for admin badge)
 */
export async function getPendingSwapRequestCount(): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { count } = await supabase
    .from('device_swap_requests')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  return count || 0;
}
