// @ts-nocheck
/**
 * Neram Classes - Refund Request Queries
 *
 * Database queries for the refund request system.
 * Rules: 24-hour window, 30% deduction (covers digital platform subscriptions/tool licenses), admin discretion, one request per payment.
 */

import { getSupabaseAdminClient } from '../client';
import type {
  RefundRequest,
  RefundRequestStatus,
  CreateRefundRequestInput,
  Payment,
} from '../types';
import { REFUND_PROCESSING_FEE_PERCENT, REFUND_WINDOW_HOURS } from '../types';

// ============================================
// UTILITIES
// ============================================

/**
 * Check if the current time is within the refund window (24 hours from payment).
 */
export function isWithinRefundWindow(paidAt: string): boolean {
  const paidTime = new Date(paidAt).getTime();
  const now = Date.now();
  const windowMs = REFUND_WINDOW_HOURS * 60 * 60 * 1000;
  return now - paidTime <= windowMs;
}

/**
 * Calculate the refund amount (70%) and subscription/setup cost deduction (30%).
 */
export function calculateRefundAmount(paymentAmount: number): {
  refundAmount: number;
  processingFee: number;
} {
  const processingFee = Math.round((paymentAmount * REFUND_PROCESSING_FEE_PERCENT) / 100);
  const refundAmount = paymentAmount - processingFee;
  return { refundAmount, processingFee };
}

// ============================================
// CREATE
// ============================================

/**
 * Create a refund request. Validates:
 * 1. Payment exists and is paid
 * 2. Within 24-hour window
 * 3. No existing refund request for this payment
 */
export async function createRefundRequest(
  userId: string,
  input: CreateRefundRequestInput,
  client?: any
): Promise<RefundRequest> {
  const supabase = client || getSupabaseAdminClient();

  // Fetch the payment
  const { data: payment, error: paymentError } = await supabase
    .from('payments')
    .select('*')
    .eq('id', input.payment_id)
    .eq('user_id', userId)
    .single();

  if (paymentError || !payment) {
    throw new Error('Payment not found or does not belong to this user');
  }

  if (payment.status !== 'paid') {
    throw new Error('Refund can only be requested for completed payments');
  }

  if (!payment.paid_at) {
    throw new Error('Payment completion time not recorded');
  }

  // Check 24-hour window
  if (!isWithinRefundWindow(payment.paid_at)) {
    throw new Error('Refund window has expired. Requests must be made within 24 hours of payment.');
  }

  // Check for existing request
  const { data: existing } = await supabase
    .from('refund_requests')
    .select('id')
    .eq('payment_id', input.payment_id)
    .maybeSingle();

  if (existing) {
    throw new Error('A refund request already exists for this payment');
  }

  // Calculate amounts
  const { refundAmount, processingFee } = calculateRefundAmount(Number(payment.amount));

  // Create the request
  const { data, error } = await supabase
    .from('refund_requests')
    .insert({
      payment_id: input.payment_id,
      user_id: userId,
      lead_profile_id: payment.lead_profile_id || null,
      payment_amount: Number(payment.amount),
      refund_amount: refundAmount,
      processing_fee: processingFee,
      reason_for_joining: input.reason_for_joining,
      reason_for_discontinuing: input.reason_for_discontinuing,
      additional_notes: input.additional_notes || null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data as RefundRequest;
}

// ============================================
// READ
// ============================================

/**
 * Get refund request by payment ID (check if one exists).
 */
export async function getRefundRequestByPaymentId(
  paymentId: string,
  client?: any
): Promise<RefundRequest | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('refund_requests')
    .select('*')
    .eq('payment_id', paymentId)
    .maybeSingle();

  if (error) throw error;
  return data as RefundRequest | null;
}

/**
 * Get refund request by ID.
 */
export async function getRefundRequestById(
  id: string,
  client?: any
): Promise<RefundRequest | null> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('refund_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data as RefundRequest | null;
}

/**
 * List refund requests for a user.
 */
export async function listRefundRequestsByUser(
  userId: string,
  options: { limit?: number; offset?: number } = {},
  client?: any
): Promise<{ requests: RefundRequest[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { limit = 20, offset = 0 } = options;

  const { data, error, count } = await supabase
    .from('refund_requests')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return {
    requests: (data || []) as RefundRequest[],
    count: count || 0,
  };
}

/**
 * List all refund requests (admin). Supports filtering by status.
 */
export async function listRefundRequests(
  options: {
    status?: RefundRequestStatus;
    limit?: number;
    offset?: number;
  } = {},
  client?: any
): Promise<{ requests: RefundRequest[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();
  const { status, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('refund_requests')
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
    requests: (data || []) as RefundRequest[],
    count: count || 0,
  };
}

/**
 * List refund requests for a specific lead profile (used in admin CRM detail).
 */
export async function listRefundRequestsByLeadProfile(
  leadProfileId: string,
  client?: any
): Promise<RefundRequest[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('refund_requests')
    .select('*')
    .eq('lead_profile_id', leadProfileId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as RefundRequest[];
}

// ============================================
// UPDATE (Admin actions)
// ============================================

/**
 * Approve or reject a refund request (admin only).
 * On approval, also updates the payment status to 'refunded'.
 */
export async function updateRefundRequestStatus(
  requestId: string,
  status: 'approved' | 'rejected',
  adminId: string,
  adminNotes?: string,
  client?: any
): Promise<RefundRequest> {
  const supabase = client || getSupabaseAdminClient();

  // Update refund request
  const { data, error } = await supabase
    .from('refund_requests')
    .update({
      status,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      admin_notes: adminNotes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select()
    .single();

  if (error) throw error;

  const refundRequest = data as RefundRequest;

  // If approved, mark the payment as refunded
  if (status === 'approved') {
    const { error: paymentError } = await supabase
      .from('payments')
      .update({
        status: 'refunded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', refundRequest.payment_id);

    if (paymentError) {
      console.error('Failed to update payment status to refunded:', paymentError);
    }
  }

  return refundRequest;
}
