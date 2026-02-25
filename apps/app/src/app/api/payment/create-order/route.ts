// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@neram/database';
import Razorpay from 'razorpay';

// Lazy initialization to avoid build-time errors when API keys are not set
let razorpayClient: Razorpay | null = null;

function getRazorpayClient(): Razorpay {
  if (!razorpayClient) {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET environment variables are required');
    }
    razorpayClient = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpayClient;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'You must be logged in' },
        { status: 401 }
      );
    }

    const { leadProfileId, paymentScheme, couponCode, couponDiscount, youtubeDiscount } = await request.json();

    // Get lead profile with fee details
    const { data: leadProfile, error: leadError } = await supabase
      .from('lead_profiles' as any)
      .select(`
        *,
        scholarship_applications(scholarship_percentage, verification_status)
      `)
      .eq('id', leadProfileId)
      .eq('user_id', user.id)
      .single();

    if (leadError || !leadProfile) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Lead profile not found' },
        { status: 404 }
      );
    }

    if (!leadProfile.final_fee) {
      return NextResponse.json(
        { error: 'Bad Request', message: 'Fee not assigned yet. Please wait for admin approval.' },
        { status: 400 }
      );
    }

    // Calculate base amount from fee structure
    let baseAmount = leadProfile.final_fee;

    if (paymentScheme === 'full' && leadProfile.full_payment_discount) {
      baseAmount = leadProfile.final_fee - leadProfile.full_payment_discount;
    }

    if (paymentScheme === 'installment') {
      baseAmount = leadProfile.installment_1_amount
        ? Number(leadProfile.installment_1_amount)
        : Math.ceil(leadProfile.final_fee * 0.55);
    }

    // Validate and apply coupon discount server-side
    let validatedCouponDiscount = 0;
    if (couponCode && couponDiscount > 0) {
      const { data: coupon } = await supabase
        .from('coupons' as any)
        .select('*')
        .eq('code', couponCode)
        .eq('is_active', true)
        .single();

      if (coupon) {
        if (coupon.discount_type === 'percentage') {
          validatedCouponDiscount = Math.round(leadProfile.final_fee * (coupon.discount_value / 100));
        } else {
          validatedCouponDiscount = coupon.discount_value;
        }
        if (coupon.max_discount && validatedCouponDiscount > coupon.max_discount) {
          validatedCouponDiscount = coupon.max_discount;
        }
      }
    }

    // Validate YouTube discount (max ₹50)
    const validatedYoutubeDiscount = youtubeDiscount > 0 ? Math.min(Number(youtubeDiscount), 50) : 0;

    // Apply discounts
    const totalDiscounts = validatedCouponDiscount + validatedYoutubeDiscount;
    const amount = Math.max(1, baseAmount - totalDiscounts);

    const amountInPaise = Math.round(amount * 100);

    // Create Razorpay order (receipt max 40 chars)
    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${leadProfileId.substring(0, 8)}_${Date.now()}`,
      notes: {
        lead_profile_id: leadProfileId,
        user_id: user.id,
        payment_scheme: paymentScheme,
        installment_number: String(paymentScheme === 'installment' ? 1 : 0),
        coupon_code: couponCode || '',
        coupon_discount: String(validatedCouponDiscount),
        youtube_discount: String(validatedYoutubeDiscount),
      },
    });

    // Store payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments' as any)
      .insert({
        lead_profile_id: leadProfileId,
        user_id: user.id,
        amount: amount,
        payment_method: 'razorpay',
        razorpay_order_id: order.id,
        status: 'pending',
        payment_scheme: paymentScheme,
        installment_number: paymentScheme === 'installment' ? 1 : null,
        metadata: totalDiscounts > 0 ? {
          coupon_code: couponCode || null,
          coupon_discount: validatedCouponDiscount,
          youtube_discount: validatedYoutubeDiscount,
          base_amount: baseAmount,
          total_discounts: totalDiscounts,
        } : null,
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Payment record error:', paymentError);
      return NextResponse.json(
        { error: 'Database Error', message: 'Failed to create payment record' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      paymentId: payment.id,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    console.error('Create order error:', errorMessage);
    return NextResponse.json(
      { error: 'Server Error', message: 'Failed to create payment order' },
      { status: 500 }
    );
  }
}
