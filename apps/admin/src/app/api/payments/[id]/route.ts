export const dynamic = 'force-dynamic';

// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@neram/database';

// GET /api/payments/[id] - Get a single payment with full details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseAdminClient();

    // Fetch payment with user join
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select(
        `
        *,
        user:users!payments_user_id_fkey(
          id, first_name, last_name, name, email, phone, avatar_url, user_type, status
        ),
        lead_profile:lead_profiles(
          id, interest_course, application_number, applicant_category,
          city, state, selected_course_id, learning_mode, status,
          assigned_fee, final_fee, payment_scheme, coupon_code, discount_amount
        )
      `
      )
      .eq('id', id)
      .single();

    if (paymentError) {
      if (paymentError.code === 'PGRST116') {
        // Try fallback without FK join
        return await fallbackGetPayment(id, supabase);
      }
      console.error('Payment fetch error:', paymentError);
      return NextResponse.json(
        { error: 'Failed to fetch payment' },
        { status: 500 }
      );
    }

    if (!payment) {
      return NextResponse.json(
        { error: 'Payment not found' },
        { status: 404 }
      );
    }

    // Fetch related installments if this payment has installment_number
    let installments = [];
    if (payment.lead_profile_id) {
      const { data: installmentData } = await supabase
        .from('payment_installments')
        .select('*')
        .eq('lead_profile_id', payment.lead_profile_id)
        .order('installment_number', { ascending: true });

      installments = installmentData || [];
    }

    // Fetch the course name if lead_profile has selected_course_id
    let courseName = null;
    if (payment.lead_profile?.selected_course_id) {
      const { data: course } = await supabase
        .from('courses')
        .select('name, course_type')
        .eq('id', payment.lead_profile.selected_course_id)
        .single();

      if (course) {
        courseName = course.name;
      }
    }

    // Fetch fee structure info if available (by lead_profile interest_course)
    let feeStructureName = null;
    if (payment.lead_profile?.interest_course) {
      const { data: feeStruct } = await supabase
        .from('fee_structures')
        .select('display_name')
        .eq('course_type', payment.lead_profile.interest_course)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (feeStruct) {
        feeStructureName = feeStruct.display_name;
      }
    }

    const user = payment.user;
    const leadProfile = payment.lead_profile;

    const response = {
      id: payment.id,
      user_id: payment.user_id,
      student_profile_id: payment.student_profile_id,
      lead_profile_id: payment.lead_profile_id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      payment_method: payment.payment_method,
      description: payment.description,

      // Razorpay details
      razorpay_order_id: payment.razorpay_order_id,
      razorpay_payment_id: payment.razorpay_payment_id,
      razorpay_signature: payment.razorpay_signature,
      razorpay_method: payment.razorpay_method,
      razorpay_bank: payment.razorpay_bank,
      razorpay_vpa: payment.razorpay_vpa,
      razorpay_card_last4: payment.razorpay_card_last4,
      razorpay_card_network: payment.razorpay_card_network,
      razorpay_fee: payment.razorpay_fee,
      razorpay_tax: payment.razorpay_tax,

      // Receipt
      receipt_number: payment.receipt_number,
      receipt_url: payment.receipt_url,

      // Screenshot
      screenshot_url: payment.screenshot_url,
      screenshot_verified: payment.screenshot_verified,
      verified_by: payment.verified_by,
      verified_at: payment.verified_at,
      verification_notes: payment.verification_notes,

      // Installment
      installment_number: payment.installment_number,

      // Failure
      failure_code: payment.failure_code,
      failure_reason: payment.failure_reason,

      // Timestamps
      paid_at: payment.paid_at,
      created_at: payment.created_at,
      updated_at: payment.updated_at,

      // Metadata
      metadata: payment.metadata,

      // User info
      student_name: user
        ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.name || 'Unknown'
        : 'Unknown',
      student_email: user?.email || null,
      student_phone: user?.phone || null,
      student_avatar: user?.avatar_url || null,
      student_user_type: user?.user_type || null,

      // Lead profile info
      interest_course: leadProfile?.interest_course || null,
      application_number: leadProfile?.application_number || null,
      applicant_category: leadProfile?.applicant_category || null,
      application_status: leadProfile?.status || null,
      assigned_fee: leadProfile?.assigned_fee || null,
      final_fee: leadProfile?.final_fee || null,
      payment_scheme: leadProfile?.payment_scheme || null,
      coupon_code: leadProfile?.coupon_code || null,
      discount_amount: leadProfile?.discount_amount || null,
      city: leadProfile?.city || null,
      state: leadProfile?.state || null,

      // Related data
      course_name: courseName,
      fee_structure_name: feeStructureName,
      installments,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error fetching payment detail:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch payment' },
      { status: 500 }
    );
  }
}

async function fallbackGetPayment(id: string, supabase: any) {
  // Fallback: fetch without FK join
  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to fetch payment' }, { status: 500 });
  }

  // Fetch user separately
  let user = null;
  if (payment.user_id) {
    const { data: userData } = await supabase
      .from('users')
      .select('id, first_name, last_name, name, email, phone, avatar_url, user_type, status')
      .eq('id', payment.user_id)
      .single();
    user = userData;
  }

  // Fetch lead profile separately
  let leadProfile = null;
  if (payment.lead_profile_id) {
    const { data: lpData } = await supabase
      .from('lead_profiles')
      .select('id, interest_course, application_number, applicant_category, city, state, selected_course_id, learning_mode, status, assigned_fee, final_fee, payment_scheme, coupon_code, discount_amount')
      .eq('id', payment.lead_profile_id)
      .single();
    leadProfile = lpData;
  } else if (payment.user_id) {
    const { data: lpData } = await supabase
      .from('lead_profiles')
      .select('id, interest_course, application_number, applicant_category, city, state, selected_course_id, learning_mode, status, assigned_fee, final_fee, payment_scheme, coupon_code, discount_amount')
      .eq('user_id', payment.user_id)
      .maybeSingle();
    leadProfile = lpData;
  }

  // Fetch installments
  let installments = [];
  const lpId = payment.lead_profile_id || leadProfile?.id;
  if (lpId) {
    const { data: installmentData } = await supabase
      .from('payment_installments')
      .select('*')
      .eq('lead_profile_id', lpId)
      .order('installment_number', { ascending: true });
    installments = installmentData || [];
  }

  // Course name
  let courseName = null;
  if (leadProfile?.selected_course_id) {
    const { data: course } = await supabase
      .from('courses')
      .select('name')
      .eq('id', leadProfile.selected_course_id)
      .single();
    if (course) courseName = course.name;
  }

  return NextResponse.json({
    id: payment.id,
    user_id: payment.user_id,
    student_profile_id: payment.student_profile_id,
    lead_profile_id: payment.lead_profile_id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    payment_method: payment.payment_method,
    description: payment.description,
    razorpay_order_id: payment.razorpay_order_id,
    razorpay_payment_id: payment.razorpay_payment_id,
    razorpay_signature: payment.razorpay_signature,
    razorpay_method: payment.razorpay_method,
    razorpay_bank: payment.razorpay_bank,
    razorpay_vpa: payment.razorpay_vpa,
    razorpay_card_last4: payment.razorpay_card_last4,
    razorpay_card_network: payment.razorpay_card_network,
    razorpay_fee: payment.razorpay_fee,
    razorpay_tax: payment.razorpay_tax,
    receipt_number: payment.receipt_number,
    receipt_url: payment.receipt_url,
    screenshot_url: payment.screenshot_url,
    screenshot_verified: payment.screenshot_verified,
    verified_by: payment.verified_by,
    verified_at: payment.verified_at,
    verification_notes: payment.verification_notes,
    installment_number: payment.installment_number,
    failure_code: payment.failure_code,
    failure_reason: payment.failure_reason,
    paid_at: payment.paid_at,
    created_at: payment.created_at,
    updated_at: payment.updated_at,
    metadata: payment.metadata,
    student_name: user
      ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.name || 'Unknown'
      : 'Unknown',
    student_email: user?.email || null,
    student_phone: user?.phone || null,
    student_avatar: user?.avatar_url || null,
    student_user_type: user?.user_type || null,
    interest_course: leadProfile?.interest_course || null,
    application_number: leadProfile?.application_number || null,
    applicant_category: leadProfile?.applicant_category || null,
    application_status: leadProfile?.status || null,
    assigned_fee: leadProfile?.assigned_fee || null,
    final_fee: leadProfile?.final_fee || null,
    payment_scheme: leadProfile?.payment_scheme || null,
    coupon_code: leadProfile?.coupon_code || null,
    discount_amount: leadProfile?.discount_amount || null,
    city: leadProfile?.city || null,
    state: leadProfile?.state || null,
    course_name: courseName,
    fee_structure_name: null,
    installments,
  });
}