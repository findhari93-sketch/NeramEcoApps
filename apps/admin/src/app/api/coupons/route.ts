export const dynamic = 'force-dynamic';

// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server';
import {
  getSupabaseAdminClient,
  createUserSpecificCoupon,
  getCouponForLeadProfile,
  deactivateCoupon,
} from '@neram/database';

/**
 * GET /api/coupons?leadProfileId=xxx
 * Get the admin-generated coupon for a lead profile
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const leadProfileId = searchParams.get('leadProfileId');

    if (!leadProfileId) {
      return NextResponse.json(
        { error: 'leadProfileId is required' },
        { status: 400 }
      );
    }

    const coupon = await getCouponForLeadProfile(leadProfileId);

    return NextResponse.json({ coupon });
  } catch (error: any) {
    console.error('Get coupon error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get coupon' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/coupons
 * Create a user-specific coupon for a student
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      leadProfileId,
      adminId,
      discountType,
      discountValue,
      expiresInDays,
      description,
      courseType,
    } = body;

    if (!leadProfileId || !adminId || !discountValue) {
      return NextResponse.json(
        { error: 'leadProfileId, adminId, and discountValue are required' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdminClient();

    const coupon = await createUserSpecificCoupon({
      leadProfileId,
      createdBy: adminId,
      discountType: discountType || 'fixed',
      discountValue: Number(discountValue),
      expiresInDays: expiresInDays || 30,
      description,
      courseType,
    }, supabase);

    // Link coupon to lead profile
    await supabase
      .from('lead_profiles' as any)
      .update({
        admin_coupon_id: coupon.id,
        coupon_code: coupon.code,
      })
      .eq('id', leadProfileId);

    return NextResponse.json({ success: true, coupon });
  } catch (error: any) {
    console.error('Create coupon error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create coupon' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/coupons?couponId=xxx&leadProfileId=xxx
 * Deactivate a user-specific coupon
 */
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const couponId = searchParams.get('couponId');
    const leadProfileId = searchParams.get('leadProfileId');

    if (!couponId) {
      return NextResponse.json(
        { error: 'couponId is required' },
        { status: 400 }
      );
    }

    await deactivateCoupon(couponId);

    // Remove coupon reference from lead profile
    if (leadProfileId) {
      const supabase = getSupabaseAdminClient();
      await supabase
        .from('lead_profiles' as any)
        .update({
          admin_coupon_id: null,
          coupon_code: null,
        })
        .eq('id', leadProfileId);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete coupon error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to deactivate coupon' },
      { status: 500 }
    );
  }
}