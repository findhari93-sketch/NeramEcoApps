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

    const { leadProfileId, paymentScheme } = await request.json();

    // Get lead profile with fee details
    const { data: leadProfile, error: leadError } = await supabase
      .from('lead_profiles')
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

    let amount = leadProfile.final_fee;

    // For installment payment, calculate first installment (50%)
    if (paymentScheme === 'installment') {
      amount = Math.ceil(leadProfile.final_fee / 2);
    }

    // Convert to paise (Razorpay requires amount in smallest currency unit)
    const amountInPaise = Math.round(amount * 100);

    // Create Razorpay order
    const razorpay = getRazorpayClient();
    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `receipt_${leadProfileId}_${Date.now()}`,
      notes: {
        lead_profile_id: leadProfileId,
        user_id: user.id,
        payment_scheme: paymentScheme,
        installment_number: paymentScheme === 'installment' ? 1 : 0,
      },
    });

    // Store payment record
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      // @ts-ignore - Supabase types not generated
      .insert({
        lead_profile_id: leadProfileId,
        user_id: user.id,
        amount: amount,
        payment_method: 'razorpay',
        razorpay_order_id: order.id,
        status: 'pending',
        payment_scheme: paymentScheme,
        installment_number: paymentScheme === 'installment' ? 1 : null,
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
    console.error('Create order error:', error);
    return NextResponse.json(
      { error: 'Server Error', message: 'Failed to create payment order' },
      { status: 500 }
    );
  }
}
