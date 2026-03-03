// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * POST /api/coupon/validate
 *
 * Validates a coupon code for a specific student/lead profile.
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateCouponForUser } from '@neram/database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, leadProfileId, amount, courseType } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'Coupon code is required' },
        { status: 400 }
      );
    }

    if (!leadProfileId || typeof leadProfileId !== 'string') {
      return NextResponse.json(
        { valid: false, error: 'Lead profile ID is required' },
        { status: 400 }
      );
    }

    if (amount === undefined || amount === null || typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { valid: false, error: 'A valid amount is required' },
        { status: 400 }
      );
    }

    const result = await validateCouponForUser(
      code,
      leadProfileId,
      amount,
      courseType || undefined
    );

    if (!result.valid) {
      return NextResponse.json({ valid: false, error: result.error });
    }

    return NextResponse.json({
      valid: true,
      discountAmount: result.discountAmount,
      discountType: result.coupon?.discount_type,
      couponId: result.coupon?.id,
      code: result.coupon?.code,
    });
  } catch (error) {
    console.error('Coupon validation error:', error);
    return NextResponse.json(
      { valid: false, error: 'Failed to validate coupon' },
      { status: 500 }
    );
  }
}