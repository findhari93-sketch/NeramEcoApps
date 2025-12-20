// @ts-nocheck - Supabase types not generated
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@neram/database';
import crypto from 'crypto';

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

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      paymentId,
    } = await request.json();

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return NextResponse.json(
        { error: 'Verification Failed', message: 'Invalid payment signature' },
        { status: 400 }
      );
    }

    // Update payment record
    const { data: payment, error: updateError } = await supabase
      .from('payments')
      // @ts-ignore - Supabase types not generated
      .update({
        razorpay_payment_id,
        razorpay_signature,
        status: 'completed',
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', paymentId)
      .eq('user_id', user.id)
      .select(`
        *,
        lead_profiles(id, full_name, email, course_interest, payment_scheme, final_fee)
      `)
      .single();

    if (updateError) {
      console.error('Payment update error:', updateError);
      return NextResponse.json(
        { error: 'Database Error', message: 'Failed to update payment' },
        { status: 500 }
      );
    }

    // Update lead profile status
    const leadProfile = payment.lead_profiles;
    const isFullPayment = payment.payment_scheme === 'full' ||
      (payment.payment_scheme === 'installment' && payment.installment_number === 2);

    await supabase
      .from('lead_profiles')
      // @ts-ignore - Supabase types not generated
      .update({
        status: isFullPayment ? 'enrolled' : 'partial_payment',
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadProfile.id);

    // If installment payment, create next installment record
    if (payment.payment_scheme === 'installment' && payment.installment_number === 1) {
      const secondInstallmentAmount = leadProfile.final_fee - payment.amount;
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30); // Due in 30 days

      await supabase
        .from('payment_installments')
        // @ts-ignore - Supabase types not generated
        .insert({
          lead_profile_id: leadProfile.id,
          installment_number: 2,
          amount: secondInstallmentAmount,
          due_date: dueDate.toISOString().split('T')[0],
          reminder_date: new Date(dueDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days before
          status: 'pending',
        });
    }

    // If full payment completed, create student profile
    if (isFullPayment) {
      // Check if student profile exists
      const { data: existingStudent } = await supabase
        .from('student_profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!existingStudent) {
        await supabase
          .from('student_profiles')
          // @ts-ignore - Supabase types not generated
          .insert({
            user_id: user.id,
            lead_profile_id: leadProfile.id,
            status: 'active',
            enrollment_date: new Date().toISOString(),
          });
      }
    }

    // TODO: Send payment confirmation email
    // await sendEmail(leadProfile.email, 'payment-confirmation', {
    //   name: leadProfile.full_name,
    //   amount: payment.amount,
    //   course: leadProfile.course_interest,
    // });

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully',
      enrolled: isFullPayment,
      nextInstallmentDue: payment.payment_scheme === 'installment' && payment.installment_number === 1
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : null,
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    return NextResponse.json(
      { error: 'Server Error', message: 'Failed to verify payment' },
      { status: 500 }
    );
  }
}
