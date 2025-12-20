// @ts-nocheck - Supabase types not generated
/**
 * Neram Classes - Coupon Queries
 *
 * Database queries for discount coupons
 */

import { getSupabaseBrowserClient, getSupabaseAdminClient, TypedSupabaseClient } from '../client';
import type { CourseType } from '../types';

// ============================================
// TYPES
// ============================================

export interface Coupon {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  valid_from: string;
  valid_until: string | null;
  max_uses: number | null;
  used_count: number;
  applicable_courses: CourseType[] | null;
  min_amount: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CouponValidationResult {
  valid: boolean;
  error?: string;
  discountAmount?: number;
  coupon?: Coupon;
}

// ============================================
// COUPON QUERIES
// ============================================

/**
 * Get coupon by ID
 */
export async function getCouponById(
  couponId: string,
  client?: TypedSupabaseClient
): Promise<Coupon | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('id', couponId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

/**
 * Get coupon by code
 */
export async function getCouponByCode(
  code: string,
  client?: TypedSupabaseClient
): Promise<Coupon | null> {
  const supabase = client || getSupabaseBrowserClient();

  const { data, error } = await supabase
    .from('coupons')
    .select('*')
    .eq('code', code.toUpperCase())
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  return data;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate a coupon code
 */
export async function validateCoupon(
  code: string,
  amount: number,
  courseType?: CourseType,
  client?: TypedSupabaseClient
): Promise<CouponValidationResult> {
  const coupon = await getCouponByCode(code, client);

  if (!coupon) {
    return { valid: false, error: 'Invalid coupon code' };
  }

  // Check if active
  if (!coupon.is_active) {
    return { valid: false, error: 'This coupon is no longer active' };
  }

  // Check validity period
  const now = new Date();
  const validFrom = new Date(coupon.valid_from);
  if (now < validFrom) {
    return { valid: false, error: 'This coupon is not yet valid' };
  }

  if (coupon.valid_until) {
    const validUntil = new Date(coupon.valid_until);
    if (now > validUntil) {
      return { valid: false, error: 'This coupon has expired' };
    }
  }

  // Check usage limit
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return { valid: false, error: 'This coupon has reached its usage limit' };
  }

  // Check minimum amount
  if (coupon.min_amount !== null && amount < coupon.min_amount) {
    return {
      valid: false,
      error: `Minimum order amount of ₹${coupon.min_amount} required`,
    };
  }

  // Check applicable courses
  if (courseType && coupon.applicable_courses !== null) {
    if (!coupon.applicable_courses.includes(courseType)) {
      return {
        valid: false,
        error: 'This coupon is not applicable for the selected course',
      };
    }
  }

  // Calculate discount
  let discountAmount: number;
  if (coupon.discount_type === 'percentage') {
    discountAmount = Math.round((amount * coupon.discount_value) / 100);
  } else {
    discountAmount = coupon.discount_value;
  }

  // Ensure discount doesn't exceed amount
  discountAmount = Math.min(discountAmount, amount);

  return {
    valid: true,
    discountAmount,
    coupon,
  };
}

/**
 * Apply coupon and calculate final amount
 */
export async function applyCoupon(
  code: string,
  amount: number,
  courseType?: CourseType,
  client?: TypedSupabaseClient
): Promise<{
  valid: boolean;
  error?: string;
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
  coupon?: Coupon;
}> {
  const validation = await validateCoupon(code, amount, courseType, client);

  if (!validation.valid) {
    return {
      valid: false,
      error: validation.error,
      originalAmount: amount,
      discountAmount: 0,
      finalAmount: amount,
    };
  }

  return {
    valid: true,
    originalAmount: amount,
    discountAmount: validation.discountAmount!,
    finalAmount: amount - validation.discountAmount!,
    coupon: validation.coupon,
  };
}

// ============================================
// USAGE TRACKING
// ============================================

/**
 * Increment coupon usage count
 */
export async function incrementCouponUsage(
  couponId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  const supabase = client || getSupabaseAdminClient();

  const coupon = await getCouponById(couponId, supabase);
  if (!coupon) throw new Error('Coupon not found');

  const { error } = await (supabase
    .from('coupons') as any)
    .update({
      used_count: coupon.used_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', couponId);

  if (error) throw error;
}

// ============================================
// LIST QUERIES (Admin)
// ============================================

export interface ListCouponsOptions {
  isActive?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * List coupons
 */
export async function listCoupons(
  options: ListCouponsOptions = {},
  client?: TypedSupabaseClient
): Promise<{ coupons: Coupon[]; count: number }> {
  const supabase = client || getSupabaseAdminClient();

  const {
    isActive,
    limit = 50,
    offset = 0,
  } = options;

  let query = supabase
    .from('coupons')
    .select('*', { count: 'exact' });

  if (isActive !== undefined) {
    query = query.eq('is_active', isActive);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    coupons: data || [],
    count: count || 0,
  };
}

/**
 * List active coupons
 */
export async function listActiveCoupons(
  client?: TypedSupabaseClient
): Promise<Coupon[]> {
  const { coupons } = await listCoupons({ isActive: true }, client);
  return coupons;
}

// ============================================
// WRITE OPERATIONS (Admin only)
// ============================================

/**
 * Create a new coupon
 */
export async function createCoupon(
  couponData: Omit<Coupon, 'id' | 'created_at' | 'updated_at' | 'used_count'>,
  client?: TypedSupabaseClient
): Promise<Coupon> {
  const supabase = client || getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('coupons')
    .insert({
      ...couponData,
      code: couponData.code.toUpperCase(),
      used_count: 0,
    } as any)
    .select()
    .single();

  if (error) throw error;
  return data as Coupon;
}

/**
 * Update coupon
 */
export async function updateCoupon(
  couponId: string,
  updates: Partial<Omit<Coupon, 'id' | 'created_at' | 'updated_at'>>,
  client?: TypedSupabaseClient
): Promise<Coupon> {
  const supabase = client || getSupabaseAdminClient();

  const updateData: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (updates.code) {
    updateData.code = updates.code.toUpperCase();
  }

  const { data, error } = await (supabase as any)
    .from('coupons')
    .update(updateData)
    .eq('id', couponId)
    .select()
    .single();

  if (error) throw error;
  return data as Coupon;
}

/**
 * Deactivate coupon
 */
export async function deactivateCoupon(
  couponId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  await updateCoupon(couponId, { is_active: false }, client);
}

/**
 * Activate coupon
 */
export async function activateCoupon(
  couponId: string,
  client?: TypedSupabaseClient
): Promise<void> {
  await updateCoupon(couponId, { is_active: true }, client);
}
