// @ts-nocheck
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';
import { verifyFirebaseToken } from '../../../_lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { leadId: string } }
) {
  try {
    const auth = await verifyFirebaseToken(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createAdminClient();

    // Get lead profile with fee details
    const { data: leadProfile, error } = await supabase
      .from('lead_profiles' as any)
      .select('*')
      .eq('id', params.leadId)
      .eq('user_id', auth.userId)
      .single();

    if (error || !leadProfile) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Get existing payments
    const { data: payments } = await supabase
      .from('payments' as any)
      .select('*')
      .eq('lead_profile_id', params.leadId)
      .eq('user_id', auth.userId)
      .order('created_at', { ascending: false });

    // Get pending installments
    const { data: installments } = await supabase
      .from('payment_installments' as any)
      .select('*')
      .eq('lead_profile_id', params.leadId)
      .order('installment_number', { ascending: true });

    const baseFee = leadProfile.assigned_fee || leadProfile.final_fee || 16500;
    const finalFee = leadProfile.final_fee || baseFee;
    const fullPaymentDiscount = leadProfile.full_payment_discount || 5000;
    const paymentRecommendation = leadProfile.payment_recommendation || 'full';
    const totalPaid = (payments || [])
      .filter((p: any) => p.status === 'paid' || p.status === 'completed')
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    const COURSE_LABELS: Record<string, string> = {
      nata: 'NATA Preparation Course',
      jee_paper2: 'JEE Paper 2 Preparation Course',
      both: 'NATA & JEE Combined Course',
      not_sure: 'Architecture Entrance Course',
    };

    const installment1Amount = leadProfile.installment_1_amount
      ? Number(leadProfile.installment_1_amount)
      : Math.ceil(finalFee * 0.55);
    const installment2Amount = leadProfile.installment_2_amount
      ? Number(leadProfile.installment_2_amount)
      : (finalFee - installment1Amount);
    const installment2DueDays = leadProfile.installment_2_due_days || 45;
    const allowedPaymentModes = leadProfile.allowed_payment_modes || 'full_and_installment';

    // Get user contact info for Razorpay prefill
    const { data: userRecord } = await (supabase
      .from('users') as any)
      .select('email, phone, first_name, last_name')
      .eq('id', auth.userId)
      .single();

    const userName = [userRecord?.first_name, userRecord?.last_name].filter(Boolean).join(' ') || auth.name || '';
    const userEmail = userRecord?.email || auth.email || '';
    const userPhone = userRecord?.phone || leadProfile.application_data?.phone || '';

    return NextResponse.json({
      leadProfileId: leadProfile.id,
      courseName: COURSE_LABELS[leadProfile.interest_course] || 'Architecture Entrance Course',
      status: leadProfile.status,
      baseFee,
      finalFee,
      fullPaymentDiscount,
      fullPaymentAmount: finalFee - fullPaymentDiscount,
      installment1Amount,
      installment2Amount,
      installment2DueDays,
      allowedPaymentModes,
      paymentRecommendation,
      paymentScheme: leadProfile.payment_scheme || 'full',
      paymentDeadline: leadProfile.payment_deadline || null,
      totalPaid,
      remainingAmount: finalFee - totalPaid,
      payments: payments || [],
      installments: installments || [],
      scholarshipDiscount: leadProfile.discount_amount || 0,
      couponCode: leadProfile.coupon_code || null,
      adminCouponCode: leadProfile.coupon_code || null,
      hasCoupon: !!leadProfile.coupon_code,
      // User contact info for Razorpay prefill
      userName,
      userEmail,
      userPhone,
    });
  } catch (error: any) {
    console.error('Payment details error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}