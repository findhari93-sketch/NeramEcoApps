// @ts-nocheck
export const dynamic = 'force-dynamic';

/**
 * GET /api/payment/details?app=NERAM-1234
 *
 * Public (no-auth) API endpoint that returns fee details for an approved
 * application identified by its application number. Designed for the
 * shareable payment link flow where anyone with the link can pay.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@neram/database';

const COURSE_LABELS: Record<string, string> = {
  nata: 'NATA Preparation Course',
  jee_paper2: 'JEE Paper 2 Preparation Course',
  both: 'NATA & JEE Combined Course',
  not_sure: 'Architecture Entrance Course',
  revit: 'Revit Course',
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const applicationNumber = searchParams.get('app');

    if (!applicationNumber) {
      return NextResponse.json(
        { error: 'Missing application number', message: 'Please provide an application number using the ?app= parameter.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Fetch lead profile by application_number
    const { data: leadProfile, error: leadError } = await supabase
      .from('lead_profiles' as any)
      .select('*')
      .eq('application_number', applicationNumber)
      .is('deleted_at', null)
      .single();

    if (leadError || !leadProfile) {
      return NextResponse.json(
        { error: 'not_found', message: 'No application found with this number. Please check and try again.' },
        { status: 404 }
      );
    }

    // Only allow payment for approved applications
    const status = leadProfile.status as string;
    if (status === 'enrolled') {
      return NextResponse.json(
        { error: 'already_enrolled', message: 'This student is already enrolled. No further payment is needed.' },
        { status: 400 }
      );
    }

    if (status === 'rejected') {
      return NextResponse.json(
        { error: 'rejected', message: 'This application has been rejected. Please contact support for assistance.' },
        { status: 400 }
      );
    }

    if (status === 'draft' || status === 'pending_verification' || status === 'submitted' || status === 'under_review') {
      return NextResponse.json(
        { error: 'not_approved', message: 'This application is still being reviewed. Payment will be available once approved.' },
        { status: 400 }
      );
    }

    if (status !== 'approved' && status !== 'partial_payment') {
      return NextResponse.json(
        { error: 'invalid_status', message: 'This application is not ready for payment. Please contact support.' },
        { status: 400 }
      );
    }

    // Check if fee has been assigned
    if (!leadProfile.final_fee) {
      return NextResponse.json(
        { error: 'fee_not_assigned', message: 'Fees have not been assigned yet. Please wait for admin review.' },
        { status: 400 }
      );
    }

    // Check for existing paid payment (prevent double payment)
    const { data: existingPayments } = await supabase
      .from('payments' as any)
      .select('id, amount, status, payment_scheme, installment_number, receipt_number, razorpay_payment_id, paid_at')
      .eq('lead_profile_id', leadProfile.id)
      .in('status', ['paid', 'completed']);

    const totalPaid = (existingPayments || [])
      .reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    // For full payment, if already paid the full amount, block
    if (totalPaid >= (leadProfile.final_fee as number)) {
      return NextResponse.json(
        { error: 'already_paid', message: 'Payment has already been completed for this application.' },
        { status: 400 }
      );
    }

    // Get student's first name from users table (minimal PII)
    const { data: userRecord } = await (supabase
      .from('users') as any)
      .select('first_name, name')
      .eq('id', leadProfile.user_id)
      .single();

    const studentFirstName = userRecord?.first_name || (userRecord?.name ? userRecord.name.split(' ')[0] : 'Student');

    // Compute fee breakdown
    const baseFee = leadProfile.assigned_fee || leadProfile.final_fee || 0;
    const finalFee = (leadProfile.final_fee as number);
    const fullPaymentDiscount = leadProfile.full_payment_discount || 0;
    const fullPaymentAmount = finalFee - fullPaymentDiscount;
    const scholarshipDiscount = leadProfile.discount_amount || 0;

    const installment1Amount = leadProfile.installment_1_amount
      ? Number(leadProfile.installment_1_amount)
      : Math.ceil(finalFee * 0.55);
    const installment2Amount = leadProfile.installment_2_amount
      ? Number(leadProfile.installment_2_amount)
      : (finalFee - installment1Amount);
    const installment2DueDays = leadProfile.installment_2_due_days || 45;
    const allowedPaymentModes = leadProfile.allowed_payment_modes || 'full_and_installment';

    return NextResponse.json({
      leadProfileId: leadProfile.id,
      studentFirstName,
      courseName: COURSE_LABELS[leadProfile.interest_course] || 'Architecture Entrance Course',
      baseFee,
      finalFee,
      scholarshipDiscount,
      fullPaymentDiscount,
      fullPaymentAmount,
      installment1Amount,
      installment2Amount,
      installment2DueDays,
      allowedPaymentModes,
      paymentDeadline: leadProfile.payment_deadline || null,
      couponCode: leadProfile.coupon_code || null,
      totalPaid,
      remainingAmount: finalFee - totalPaid,
      status,
    });
  } catch (error: any) {
    console.error('Public payment details error:', error);
    return NextResponse.json(
      { error: 'server_error', message: 'Something went wrong. Please try again later.' },
      { status: 500 }
    );
  }
}
