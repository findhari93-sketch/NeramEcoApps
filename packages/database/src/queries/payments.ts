// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Payment Queries
 *
 * Database queries for payments
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { Payment, PaymentStatus } from '../types';

// ============================================
// PAYMENT QUERIES
// ============================================

/**
 * Get payment by ID
 */
export async function getPaymentById(
  paymentId: string,
  client?: TypedSupabaseClient
): Promise<Payment | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', paymentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Get payment by Razorpay payment ID
 */
export async function getPaymentByRazorpayId(
  razorpayPaymentId: string,
  client?: TypedSupabaseClient
): Promise<Payment | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('razorpay_payment_id', razorpayPaymentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Get payment by receipt number
 */
export async function getPaymentByReceiptNumber(
  receiptNumber: string,
  client?: TypedSupabaseClient
): Promise<Payment | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('receipt_number', receiptNumber)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

// ============================================
// LIST QUERIES
// ============================================

export interface ListPaymentsOptions {
  userId?: string;
  studentProfileId?: string;
  leadProfileId?: string;
  status?: PaymentStatus;
  paymentMethod?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
  orderBy?: keyof Payment;
  orderDirection?: 'asc' | 'desc';
}

/**
 * List payments with filters
 */
export async function listPayments(
  options: ListPaymentsOptions = {},
  client?: TypedSupabaseClient
): Promise<{ payments: Payment[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();

  const {
    userId,
    studentProfileId,
    leadProfileId,
    status,
    paymentMethod,
    startDate,
    endDate,
    limit = 20,
    offset = 0,
    orderBy = 'created_at',
    orderDirection = 'desc',
  } = options;

  let query = supabase
    .from('payments')
    .select('*', { count: 'exact' });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  if (studentProfileId) {
    query = query.eq('student_profile_id', studentProfileId);
  }

  if (leadProfileId) {
    query = query.eq('lead_profile_id', leadProfileId);
  }

  if (status) {
    query = query.eq('status', status);
  }

  if (paymentMethod) {
    query = query.eq('payment_method', paymentMethod);
  }

  if (startDate) {
    query = query.gte('created_at', startDate);
  }

  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  query = query
    .order(orderBy, { ascending: orderDirection === 'asc' })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    payments: data || [],
    count: count || 0,
  };
}

/**
 * List user payments
 */
export async function listUserPayments(
  userId: string,
  options: Omit<ListPaymentsOptions, 'userId'> = {},
  client?: TypedSupabaseClient
): Promise<{ payments: Payment[]; count: number }> {
  return listPayments({ ...options, userId }, client);
}

/**
 * List pending payments
 */
export async function listPendingPayments(
  options: Omit<ListPaymentsOptions, 'status'> = {},
  client?: TypedSupabaseClient
): Promise<{ payments: Payment[]; count: number }> {
  return listPayments({ ...options, status: 'pending' }, client);
}

/**
 * List payments awaiting screenshot verification
 */
export async function listPaymentsForVerification(
  client?: TypedSupabaseClient
): Promise<Payment[]> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('payment_method', 'upi_screenshot')
    .eq('screenshot_verified', false)
    .not('screenshot_url', 'is', null)
    .order('created_at', { ascending: true });

  if (error) throw error;

  return data || [];
}

// ============================================
// WRITE OPERATIONS
// ============================================

/**
 * Create a new payment
 */
export async function createPayment(
  paymentData: Omit<Payment, 'id' | 'created_at' | 'updated_at'>,
  client?: TypedSupabaseClient
): Promise<Payment> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('payments')
    .insert(paymentData)
    .select()
    .single();

  if (error) throw error;
  return data as Payment;
}

/**
 * Update payment
 */
export async function updatePayment(
  paymentId: string,
  updates: Partial<Omit<Payment, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<Payment> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await (supabase as any)
    .from('payments')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', paymentId)
    .select()
    .single();

  if (error) throw error;
  return data as Payment;
}

/**
 * Update payment status
 */
export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentStatus,
  metadata?: Record<string, unknown>,
  client?: TypedSupabaseClient
): Promise<Payment> {
  const updates: Partial<Payment> = { status };

  if (status === 'paid') {
    updates.paid_at = new Date().toISOString();
  }

  if (metadata) {
    updates.metadata = metadata;
  }

  return updatePayment(paymentId, updates, client);
}

/**
 * Verify screenshot payment
 */
export async function verifyScreenshotPayment(
  paymentId: string,
  verifiedBy: string,
  approved: boolean,
  notes?: string,
  client?: TypedSupabaseClient
): Promise<Payment> {
  const updates: Partial<Payment> = {
    screenshot_verified: true,
    verified_by: verifiedBy,
    verified_at: new Date().toISOString(),
    verification_notes: notes || null,
    status: approved ? 'paid' : 'failed',
  };

  if (approved) {
    updates.paid_at = new Date().toISOString();
  } else {
    updates.failure_reason = notes || 'Payment verification failed';
  }

  return updatePayment(paymentId, updates, client);
}

/**
 * Record Razorpay payment success
 */
export async function recordRazorpaySuccess(
  paymentId: string,
  razorpayData: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  },
  client?: TypedSupabaseClient
): Promise<Payment> {
  return updatePayment(paymentId, {
    razorpay_payment_id: razorpayData.razorpay_payment_id,
    razorpay_order_id: razorpayData.razorpay_order_id,
    razorpay_signature: razorpayData.razorpay_signature,
    status: 'paid',
    paid_at: new Date().toISOString(),
  }, client);
}

/**
 * Record Razorpay payment failure
 */
export async function recordRazorpayFailure(
  paymentId: string,
  errorCode: string,
  errorReason: string,
  client?: TypedSupabaseClient
): Promise<Payment> {
  return updatePayment(paymentId, {
    status: 'failed',
    failure_code: errorCode,
    failure_reason: errorReason,
  }, client);
}

// ============================================
// STATISTICS
// ============================================

export interface PaymentStats {
  totalRevenue: number;
  pendingAmount: number;
  paidCount: number;
  pendingCount: number;
  failedCount: number;
}

/**
 * Get payment statistics
 */
export async function getPaymentStats(
  options: { startDate?: string; endDate?: string } = {},
  client?: TypedSupabaseClient
): Promise<PaymentStats> {
  const supabase = client || getSupabaseAdminClient();

  const { startDate, endDate } = options;

  let query = supabase
    .from('payments')
    .select('amount, status');

  if (startDate) {
    query = query.gte('created_at', startDate);
  }

  if (endDate) {
    query = query.lte('created_at', endDate);
  }

  const { data, error } = await query;

  if (error) throw error;

  const payments = (data || []) as { amount: number; status: PaymentStatus }[];

  const stats: PaymentStats = {
    totalRevenue: 0,
    pendingAmount: 0,
    paidCount: 0,
    pendingCount: 0,
    failedCount: 0,
  };

  for (const payment of payments) {
    if (payment.status === 'paid') {
      stats.totalRevenue += payment.amount;
      stats.paidCount++;
    } else if (payment.status === 'pending') {
      stats.pendingAmount += payment.amount;
      stats.pendingCount++;
    } else if (payment.status === 'failed') {
      stats.failedCount++;
    }
  }

  return stats;
}

/**
 * Get monthly revenue statistics
 */
export async function getMonthlyRevenue(
  year: number,
  month: number,
  client?: TypedSupabaseClient
): Promise<number> {
  const startDate = new Date(year, month - 1, 1).toISOString();
  const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

  const stats = await getPaymentStats({ startDate, endDate }, client);
  return stats.totalRevenue;
}
